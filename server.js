import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import express from 'express';
import * as cookie from 'cookie';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { Server } from 'socket.io';

const { Pool } = pg;
const __dirname = import.meta.dirname;
const standalone = process.argv[1] && path.basename(process.argv[1]) === 'server.js'
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (standalone) {
  try {
    process.loadEnvFile('.env');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

const PORT = Number(process.env.PORT) || 10000;
const JWT_SECRET = process.env.JWT_SECRET;
const isProduction = process.env.NODE_ENV === 'production';
if (!JWT_SECRET) throw new Error('JWT_SECRET is required.');

let pool;
function connectDatabase(connectionString, { secureCookies = isProduction } = {}) {
  if (!connectionString) throw new Error('A PostgreSQL connection string is required.');
  sessionOptions.secure = secureCookies;
  pool = new Pool({ connectionString, max: 8, idleTimeoutMillis: 30000, connectionTimeoutMillis: 8000 });
  pool.on('error', error => console.error('PostgreSQL connection lost:', error.code || error.name));
}
const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '48kb' }));

const sessionCookie = 'hero_clash_session';
const sessionOptions = { httpOnly: true, secure: isProduction, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 14 };
const connectedUsers = new Map();
const invites = new Map();
const pvpRooms = new Map();
const activeMatches = new Map();
const authAttempts = new Map();
const ARENA_COVERS = {
  foundry: [[.25,.22,.13,.07],[.62,.22,.13,.07],[.40,.46,.20,.07],[.20,.70,.14,.07],[.66,.70,.14,.07]],
  frost: [[.12,.34,.17,.06],[.71,.34,.17,.06],[.35,.18,.10,.09],[.55,.60,.12,.08],[.20,.73,.12,.07],[.69,.73,.12,.07]],
  grove: [[.22,.20,.12,.08],[.66,.20,.12,.08],[.38,.35,.24,.07],[.12,.62,.17,.07],[.71,.62,.17,.07],[.42,.77,.16,.06]],
};
function blockedOnMap(mapId, x, y, radius = .018) {
  return (ARENA_COVERS[mapId] || []).some(([cx,cy,cw,ch]) => x+radius>cx && x-radius<cx+cw && y+radius>cy && y-radius<cy+ch);
}
function lineBlockedOnMap(mapId, x1, y1, x2, y2) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x2-x1,y2-y1)/.015));
  for (let i=1;i<steps;i++) {
    const t=i/steps;
    if (blockedOnMap(mapId,x1+(x2-x1)*t,y1+(y2-y1)*t,0)) return true;
  }
  return false;
}

function defaultProfile(name) {
  return {
    name, onboarded: false, theme: 'light', level: 1, xp: 0, coins: 120, passXp: 0, skillPoints: 0, progressionVersion: 2,
    hair: '#60483f', hairStyle: 'short', face: '🙂', skinTone: 'warm', makeup: 'natural',
    owned: ['Standard-Outfit', 'Trainingsklinge', 'Camp-Weste', 'Camp-Stiefel'], weapon: 'Trainingsklinge', armor: 'Camp-Weste', boots: 'Camp-Stiefel',
    cosmetics: { head: '', face: '', body: '', feet: '' },
    skills: { health: 0, might: 0, precision: 0, dodge: 0, quickstep: 0, focus: 0, luck: 0 },
    stats: { wins: 0, knockouts: 0, pvpWins: 0, hardWins: 0, bossMaps: [] },
    daily: { date: new Date().toISOString().slice(0, 10), claims: [], kills: 0, wins: 0, xp: 0 },
    weaponQuestClaims: [], weaponSources: {}, passClaims: [], soundEnabled: true, musicEnabled: true,
    effectsVolume: 0.45, musicVolume: 0.18, reducedMotion: false,
  };
}

function authLimiter(req, res, next) {
  const now = Date.now();
  const key = req.ip || 'unknown';
  const current = authAttempts.get(key);
  if (!current || now - current.start > 10 * 60 * 1000) {
    authAttempts.set(key, { start: now, count: 1 });
    return next();
  }
  if (current.count >= 20) return res.status(429).json({ error: 'Zu viele Versuche. Bitte warte kurz.' });
  current.count++;
  next();
}

function setSession(res, userId) {
  const token = jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '14d' });
  res.setHeader('Set-Cookie', cookie.serialize(sessionCookie, token, sessionOptions));
}

function clearSession(res) {
  res.setHeader('Set-Cookie', cookie.serialize(sessionCookie, '', { ...sessionOptions, expires: new Date(0), maxAge: 0 }));
}

async function authenticate(req, res, next) {
  const token = cookie.parse(req.headers.cookie || '')[sessionCookie];
  if (!token) return res.status(401).json({ error: 'Bitte melde dich an.' });
  let userId;
  try {
    userId = jwt.verify(token, JWT_SECRET).sub;
  } catch {
    return res.status(401).json({ error: 'Sitzung nicht mehr gültig.' });
  }
  try {
    const result = await pool.query('SELECT id, username, email, profile, profile_version, last_seen_update FROM accounts WHERE id = $1', [userId]);
    if (!result.rowCount) return res.status(401).json({ error: 'Sitzung nicht mehr gültig.' });
    req.account = result.rows[0];
    next();
  } catch {
    res.status(503).json({ error: 'Konten sind gerade nicht erreichbar.' });
  }
}

function publicAccount(account) {
  return { id: account.id, username: account.username, email: account.email };
}

function displayName(profile, username) {
  return typeof profile?.name === 'string' && profile.name.trim() ? profile.name.trim().slice(0, 18) : username;
}

function accountRoom(userId) { return 'account:' + userId; }

async function acceptedFriendIds(userId) {
  const result = await pool.query('SELECT DISTINCT friend_id FROM friendships WHERE user_id = $1 AND status = $2', [userId, 'accepted']);
  return result.rows.map(row => row.friend_id);
}

function publishPresence(userId, online) {
  acceptedFriendIds(userId).then(ids => {
    for (const id of ids) io.to(accountRoom(id)).emit('friend:presence', { userId, online });
  }).catch(error => console.error('Presence update failed:', error.message));
}

function publishFriendship(leftId, rightId) {
  io.to(accountRoom(leftId)).emit('friends:refresh');
  io.to(accountRoom(rightId)).emit('friends:refresh');
  io.to(accountRoom(leftId)).emit('friend:presence', { userId: rightId, online: connectedUsers.has(rightId) });
  io.to(accountRoom(rightId)).emit('friend:presence', { userId: leftId, online: connectedUsers.has(leftId) });
}

function publicPlayer(player) {
  return {
    userId: player.userId, username: player.username, name: player.name, x: player.x, y: player.y,
    hp: player.hp, maxHp: player.maxHp, weaponModel: player.weaponModel, weapon: player.weapon, ammo: player.ammo,
    magazine: player.magazine, maxMagazine: player.maxMagazine, reloadingUntil: player.reloadingUntil,
    movementSpeed: player.movementSpeed, hair: player.hair,
    bootsModel: player.bootsModel,
    weaponDamage: player.weaponDamage, weaponRange: player.weaponRange, weaponCooldown: player.weaponCooldown,
    weaponSplash: player.weaponSplash, weaponCrit: player.weaponCrit, weaponSpeed: player.weaponSpeed,
    armorResist: player.armorResist, precision: player.precision, might: player.might, dodgeSkill: player.dodgeSkill,
    hairStyle: player.hairStyle, skinTone: player.skinTone, armorModel: player.armorModel,
    bodyModel: player.bodyModel, feetModel: player.feetModel, headModel: player.headModel, faceModel: player.faceModel, move: player.move,
    aim: player.aim, attackAnim: player.attackAnim, hitFlash: player.hitFlash,
  };
}

function roomSnapshot(room) {
  return {
    matchId: room.id, mode: room.mode, mapId: room.mapId, players: room.players.map(publicPlayer),
    projectiles: room.projectiles.map(({ x, y, splash }) => ({ x, y, splash, owner: 'player', r: splash ? 8 : 5 })),
  };
}

function hitDuelPlayer(room, shooter, target, damage, critical, now) {
  let result = critical ? 'critical' : 'hit';
  if (target.dodgingUntil > now || Math.random() < Math.min(.55, .10 + target.dodgeSkill * .10)) {
    damage = 0;
    result = 'dodge';
  } else {
    damage = Math.max(1, Math.round(damage * (1 - target.armorResist)));
    target.hp = Math.max(0, target.hp - damage);
    target.hitFlash = .18;
  }
  io.to(room.id).emit('pvp:attack-result', { attackerId: shooter.userId, targetId: target.userId, result, damage });
}

function updateDuelShots(room, now) {
  room.projectiles = room.projectiles.filter(shot => {
    const target = room.players.find(player => player !== shot.shooter);
    for (let step = 0; step < 4; step++) {
      const distance = Math.min(shot.remaining, shot.speed * .0125);
      shot.x += shot.aim.x * distance;
      shot.y += shot.aim.y * distance;
      shot.remaining -= distance;
      const blocked = blockedOnMap(room.mapId, shot.x, shot.y, .007);
      const outside = shot.x < 0 || shot.x > 1 || shot.y < 0 || shot.y > 1;
      const gap = Math.hypot(target.x - shot.x, target.y - shot.y);
      const hit = !blocked && gap < .034;
      if (!hit && !blocked && !outside && shot.remaining > 0) continue;
      if (shot.splash) io.to(room.id).emit('pvp:blast', { x:shot.x, y:shot.y, r:shot.splash });
      if (target.hp > 0 && (hit || (gap < shot.splash && !lineBlockedOnMap(room.mapId, shot.x, shot.y, target.x, target.y)))) {
        hitDuelPlayer(room, shot.shooter, target, shot.damage * (hit ? 1 : .58), shot.critical, now);
      }
      return false;
    }
    return true;
  });
}

function endPvpRoom(room, winnerId, reason) {
  if (!room || room.finished) return;
  room.finished = true;
  clearInterval(room.timer);
  io.to(room.id).emit('pvp:finished', { winnerId: winnerId || null, reason });
  if (winnerId) {
    pool.query("UPDATE accounts SET profile = jsonb_set(profile, '{stats}', jsonb_set(COALESCE(profile->'stats', '{}'::jsonb), '{pvpWins}', to_jsonb((CASE WHEN COALESCE(profile->'stats'->>'pvpWins','') ~ '^[0-9]+$' THEN (profile->'stats'->>'pvpWins')::integer ELSE 0 END) + 1), true), true) WHERE id = $1", [winnerId])
      .catch(error => console.error('PvP win save failed:', error.message));
  }
  for (const player of room.players) {
    if (activeMatches.get(player.userId) === room.id) activeMatches.delete(player.userId);
    const socket = io.sockets.sockets.get(player.socketId);
    if (socket) {
      socket.matchId = null;
      socket.leave(room.id);
    }
  }
  setTimeout(() => pvpRooms.delete(room.id), 15000);
}

function normalizedMove(value) {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return { x: 0, y: 0 };
  let x = Math.max(-1, Math.min(1, value.x));
  let y = Math.max(-1, Math.min(1, value.y));
  const length = Math.hypot(x, y);
  if (length > 1) { x /= length; y /= length; }
  return { x, y };
}

function makePlayer(account, socketId, start) {
  const profile = account.profile || defaultProfile(account.username);
  const owned = new Set(Array.isArray(profile.owned) ? profile.owned : []);
  owned.add('Trainingsklinge');
  owned.add('Camp-Weste');
  owned.add('Camp-Stiefel');
  const weaponConfig = {
    'Trainingsklinge': {model:'sword',damage:11,crit:0,speed:1,range:.17,cooldown:620,mag:0,reserve:0,reload:0,splash:0},
    'Kupfer-Säbel': {model:'sabre',damage:13,crit:.05,speed:1.05,range:.19,cooldown:520,mag:0,reserve:0,reload:0,splash:0},
    'Sternenstab': {model:'staff',damage:10,crit:.12,speed:.92,range:.23,cooldown:700,mag:0,reserve:0,reload:0,splash:0},
    'Mondlanze': {model:'spear',damage:16,crit:.08,speed:.86,range:.22,cooldown:780,mag:0,reserve:0,reload:0,splash:0},
    'Impulsblaster': {model:'blaster',damage:18,crit:.08,speed:1,range:.8,cooldown:320,mag:8,reserve:48,reload:1250,splash:0},
    'Splitterkanone': {model:'rifle',damage:10,crit:.05,speed:1.15,range:.9,cooldown:150,mag:24,reserve:144,reload:1700,splash:0},
    'Kometenwerfer': {model:'launcher',damage:34,crit:.1,speed:.8,range:.72,cooldown:820,mag:4,reserve:24,reload:1900,splash:.15},
  };
  const requestedWeapon = Object.hasOwn(weaponConfig, profile.weapon) ? profile.weapon : 'Trainingsklinge';
  const weapon = owned.has(requestedWeapon) ? requestedWeapon : 'Trainingsklinge';
  const requestedArmor = ['Camp-Weste', 'Lederweste', 'Wächterpanzer', 'Schattenrüstung'].includes(profile.armor) ? profile.armor : 'Camp-Weste';
  const armor = owned.has(requestedArmor) ? requestedArmor : 'Camp-Weste';
  const skillCaps = { health: 3, might: 3, precision: 3, dodge: 2, quickstep: 3, focus: 2, luck: 3, mastery: 2 };
  const skills = Object.fromEntries(Object.entries(skillCaps).map(([id, cap]) => [id, Math.max(0, Math.min(cap, Math.floor(Number(profile.skills?.[id]) || 0)))]));
  const armorHp = { 'Lederweste': 18, 'Wächterpanzer': 36, 'Schattenrüstung': 22 }[armor] || 0;
  const hp = (start.baseHp || 100) + skills.health * 15 + armorHp;
  const requestedBoots = ['Camp-Stiefel','Leichtstiefel','Sturmstiefel'].includes(profile.boots) ? profile.boots : 'Camp-Stiefel';
  const activeBoots = owned.has(requestedBoots) ? requestedBoots : 'Camp-Stiefel';
  const selectedWeapon = weaponConfig[weapon];
  const safeCosmetics = profile.cosmetics && typeof profile.cosmetics === 'object' ? profile.cosmetics : {};
  const bodyModel = owned.has(safeCosmetics.body) ? ({ 'Sternen-Hoodie': 'hoodie', 'Nebeljacke': 'jacket' }[safeCosmetics.body] || 'shirt') : 'shirt';
  const feetModel = owned.has(safeCosmetics.feet) && ['Neon-Sneaker', 'Sternen-Schuhe'].includes(safeCosmetics.feet) ? 'shoes' : 'boots';
  const headModel = owned.has(safeCosmetics.head) ? ({ 'Wolkenmütze': 'hat', 'Mondkrone': 'crown' }[safeCosmetics.head] || '') : '';
  const faceModel = owned.has(safeCosmetics.face) && safeCosmetics.face === 'Cooler Blick' ? 'glasses' : '';
  return {
    userId: account.id, username: account.username, name: displayName(profile, account.username), socketId,
    x: start.x, y: start.y, hp, maxHp: hp, armor: profile.armor,
    movementSpeed: activeBoots==='Sturmstiefel'?1.22:activeBoots==='Leichtstiefel'?1.12:1,
    bootsModel: activeBoots==='Sturmstiefel'?'storm':activeBoots==='Leichtstiefel'?'light':'standard',
    armorModel: { 'Lederweste': 'leather', 'Wächterpanzer': 'plate', 'Schattenrüstung': 'shadow' }[armor] || 'vest',
    bodyModel, feetModel, headModel, faceModel,
    armorResist: { 'Lederweste': 0.08, 'Wächterpanzer': 0.17, 'Schattenrüstung': 0.1 }[armor] || 0,
    weapon, weaponModel: selectedWeapon.model, weaponDamage:selectedWeapon.damage, weaponSpeed:selectedWeapon.speed,
    weaponRange:selectedWeapon.range, weaponCooldown:selectedWeapon.cooldown, weaponSplash:selectedWeapon.splash, weaponCrit:selectedWeapon.crit,
    maxMagazine:selectedWeapon.mag, magazine:selectedWeapon.mag, ammo:selectedWeapon.reserve, reloadMs:selectedWeapon.reload, reloadingUntil:0,
    precision: skills.precision, might: skills.might, mastery: skills.mastery,
    dodgeSkill: skills.dodge + skills.quickstep * 0.4, hair: /^#[0-9a-f]{6}$/i.test(profile.hair || '') ? profile.hair : '#60483f',
    hairStyle: ['short', 'long', 'curls', 'bob', 'ponytail', 'sidecut'].includes(profile.hairStyle) ? profile.hairStyle : 'short',
    skinTone: ['light', 'warm', 'olive', 'deep'].includes(profile.skinTone) ? profile.skinTone : 'warm',
    move: { x: 0, y: 0 }, aim: { x: start.x < .5 ? 1 : -1, y: 0 }, nextAttack: 0, attackAnim: 0, hitFlash: 0, dodgingUntil: 0, dodgeReadyAt: 0,
  };
}

app.post('/api/auth/register', authLimiter, async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!/^[A-Za-z0-9_]{3,18}$/.test(username)) {
    return res.status(400).json({ error: 'Der Benutzername braucht 3–18 Zeichen (Buchstaben, Zahlen oder _).' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Bitte gib eine gültige E-Mail-Adresse ein.' });
  }
  if (password.length < 10 || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ error: 'Das Passwort muss 10–72 Zeichen lang sein.' });
  }
  try {
    const profile = defaultProfile(username);
    const result = await pool.query(
      'INSERT INTO accounts (id, username, email, password_hash, profile) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, email, profile',
      [crypto.randomUUID(), username, email, await bcrypt.hash(password, 12), profile],
    );
    const account = result.rows[0];
    setSession(res, account.id);
    res.status(201).json({ user: publicAccount(account), profile: account.profile, profileVersion: 0 });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Benutzername oder E-Mail ist bereits vergeben.' });
    console.error('Registration failed:', error.message);
    res.status(500).json({ error: 'Konto konnte gerade nicht erstellt werden.' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const login = String(req.body?.login || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  try {
    const result = await pool.query(
      'SELECT id, username, email, password_hash, profile, profile_version FROM accounts WHERE lower(username) = $1 OR lower(email) = $1 LIMIT 1',
      [login],
    );
    const account = result.rows[0];
    if (!account || !(await bcrypt.compare(password, account.password_hash))) {
      return res.status(401).json({ error: 'Benutzername/E-Mail oder Passwort stimmt nicht.' });
    }
    setSession(res, account.id);
    res.json({ user: publicAccount(account), profile: account.profile, profileVersion: account.profile_version });
  } catch (error) {
    console.error('Login failed:', error.message);
    res.status(500).json({ error: 'Anmeldung gerade nicht möglich.' });
  }
});

app.get('/api/auth/me', authenticate, (req, res) => {
  res.json({ user: publicAccount(req.account), profile: req.account.profile, profileVersion: req.account.profile_version });
});
app.post('/api/auth/logout', (_req, res) => { clearSession(res); res.json({ ok: true }); });

app.put('/api/profile', authenticate, async (req, res) => {
  const { profile, version, writeId } = req.body || {};
  if (!profile || typeof profile !== 'object' || Array.isArray(profile) || typeof profile.stats !== 'object' || !profile.stats || Array.isArray(profile.stats)) return res.status(400).json({ error: 'Ungültiger Spielstand.' });
  if (!Number.isSafeInteger(version) || version < 0 || typeof writeId !== 'string' || !/^[a-z0-9-]{10,80}$/i.test(writeId)) return res.status(400).json({ error: 'Ungültige Spielstandversion.' });
  if (Buffer.byteLength(JSON.stringify(profile), 'utf8') > 32768) return res.status(413).json({ error: 'Der Spielstand ist zu groß.' });
  try {
    const saved = await pool.query(
      "UPDATE accounts SET profile = jsonb_set($1::jsonb, '{stats,pvpWins}', COALESCE(profile #> '{stats,pvpWins}', '0'::jsonb), true), profile_version = profile_version + 1, profile_writes = array_prepend($4::text, profile_writes[1:31]) WHERE id = $2 AND profile_version = $3 AND NOT ($4 = ANY(profile_writes)) RETURNING profile, profile_version",
      [profile, req.account.id, version, writeId],
    );
    if (saved.rowCount) return res.json({ profile: saved.rows[0].profile, profileVersion: saved.rows[0].profile_version });
    const { rows: [latest] } = await pool.query('SELECT profile, profile_version, $2 = ANY(profile_writes) AS applied FROM accounts WHERE id = $1', [req.account.id, writeId]);
    if (!latest) return res.status(401).json({ error: 'Sitzung nicht mehr gültig.' });
    res.status(latest.applied ? 200 : 409).json({ profile: latest.profile, profileVersion: latest.profile_version });
  } catch (error) {
    console.error('Profile save failed:', error.message);
    res.status(500).json({ error: 'Spielstand konnte nicht gespeichert werden.' });
  }
});

app.get('/api/leaderboard', authenticate, async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT username, LEFT(COALESCE(NULLIF(profile->>'name',''), username), 18) AS name,
        CASE WHEN profile->>'level' ~ '^[0-9]{1,9}$' THEN LEAST((profile->>'level')::integer, 9999) ELSE 1 END AS level,
        CASE WHEN profile #>> '{stats,wins}' ~ '^[0-9]{1,9}$' THEN (profile #>> '{stats,wins}')::integer ELSE 0 END AS wins,
        CASE WHEN profile #>> '{stats,pvpWins}' ~ '^[0-9]{1,9}$' THEN (profile #>> '{stats,pvpWins}')::integer ELSE 0 END AS pvp_wins
      FROM accounts ORDER BY level DESC, pvp_wins DESC, wins DESC, lower(username) ASC
    `);
    res.json({ players: result.rows });
  } catch (error) {
    console.error('Leaderboard failed:', error.message);
    res.status(500).json({ error: 'Bestenliste gerade nicht verfügbar.' });
  }
});

app.get('/api/updates/unseen', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, version, title, body, created_at FROM update_announcements WHERE id > $1 ORDER BY id ASC', [req.account.last_seen_update || 0]);
    res.json({ updates: result.rows });
  } catch (error) {
    console.error('Update vlog failed:', error.message);
    res.status(500).json({ error: 'Update-Info gerade nicht verfügbar.' });
  }
});

app.post('/api/updates/seen', authenticate, async (req, res) => {
  const id = Number(req.body?.id);
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) return res.status(400).json({ error: 'Ungültige Update-ID.' });
  await pool.query('UPDATE accounts SET last_seen_update = GREATEST(last_seen_update, $1) WHERE id = $2 AND EXISTS (SELECT 1 FROM update_announcements WHERE id = $1)', [id, req.account.id]);
  res.json({ ok: true });
});

app.get('/api/friends', authenticate, async (req, res) => {
  try {
    const query = "SELECT CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END AS id, a.username, a.profile->>'name' AS name, f.status, f.user_id = $1 AS outgoing " +
      'FROM friendships f JOIN accounts a ON a.id = CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END ' +
      'WHERE (f.user_id = $1 OR f.friend_id = $1) ORDER BY a.username';
    const result = await pool.query(query, [req.account.id]);
    const data = { friends: [], incoming: [], outgoing: [] };
    for (const row of result.rows) {
      const item = { id: row.id, username: row.username, name: row.name || row.username };
      if (row.status === 'accepted') data.friends.push(item);
      else if (row.outgoing) data.outgoing.push(item);
      else data.incoming.push(item);
    }
    data.friends = [...new Map(data.friends.map(friend => [friend.id, friend])).values()];
    res.json(data);
  } catch (error) {
    console.error('Friend list failed:', error.message);
    res.status(500).json({ error: 'Freundesliste konnte nicht geladen werden.' });
  }
});

app.get('/api/friends/search', authenticate, async (req, res) => {
  const query = String(req.query.q || '').trim().replace(/[%_]/g, '');
  if (query.length < 2) return res.json({ users: [] });
  try {
    const result = await pool.query(
      "SELECT id, username, profile->>'name' AS name FROM accounts WHERE id <> $1 AND lower(username) LIKE $2 ORDER BY username LIMIT 8",
      [req.account.id, query.toLowerCase() + '%'],
    );
    res.json({ users: result.rows.map(row => ({ id: row.id, username: row.username, name: row.name || row.username })) });
  } catch (error) {
    console.error('User search failed:', error.message);
    res.status(500).json({ error: 'Spielersuche gerade nicht verfügbar.' });
  }
});

app.post('/api/friends/request', authenticate, async (req, res) => {
  const username = String(req.body?.username || '').trim();
  if (!username) return res.status(400).json({ error: 'Gib einen Benutzernamen ein.' });
  try {
    const found = await pool.query('SELECT id FROM accounts WHERE lower(username) = lower($1)', [username]);
    const target = found.rows[0];
    if (!target) return res.status(404).json({ error: 'Spieler nicht gefunden.' });
    if (target.id === req.account.id) return res.status(400).json({ error: 'Du kannst dich nicht selbst hinzufügen.' });
    const current = await pool.query('SELECT status FROM friendships WHERE user_id = $1 AND friend_id = $2', [req.account.id, target.id]);
    if (current.rows[0]?.status === 'accepted') return res.status(409).json({ error: 'Ihr seid bereits befreundet.' });
    if (current.rows[0]?.status === 'pending') return res.status(409).json({ error: 'Anfrage wurde bereits gesendet.' });
    const reverse = await pool.query('SELECT status FROM friendships WHERE user_id = $1 AND friend_id = $2', [target.id, req.account.id]);
    if (reverse.rows[0]?.status === 'pending') {
      await pool.query('UPDATE friendships SET status = $1 WHERE user_id = $2 AND friend_id = $3', ['accepted', target.id, req.account.id]);
      await pool.query('INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, $3) ON CONFLICT (user_id, friend_id) DO UPDATE SET status = $3', [req.account.id, target.id, 'accepted']);
      publishFriendship(req.account.id, target.id);
      return res.json({ ok: true, accepted: true });
    }
    await pool.query('INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, $3)', [req.account.id, target.id, 'pending']);
    io.to(accountRoom(target.id)).emit('friends:refresh');
    res.status(201).json({ ok: true, accepted: false });
  } catch (error) {
    console.error('Friend request failed:', error.message);
    res.status(500).json({ error: 'Freundschaftsanfrage konnte nicht gesendet werden.' });
  }
});

app.post('/api/friends/accept', authenticate, async (req, res) => {
  const friendId = String(req.body?.friendId || '');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('UPDATE friendships SET status = $1 WHERE user_id = $2 AND friend_id = $3 AND status = $4 RETURNING user_id', ['accepted', friendId, req.account.id, 'pending']);
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Anfrage ist nicht mehr verfügbar.' });
    }
    await client.query('INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, $3) ON CONFLICT (user_id, friend_id) DO UPDATE SET status = $3', [req.account.id, friendId, 'accepted']);
    await client.query('COMMIT');
    publishFriendship(req.account.id, friendId);
    res.json({ ok: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Friend acceptance failed:', error.message);
    res.status(500).json({ error: 'Freundschaftsanfrage konnte nicht angenommen werden.' });
  } finally { client.release(); }
});

app.post('/api/friends/decline', authenticate, async (req, res) => {
  const friendId = String(req.body?.friendId || '');
  await pool.query('DELETE FROM friendships WHERE user_id = $1 AND friend_id = $2 AND status = $3', [friendId, req.account.id, 'pending']);
  io.to(accountRoom(friendId)).emit('friends:refresh');
  res.json({ ok: true });
});

app.delete('/api/friends/:friendId', authenticate, async (req, res) => {
  await pool.query('DELETE FROM friendships WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)', [req.account.id, req.params.friendId]);
  io.to(accountRoom(req.params.friendId)).emit('friends:refresh');
  res.json({ ok: true });
});

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/index.html', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/app.js', (_req, res) => res.sendFile(path.join(__dirname, 'app.js')));
app.get('/styles.css', (_req, res) => res.sendFile(path.join(__dirname, 'styles.css')));
app.get('/sw.js', (_req, res) => res.sendFile(path.join(__dirname, 'sw.js'), { headers: { 'Service-Worker-Allowed': '/' } }));

io.use(async (socket, next) => {
  try {
    const token = cookie.parse(socket.handshake.headers.cookie || '')[sessionCookie];
    if (!token) return next(new Error('Bitte zuerst anmelden.'));
    const payload = jwt.verify(token, JWT_SECRET);
    const result = await pool.query('SELECT id, username, email, profile FROM accounts WHERE id = $1', [payload.sub]);
    if (!result.rowCount) return next(new Error('Konto nicht gefunden.'));
    socket.account = result.rows[0];
    next();
  } catch { next(new Error('Anmeldung abgelaufen.')); }
});

io.on('connection', async socket => {
  const account = socket.account;
  const userId = account.id;
  const sockets = connectedUsers.get(userId) || new Set();
  const wasOnline = sockets.size > 0;
  sockets.add(socket.id);
  connectedUsers.set(userId, sockets);
  socket.join(accountRoom(userId));
  if (!wasOnline) publishPresence(userId, true);
  const friendIds = await acceptedFriendIds(userId).catch(() => []);
  socket.emit('friends:presence', friendIds.filter(id => connectedUsers.has(id)));

  socket.on('friend:challenge', async (payload, reply = () => {}) => {
    const friendId = String(payload?.friendId || '');
    const mode = ['quick', 'standard', 'endurance'].includes(payload?.mode) ? payload.mode : 'standard';
    if (friendId === userId) return reply({ error: 'Du kannst dich nicht selbst herausfordern.' });
    const found = await pool.query('SELECT 1 FROM friendships WHERE user_id = $1 AND friend_id = $2 AND status = $3', [userId, friendId, 'accepted']).catch(() => ({ rowCount: 0 }));
    const targetSockets = connectedUsers.get(friendId);
    if (!found.rowCount) return reply({ error: 'Nur Freunde können eingeladen werden.' });
    if (!targetSockets?.size) return reply({ error: 'Dieser Freund ist gerade offline.' });
    if (activeMatches.has(userId)) return reply({ error: 'Du bist bereits in einer Runde.' });
    if (activeMatches.has(friendId)) return reply({ error: 'Dieser Freund ist bereits in einer Runde.' });
    const targetSocketId = [...targetSockets].find(id => !io.sockets.sockets.get(id)?.matchId);
    if (!targetSocketId) return reply({ error: 'Dieser Freund ist bereits in einer Runde.' });
    const id = crypto.randomUUID();
    invites.set(id, { id, fromId: userId, toId: friendId, fromSocketId: socket.id, toSocketId: targetSocketId, fromName: displayName(account.profile, account.username), mode });
    io.to(targetSocketId).emit('friend:challenge:incoming', { id, fromId: userId, fromName: displayName(account.profile, account.username), mode });
    reply({ ok: true });
    setTimeout(() => {
      const invite = invites.get(id);
      if (invite) {
        invites.delete(id);
        io.to(invite.fromSocketId).emit('friend:challenge:expired');
      }
    }, 30000);
  });

  socket.on('friend:challenge:decline', payload => {
    const invite = invites.get(String(payload?.id || ''));
    if (!invite || invite.toId !== userId) return;
    invites.delete(invite.id);
    io.to(invite.fromSocketId).emit('friend:challenge:declined', { name: displayName(account.profile, account.username) });
  });

  socket.on('friend:challenge:accept', async (payload, reply = () => {}) => {
    const invite = invites.get(String(payload?.id || ''));
    if (!invite || invite.toId !== userId || invite.toSocketId !== socket.id) return reply({ error: 'Diese Einladung ist nicht mehr gültig.' });
    const hostSocket = io.sockets.sockets.get(invite.fromSocketId);
    if (!hostSocket?.connected || hostSocket.matchId || socket.matchId || activeMatches.has(invite.fromId) || activeMatches.has(invite.toId)) {
      invites.delete(invite.id);
      return reply({ error: 'Der andere Spieler ist nicht mehr verfügbar.' });
    }
    invites.delete(invite.id);
    const participants = await pool.query('SELECT id, username, profile FROM accounts WHERE id IN ($1, $2)', [invite.fromId, userId]).catch(() => null);
    const host = participants?.rows.find(player => player.id === invite.fromId);
    const guest = participants?.rows.find(player => player.id === userId);
    if (!host || !guest || !hostSocket.connected || !socket.connected || activeMatches.has(invite.fromId) || activeMatches.has(userId)) {
      return reply({ error: 'Das Duell konnte gerade nicht gestartet werden.' });
    }
    const matchId = 'pvp:' + crypto.randomUUID();
    const mode = invite.mode || 'standard';
    const baseHp = mode === 'quick' ? 60 : mode === 'endurance' ? 150 : 100;
    const room = {
      id: matchId,
      mode,
      projectiles: [],
      mapId: ['foundry', 'frost', 'grove'][Math.floor(Math.random() * 3)],
      players: [
        makePlayer(host, hostSocket.id, { x: 0.2, y: 0.5, baseHp }),
        makePlayer(guest, socket.id, { x: 0.8, y: 0.5, baseHp }),
      ],
      finished: false,
      timer: null,
    };
    pvpRooms.set(matchId, room);
    hostSocket.matchId = matchId;
    socket.matchId = matchId;
    activeMatches.set(invite.fromId, matchId);
    activeMatches.set(invite.toId, matchId);
    await hostSocket.join(matchId);
    await socket.join(matchId);
    hostSocket.emit('pvp:started', roomSnapshot(room));
    socket.emit('pvp:started', roomSnapshot(room));
    room.timer = setInterval(() => {
      if (room.finished) return;
      const now = Date.now();
      for (const player of room.players) {
        const nextX = Math.max(0.06, Math.min(0.94, player.x + player.move.x * 0.016 * player.movementSpeed));
        const nextY = Math.max(0.09, Math.min(0.91, player.y + player.move.y * 0.016 * player.movementSpeed));
        if (!blockedOnMap(room.mapId,nextX,player.y,.022)) player.x = nextX;
        if (!blockedOnMap(room.mapId,player.x,nextY,.022)) player.y = nextY;
        player.attackAnim = Math.max(0, player.attackAnim - 0.05);
        player.hitFlash = Math.max(0, player.hitFlash - 0.05);
        if (player.dodgingUntil < now) player.dodgingUntil = 0;
        if (player.reloadingUntil && now >= player.reloadingUntil) {
          const need = Math.max(0, player.maxMagazine - player.magazine);
          const loaded = Math.min(need, player.ammo);
          player.magazine += loaded;
          player.ammo -= loaded;
          player.reloadingUntil = 0;
        }
      }
      updateDuelShots(room, now);
      io.to(matchId).emit('pvp:state', roomSnapshot(room));
      const loser = room.players.find(player => player.hp <= 0);
      if (loser) endPvpRoom(room, room.players.find(player => player.userId !== loser.userId)?.userId, 'knockout');
    }, 50);
    reply({ ok: true });
  });

  socket.on('pvp:input', payload => {
    const room = pvpRooms.get(socket.matchId);
    if (!room || room.finished) return;
    const player = room.players.find(item => item.userId === userId && item.socketId === socket.id);
    if (player) {
      player.move = normalizedMove(payload);
      const aim = normalizedMove(payload?.aim);
      if (Math.hypot(aim.x, aim.y) > .2) player.aim = aim;
    }
  });

  socket.on('pvp:reload', (_payload, reply = () => {}) => {
    const room = pvpRooms.get(socket.matchId);
    const player = room?.players.find(item => item.userId === userId && item.socketId === socket.id);
    const now = Date.now();
    if (!room || room.finished || !player) return reply({ error: 'Runde ist nicht aktiv.' });
    if (!player.maxMagazine) return reply({ error: 'Diese Waffe braucht kein Nachladen.' });
    if (player.reloadingUntil || player.magazine >= player.maxMagazine || player.ammo <= 0) return reply({ error: 'Nachladen gerade nicht möglich.' });
    player.reloadingUntil = now + player.reloadMs;
    reply({ ok: true });
  });

  socket.on('pvp:attack', (payload, reply = () => {}) => {
    const room = pvpRooms.get(socket.matchId);
    if (!room || room.finished) return reply({ error: 'Runde ist nicht aktiv.' });
    const player = room.players.find(item => item.userId === userId && item.socketId === socket.id);
    const opponent = room.players.find(item => item.userId !== userId);
    const now = Date.now();
    if (!player || player.hp <= 0 || opponent.hp <= 0 || now < player.nextAttack || player.reloadingUntil) return reply({ error: 'Angriff lädt noch auf.' });
    const ranged = player.maxMagazine > 0;
    const aim = normalizedMove(payload?.aim);
    const aimLength = Math.hypot(aim.x, aim.y);
    if (aimLength > .2) player.aim = { x: aim.x / aimLength, y: aim.y / aimLength };
    if (ranged && player.magazine <= 0) return reply({ error: player.ammo > 0 ? 'Magazin leer. Bitte nachladen.' : 'Keine Munition mehr.' });
    if (ranged) player.magazine--;
    player.nextAttack = now + player.weaponCooldown;
    player.attackAnim = 0.22;
    const critical = Math.random() < Math.min(.65, .1 + player.weaponCrit + player.precision * .04 + player.mastery * .07);
    const damage = (player.weaponDamage + player.might * 3) * (critical ? 2 : 1);
    if (ranged) {
      room.projectiles.push({
        x: player.x, y: player.y, shooter: player, aim: player.aim, damage, critical,
        speed: player.weaponModel === 'launcher' ? .55 : player.weaponModel === 'rifle' ? 1.05 : .88,
        remaining: player.weaponRange, splash: player.weaponSplash,
      });
      return reply({ ok: true });
    }
    const dx = opponent.x - player.x;
    const dy = opponent.y - player.y;
    const distance = Math.hypot(dx, dy);
    const facing = player.aim || { x: dx / (distance || 1), y: dy / (distance || 1) };
    const dot = (dx * facing.x + dy * facing.y) / (distance || 1);
    if (distance <= player.weaponRange && dot >= .62 && !lineBlockedOnMap(room.mapId, player.x, player.y, opponent.x, opponent.y)) {
      hitDuelPlayer(room, player, opponent, damage, critical, now);
    }
    reply({ ok: true });
  });

  socket.on('pvp:dodge', (payload, reply = () => {}) => {
    const room = pvpRooms.get(socket.matchId);
    const player = room?.players.find(item => item.userId === userId && item.socketId === socket.id);
    if (!player || room.finished) return reply({ error: 'Runde ist nicht aktiv.' });
    const now = Date.now();
    if (now < player.dodgeReadyAt) return reply({ error: 'Ausweichen lädt noch auf.' });
    player.dodgeReadyAt = now + Math.max(1100, 2100 - player.dodgeSkill * 250);
    player.dodgingUntil = now + 430;
    let direction = normalizedMove(payload);
    if (!direction.x && !direction.y) direction = player.move.x || player.move.y ? player.move : { x: player.x < 0.5 ? 1 : -1, y: 0 };
    const step = .012 * player.movementSpeed;
    for (let i=0;i<10;i++) {
      const x = Math.max(.06, Math.min(.94, player.x + direction.x * step));
      const y = Math.max(.09, Math.min(.91, player.y + direction.y * step));
      if (!blockedOnMap(room.mapId,x,player.y,.022)) player.x = x;
      if (!blockedOnMap(room.mapId,player.x,y,.022)) player.y = y;
    }
    reply({ ok: true });
  });

  socket.on('pvp:leave', () => {
    const room = pvpRooms.get(socket.matchId);
    if (!room || room.finished) return;
    const winner = room.players.find(player => player.userId !== userId);
    endPvpRoom(room, winner?.userId || null, 'forfeit');
  });

  socket.on('disconnect', () => {
    const active = connectedUsers.get(userId);
    active?.delete(socket.id);
    if (active?.size === 0) {
      connectedUsers.delete(userId);
      publishPresence(userId, false);
    }
    const room = pvpRooms.get(socket.matchId);
    if (room && !room.finished) {
      const winner = room.players.find(player => player.userId !== userId);
      endPvpRoom(room, winner?.userId || null, 'disconnect');
    }
  });
});

app.get('/healthz', async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    await pool.query('SELECT id FROM accounts LIMIT 0');
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

async function startStandalone() {
  connectDatabase(process.env.DATABASE_URL);
  const schemaPath = path.join(__dirname, 'netlify', 'database', 'migrations', '0001_hero_clash.sql');
  const sql = await readFile(schemaPath, 'utf8');
  await pool.query(sql);
  server.listen(PORT, '0.0.0.0', () => console.log('Hero Clash listening on port ' + PORT));
}

export { server, connectDatabase };
if (standalone) {
  startStandalone().catch(error => {
    console.error('Hero Clash could not start:', error.message);
    process.exit(1);
  });
}
