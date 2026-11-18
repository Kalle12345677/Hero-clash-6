const KEY = 'neon-camp-profile-v1';
const ACTIVE_PROFILE_KEY = `${KEY}-active-account`;
const PROGRESSION_VERSION = 2;
const today = () => new Date().toISOString().slice(0, 10);
const defaults = (name) => ({
  name, onboarded: false, theme: 'light', level: 1, xp: 0, coins: 120, passXp: 0, skillPoints: 0, progressionVersion: PROGRESSION_VERSION,
  hair: '#60483f', hairStyle:'short', face: '🙂', skinTone:'warm', makeup:'natural', owned: ['Standard-Outfit', 'Trainingsklinge', 'Camp-Weste', 'Camp-Stiefel'],
  weapon: 'Trainingsklinge', armor:'Camp-Weste', boots:'Camp-Stiefel', cosmetics: { head: '', face:'', body: '', feet: '' },
  skills: { health: 0, might: 0, precision: 0, dodge: 0, quickstep: 0, focus: 0, luck: 0 },
  stats: { wins: 0, knockouts: 0, pvpWins: 0, hardWins: 0, bossMaps: [] }, daily: { date: today(), claims: [], kills: 0, wins: 0, xp: 0 },
  weaponQuestClaims: [], weaponSources: {}, passClaims: [], soundEnabled: true, musicEnabled: true,
  effectsVolume: 0.45, musicVolume: 0.18, reducedMotion: false,
});
let profile = null;
let currentUser = null;
let socket = null;
let restoringSession = true;
let offlineMode = false;
let authMode = 'login';
let authError = '';
let profileSaveTimer = 0;
let profileSync = null;
let syncRequest = null;
let reconnecting = false;
let closeDifficultyMenu = null;
const friendData = { friends: [], incoming: [], outgoing: [], online: new Set(), loaded: false, loading: false };
const leaderboardData = { players: [], loaded: false, loading: false, error: '' };
let page = 'hub';
let difficulty = 'normal';
let duelMode = 'standard';
let match = null;
let loopId = 0;
let toastId = 0;
let audioContext = null;
let musicTimer = 0;
let musicStep = 0;
let lastSoloMap = '';
const app = document.querySelector('#app');

const icons = { hub: '⌂', inventory: '▦', quests: '✦', skills: '⌘', shop: '◈', friends: '♧', leaderboard: '♜', settings: '⚙' };
const swatches = ['#60483f','#302b3f','#cb8b58','#ba5555','#4c817b','#8884bf','#d8c69a','#292a30'];
const hairStyles = [{id:'short',name:'Kurz'},{id:'long',name:'Lang'},{id:'curls',name:'Locken'},{id:'bob',name:'Bob'},{id:'ponytail',name:'Zopf'},{id:'sidecut',name:'Seitenscheitel'}];
const skinTones = [{id:'light',name:'Hell',colors:['#ffe7cf','#f5c9a8','#dba486']},{id:'warm',name:'Warm',colors:['#f3d0af','#dba47f','#b87c62']},{id:'olive',name:'Olive',colors:['#e8c99f','#c99f70','#9d704e']},{id:'deep',name:'Dunkel',colors:['#c88f6c','#9d674b','#704331']}];
const makeupOptions = [{id:'natural',name:'Natürlich'},{id:'rosy',name:'Rosig'},{id:'liner',name:'Eyeliner'},{id:'freckles',name:'Sommersprossen'}];
const weapons = [
  { name:'Trainingsklinge', model:'sword', price:0, damage:11, crit:0, speed:1, range:.17, cooldown:.62, ammo:null, splash:0, desc:'Eine gut ausbalancierte Nahkampfwaffe für den Start.', owned:true },
  { name:'Kupfer-Säbel', model:'sabre', price:90, damage:13, crit:.05, speed:1.05, range:.19, cooldown:.52, ammo:null, splash:0, desc:'Leicht und flink. Erhöht deine kritische Chance um 5 %.' },
  { name:'Sternenstab', model:'staff', price:180, damage:10, crit:.12, speed:.92, range:.23, cooldown:.7, ammo:null, splash:0, desc:'Langer Stab für Nahkampftreffer mit erhöhter Kritchance.' },
  { name:'Mondlanze', model:'spear', price:300, damage:16, crit:.08, speed:.86, range:.22, cooldown:.78, ammo:null, splash:0, desc:'Hohe Reichweite und kräftige Treffer.' },
  { name:'Impulsblaster', model:'blaster', price:240, damage:18, crit:.08, speed:1, range:.8, cooldown:.32, ammo:{mag:8,reserve:48,reload:1.25}, splash:0, desc:'Präzise Schüsse mit sichtbarem Zielkegel und 8 Schuss im Magazin.' },
  { name:'Splitterkanone', model:'rifle', price:390, damage:10, crit:.05, speed:1.15, range:.9, cooldown:.15, ammo:{mag:24,reserve:144,reload:1.7}, splash:0, desc:'Schnelle Salven, 24 Schuss pro Magazin.' },
  { name:'Kometenwerfer', model:'launcher', price:520, damage:34, crit:.1, speed:.8, range:.72, cooldown:.82, ammo:{mag:4,reserve:24,reload:1.9}, splash:.15, desc:'Sprenggeschosse verursachen Flächenschaden. 4 Schuss pro Magazin.' },
];
const armors = [
  { name:'Camp-Weste', model:'vest', price:0, hp:0, resist:0, desc:'Leichte Standardrüstung für den Trainingsplatz.', owned:true },
  { name:'Lederweste', model:'leather', price:135, hp:18, resist:.08, desc:'+18 Leben und 8 % weniger erlittenen Schaden.' },
  { name:'Wächterpanzer', model:'plate', price:270, hp:36, resist:.17, desc:'+36 Leben und 17 % weniger erlittenen Schaden.' },
  { name:'Schattenrüstung', model:'shadow', price:340, hp:22, resist:.1, desc:'+22 Leben, 10 % Schadensschutz und ein dunkler Look.' },
];
const boots = [
  {name:'Camp-Stiefel',model:'boots',price:0,speed:1,desc:'Robuste Stiefel für den Start.',owned:true},
  {name:'Leichtstiefel',model:'light',price:125,speed:1.12,desc:'+12 % Bewegungstempo. Der Bonus gilt nur, wenn diese Rüstung angelegt ist.'},
  {name:'Sturmstiefel',model:'storm',price:260,speed:1.22,desc:'+22 % Bewegungstempo. Der Bonus gilt nur, wenn diese Rüstung angelegt ist.'},
];
const duelModes = [
  {id:'quick',name:'Kurzduell',desc:'60 HP · schnelle Runden'},
  {id:'standard',name:'Standard',desc:'100 HP · ausgewogen'},
  {id:'endurance',name:'Ausdauer',desc:'150 HP · längere Kämpfe'},
];
const cosmetics = [
  { name:'Wolkenmütze', model:'hat', slot:'head', price:65, desc:'Eine weiche Mütze mit heller Krempe.' },
  { name:'Sternen-Hoodie', model:'hoodie', slot:'body', price:110, desc:'Ein dunkler Hoodie mit gestickten Sternen.' },
  { name:'Neon-Sneaker', model:'shoes', slot:'feet', price:80, desc:'Sportliche Schuhe mit hellen Sohlen.' },
  { name:'Sternen-Schuhe', model:'shoes', slot:'feet', price:0, desc:'Saison-Sneaker mit silbernen Sternen.', shop:false },
  { name:'Cooler Blick', model:'glasses', slot:'face', price:0, desc:'Eine klare Brille mit dunklen Gläsern.', shop:false },
  { name:'Nebeljacke', model:'jacket', slot:'body', price:0, desc:'Eine helle Jacke aus dem Saisonpfad.', shop:false },
  { name:'Mondkrone', model:'crown', slot:'head', price:0, desc:'Eine Krone aus dem Clash-Pass.', shop:false },
];
const skillDefs = [
  { id:'health', title:'Vitalität', icon:'health', desc:'+15 maximale Lebenspunkte je Stufe.', max:3, costs:[1,1,2], x:135,y:118, requires:[] },
  { id:'might', title:'Waffenkunde', icon:'might', desc:'+3 Waffenschaden je Stufe.', max:3, costs:[1,2,2], x:380,y:118, requires:[] },
  { id:'precision', title:'Präzision', icon:'precision', desc:'+4 % kritische Trefferchance je Stufe.', max:3, costs:[1,2,3], x:625,y:118, requires:[] },
  { id:'quickstep', title:'Flink ausweichen', icon:'quickstep', desc:'+4 % Ausweichchance je Stufe.', max:3, costs:[1,2,2], x:245,y:338, requires:['health'] },
  { id:'dodge', title:'Kampfrolle', icon:'dodge', desc:'+10 % Ausweichchance und kürzere Rollen-Abklingzeit.', max:2, costs:[2,3], x:490,y:338, requires:['might'] },
  { id:'focus', title:'Fernhieb', icon:'focus', desc:'+12 % Angriffsradius je Stufe.', max:2, costs:[2,3], x:135,y:560, requires:['quickstep'] },
  { id:'luck', title:'Glücksbringer', icon:'luck', desc:'+8 % Münzen aus Runden je Stufe.', max:3, costs:[1,2,3], x:625,y:560, requires:['precision'] },
  { id:'mastery', title:'Meisterschlag', icon:'mastery', desc:'+7 % kritische Trefferchance je Stufe.', max:2, costs:[3,4], x:380,y:744, requires:['dodge','focus'] },
];
const qdefs = [
  { id:'wins', title:'Arena-Neuling', desc:'Schließe eine Runde ab.', icon:'⚔️', goal:1, reward:45, xp:12, kind:'coins' },
  { id:'kills', title:'Aufwärmrunde', desc:'Besiege 5 Gegner.', icon:'🎯', goal:5, reward:35, xp:10, kind:'coins' },
  { id:'play', title:'Dabei sein', desc:'Sammle 40 XP in Runden.', icon:'✨', goal:40, reward:40, xp:14, kind:'coins' },
];
const weaponQuests = [
  { id:'first-blade', title:'Durchstarter', weapon:'Kupfer-Säbel', xp:30, goals:[{ stat:'knockouts', count:20, label:'Gegner besiegt' }] },
  { id:'arena-training', title:'Feuertaufe', weapon:'Impulsblaster', xp:45, goals:[{ stat:'wins', count:5, label:'Solo-Runden gewonnen' }] },
  { id:'star-keeper', title:'Sternenwacht', weapon:'Sternenstab', xp:65, goals:[{ stat:'knockouts', count:75, label:'Gegner besiegt' }] },
  { id:'moon-guard', title:'Mondwache', weapon:'Mondlanze', xp:90, goals:[{ stat:'wins', count:14, label:'Solo-Runden gewonnen' }, { stat:'level', count:4, label:'Spielerlevel' }] },
  { id:'hard-arena', title:'Harte Schule', weapon:'Splitterkanone', xp:120, goals:[{ stat:'hardWins', count:8, label:'Solo-Siege auf Schwer' }, { stat:'knockouts', count:150, label:'Gegner besiegt' }] },
  { id:'three-arenas', title:'Meister der Arenen', weapon:'Kometenwerfer', xp:160, goals:[{ stat:'wins', count:24, label:'Solo-Runden gewonnen' }, { stat:'bossMaps', count:3, label:'Verschiedene Arenabosse besiegt' }] },
];
const passRewards = [
  { xp:150, item:'Wolkenmütze', title:'Wolkenmütze' },
  { xp:380, item:'Sternen-Schuhe', title:'Sternen-Schuhe' },
  { xp:750, item:'Cooler Blick', title:'Cooler Blick' },
  { xp:1300, item:'Nebeljacke', title:'Nebeljacke' },
  { xp:2100, item:'Mondkrone', title:'Mondkrone' },
];
const legacyPassThresholds = [0, 100, 220, 360, 520];
const formatXp = new Intl.NumberFormat('de-DE');

function xpForNextLevel(level) {
  const steps = level - 1;
  return 180 + 55 * steps + 10 * steps * steps;
}
function xpAtLevel(level) {
  const steps = level - 1;
  return 180 * steps + 55 * steps * (steps - 1) / 2 + 10 * steps * (steps - 1) * (2 * steps - 1) / 6;
}
function levelProgress(totalXp) {
  let lower = 1, upper = 2;
  while (xpAtLevel(upper) <= totalXp) upper *= 2;
  while (upper - lower > 1) {
    const midpoint = Math.floor((lower + upper) / 2);
    if (xpAtLevel(midpoint) <= totalXp) lower = midpoint;
    else upper = midpoint;
  }
  return { level: lower, xp: totalXp - xpAtLevel(lower) };
}
function upgradeLegacyPassXp(oldXp, claims) {
  const next = legacyPassThresholds.findIndex(threshold => threshold > oldXp);
  if (next < 0) return passRewards.at(-1).xp + oldXp - legacyPassThresholds.at(-1);
  const previous = next - 1;
  const proportion = (oldXp - legacyPassThresholds[previous]) / (legacyPassThresholds[next] - legacyPassThresholds[previous]);
  const carried = passRewards[previous].xp + Math.floor(proportion * (passRewards[next].xp - passRewards[previous].xp));
  return Math.max(carried, ...claims.map(index => passRewards[index].xp));
}

function storageKey(accountId) { return KEY + ':account:' + accountId; }
function readAccountCache(accountId) {
  try { return JSON.parse(localStorage.getItem(storageKey(accountId)) || 'null'); }
  catch { return null; }
}
function cacheAccount() {
  if (!profileSync) return;
  localStorage.setItem(storageKey(profileSync.account.id), JSON.stringify({ ...profileSync, profile }));
}
function save() {
  if (!profile || !profileSync) return;
  profileSync.pending = true;
  cacheAccount();
  if (!currentUser || offlineMode || syncRequest) return;
  clearTimeout(profileSaveTimer);
  profileSaveTimer = setTimeout(() => syncProfile(), 450);
}
function mergeProfiles(base, local, remote) {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function merge(before, mine, theirs, path = '') {
    if (path === 'stats.pvpWins') return theirs;
    if (same(before, mine)) return theirs;
    if (same(before, theirs)) return mine;
    if (['owned', 'passClaims', 'weaponQuestClaims', 'stats.bossMaps', 'daily.claims'].includes(path)) return [...new Set([...(theirs || []), ...(mine || [])])];
    if (path.startsWith('skills.') && Number.isFinite(mine) && Number.isFinite(theirs)) return Math.max(mine, theirs);
    if (['coins','passXp','skillPoints','stats.wins','stats.knockouts','stats.hardWins','daily.kills','daily.wins','daily.xp'].includes(path)) {
      return Math.max(0, (Number(theirs) || 0) + (Number(mine) || 0) - (Number(before) || 0));
    }
    if (path === 'daily') {
      if (mine?.date !== theirs?.date) return (mine?.date || '') > (theirs?.date || '') ? mine : theirs;
      if (before?.date !== mine?.date) before = {};
    }
    if (mine && theirs && typeof mine === 'object' && typeof theirs === 'object' && !Array.isArray(mine) && !Array.isArray(theirs)) {
      return Object.fromEntries([...new Set([...Object.keys(mine), ...Object.keys(theirs)])].map(key => [
        key, merge(before?.[key], mine[key], theirs[key], path ? path + '.' + key : key),
      ]));
    }
    return mine;
  }
  const combined = merge(base, local, remote);
  const duplicateQuestXp = weaponQuests.reduce((sum, quest) => {
    const claimedTwice = local.weaponQuestClaims.includes(quest.id) && remote.weaponQuestClaims.includes(quest.id) && !base.weaponQuestClaims.includes(quest.id);
    return sum + (claimedTwice ? quest.xp : 0);
  }, 0);
  const totalXp = value => xpAtLevel(value.level) + value.xp;
  const xp = Math.max(totalXp(local), totalXp(remote), totalXp(remote) + totalXp(local) - totalXp(base) - duplicateQuestXp);
  Object.assign(combined, levelProgress(xp));
  combined.passXp = Math.max(local.passXp, remote.passXp, combined.passXp - duplicateQuestXp);
  combined.skillPoints = Math.max(0, combined.skillPoints + combined.level - local.level - remote.level + base.level);
  return combined;
}
function newWriteId() {
  return Array.from(crypto.getRandomValues(new Uint32Array(4)), number => number.toString(16).padStart(8, '0')).join('');
}
async function syncProfile() {
  if (!currentUser || offlineMode || !profileSync?.pending) return;
  if (syncRequest) return syncRequest;
  const state = profileSync;
  syncRequest = (async () => {
    for (let attempt = 0; attempt < 4 && profileSync === state && state.pending; attempt++) {
      state.write ||= { id: newWriteId(), profile: structuredClone(profile), version: state.version };
      const sent = state.write;
      cacheAccount();
      let result;
      let accepted = true;
      try { result = await api('/api/profile', { method: 'PUT', body: JSON.stringify({ profile: sent.profile, writeId: sent.id, version: sent.version }) }); }
      catch (error) {
        if (error.status !== 409) {
          if (!error.status || error.status === 401 || error.status >= 500) offlineMode = true;
          return;
        }
        result = error.data;
        accepted = false;
      }
      if (profileSync !== state) return;
      const cloud = normalizeProfile(result.profile, state.account.username);
      const sentProfile = normalizeProfile(sent.profile, state.account.username);
      const unchanged = JSON.stringify(profile) === JSON.stringify(sentProfile);
      const updated = accepted && unchanged ? cloud : mergeProfiles(accepted ? sentProfile : state.base, profile, cloud);
      profile = structuredClone(updated);
      state.base = cloud;
      state.version = result.profileVersion;
      state.write = null;
      state.pending = JSON.stringify(profile) !== JSON.stringify(cloud);
      cacheAccount();
      leaderboardData.loaded = false;
    }
  })();
  try { await syncRequest; }
  finally { syncRequest = null; }
}
async function api(url, options={}) {
  const response = await fetch(url, { cache:'no-store', credentials: 'same-origin', signal:AbortSignal.timeout?.(10000), ...options, headers: { 'Content-Type': 'application/json', ...(options.headers||{}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || 'Server gerade nicht erreichbar.'), { status:response.status, data });
  return data;
}
function clean(s='') { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function currentWeapon(){ return weapons.find(item=>item.name===profile?.weapon)||weapons[0]; }
function arenaWeapon(){ return match?.weapon || currentWeapon(); }
function currentArmor(){ return armors.find(item=>item.name===profile?.armor)||armors[0]; }
function currentBoots(){ return boots.find(item=>item.name===profile?.boots&&profile?.owned?.includes(item.name))||boots[0]; }
function critChance(){ return Math.min(.65,.10+(arenaWeapon().crit||0)+(profile?.skills?.precision||0)*.04+(profile?.skills?.mastery||0)*.07); }
function dodgeChance(){ return Math.min(.55,.10+(profile?.skills?.quickstep||0)*.04+(profile?.skills?.dodge||0)*.10); }
function weaponSource(name) {
  if (name === 'Trainingsklinge') return 'Startausrüstung';
  const source = profile.weaponSources[name];
  if (source === 'shop') return 'Im Shop gekauft';
  const quest = weaponQuests.find(entry => entry.id === source);
  return quest ? 'Quest · ' + quest.title : 'Aus früherem Spielstand';
}
function showItemInfo(name) {
  const item=weapons.find(x=>x.name===name)||armors.find(x=>x.name===name)||boots.find(x=>x.name===name)||cosmetics.find(x=>x.name===name);if(!item)return;
  const isWeapon=weapons.includes(item),isArmor=armors.includes(item),isBoot=boots.includes(item),art=isWeapon?weaponSvg(name):isArmor?armorSvg(name):isBoot?bootsSvg(name):cosmeticSvg(name);
  const stats=isWeapon?`<div class="detail-stats"><span>Schaden <b>${item.damage}</b></span><span>Kritchance <b>${Math.round((.10+item.crit)*100)} %</b></span><span>Cooldown <b>${item.cooldown}s</b></span><span>${item.ammo?`Magazin <b>${item.ammo.mag} · Reserve ${item.ammo.reserve}</b>`:`Tempo <b>${Math.round(item.speed*100)} %</b>`}</span>${item.splash?`<span>Flächenschaden <b>${Math.round(item.splash*100)} %</b></span>`:''}</div>`:isArmor?`<div class="detail-stats"><span>Zusatzleben <b>+${item.hp}</b></span><span>Schutz <b>${Math.round(item.resist*100)} %</b></span></div>`:isBoot?`<div class="detail-stats"><span>Bewegung <b>+${Math.round((item.speed-1)*100)} %</b></span><span>Wirkt nur angelegt <b>Ja</b></span></div>`:`<div class="detail-stats"><span>Typ <b>Kosmetik</b></span><span>Platz <b>${({head:'Kopf',face:'Gesicht',body:'Oberteil',feet:'Schuhe'})[item.slot]}</b></span></div>`;
  const owned=profile.owned.includes(name),kind=isWeapon?'weapon':isArmor?'armor':isBoot?'boots':'cosmetic';
  const quest=isWeapon?weaponQuests.find(entry=>entry.weapon===name):null;
  const overlay=document.createElement('div');overlay.className='overlay';overlay.innerHTML=`<section class="detail-modal item-detail"><button class="modal-close" data-close>×</button><div class="detail-art">${art}</div><div class="eyebrow">${isWeapon?'WAFFENINFO':isArmor?'RÜSTUNGSINFO':isBoot?'STIEFELINFO':'KLEIDUNGSINFO'}</div><h2>${clean(item.name)}</h2><p>${clean(item.desc)}</p>${stats}${isWeapon&&owned?`<p class="weapon-source"><b>Herkunft</b> · ${clean(weaponSource(name))}</p>`:''}<button class="button full" data-equip-info ${!owned&&profile.coins<item.price?'disabled':''}>${owned?(isWeapon?'Ausrüsten':isArmor?'Anlegen':isBoot?'Stiefel anlegen':'Anlegen'):`${item.price} ◈ · Kaufen`}</button>${quest?`<button class="button ghost full weapon-quest-link" data-open-weapon-quest>Quest ansehen · ${clean(quest.title)}</button>`:''}</section>`;
  (document.querySelector('.app-shell')||document.body).append(overlay);overlay.querySelector('[data-close]').addEventListener('click',()=>overlay.remove());overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});overlay.querySelector('[data-equip-info]').addEventListener('click',()=>{if(!owned){buy(item.name,kind);overlay.remove();return;}if(isWeapon)profile.weapon=item.name;else if(isArmor)profile.armor=item.name;else if(isBoot)profile.boots=item.name;else profile.cosmetics[item.slot]=item.name;save();overlay.remove();render();toast(`${item.name} angelegt.`);});
  overlay.querySelector('[data-open-weapon-quest]')?.addEventListener('click',()=>{
    overlay.remove();
    go('quests');
    document.getElementById('weapon-quest-'+quest.id)?.scrollIntoView({block:'start'});
  });
}
function audioReady(){
  if(!audioContext){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;audioContext=new AC();}
  if(audioContext.state==='suspended')audioContext.resume();return audioContext;
}
function startAudio(){
  if(!profile?.musicEnabled||profile.musicVolume<=0){clearInterval(musicTimer);musicTimer=0;return;}
  const ctx=audioReady();if(!ctx||musicTimer)return;
  const notes=[146.83,174.61,220,196,164.81,220,246.94,196];
  musicTimer=setInterval(()=>{
    if(!profile?.musicEnabled||!profile.musicVolume||!audioContext){clearInterval(musicTimer);musicTimer=0;return;}
    const now=audioContext.currentTime,note=notes[musicStep++%notes.length];
    [[note,.7],[note*1.5,.35]].forEach(([freq,weight])=>{const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type='sine';osc.frequency.value=freq;gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(profile.musicVolume*.045*weight,now+.14);gain.gain.exponentialRampToValueAtTime(.0001,now+1.2);osc.connect(gain);gain.connect(audioContext.destination);osc.start(now);osc.stop(now+1.25);});
  },720);
}
function playSound(type='hit'){
  if(!profile?.soundEnabled||!profile.effectsVolume)return;const ctx=audioReady();if(!ctx)return;
  const now=ctx.currentTime,settings={ui:[550,.045,'sine'],hit:[180,.09,'triangle'],crit:[460,.16,'sawtooth'],dodge:[340,.11,'triangle'],attack:[240,.07,'square'],parry:[780,.16,'triangle'],buy:[620,.12,'sine'],upgrade:[520,.22,'sine'],confirm:[460,.16,'sine'],reward:[700,.3,'triangle'],spin:[300,.2,'triangle'],reload:[390,.16,'triangle'],blast:[100,.22,'sawtooth']};
  const [freq,duration,wave]=settings[type]||settings.hit,osc=ctx.createOscillator(),gain=ctx.createGain(),volume=profile.effectsVolume*.17;
  osc.type=wave;osc.frequency.setValueAtTime(freq,now);if(type==='attack')osc.frequency.exponentialRampToValueAtTime(100,now+duration);if(type==='crit')osc.frequency.exponentialRampToValueAtTime(900,now+duration);
  gain.gain.setValueAtTime(.0001,now);gain.gain.linearRampToValueAtTime(volume,now+.012);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);osc.connect(gain);gain.connect(ctx.destination);osc.start(now);osc.stop(now+duration+.02);
}
function ensureDaily() { if (profile.daily.date !== today()) profile.daily = { date:today(), claims:[], kills:0, wins:0, xp:0 }; }
function addXp(amount) {
  const previousLevel = profile.level;
  profile.passXp += amount;
  Object.assign(profile, levelProgress(xpAtLevel(previousLevel) + profile.xp + amount));
  const gained = profile.level - previousLevel;
  if (gained > 0) {
    profile.skillPoints += gained;
    toast(`Level ${profile.level}! +${gained} Skill-${gained === 1 ? 'Punkt' : 'Punkte'}`);
  }
}
function toast(message) {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className='toast'; document.body.append(el); }
  el.textContent = message; el.classList.add('show'); clearTimeout(toastId);
  toastId = setTimeout(() => el.classList.remove('show'), 2400);
}

function weaponParts(model) {
  if(model==='blaster') return '<path d="M28 47h30l8 8h16v12H57l-8 6-10-6H28Z" fill="#53677c" stroke="#263746" stroke-width="4"/><path d="M32 51h25v7H32Z" fill="#b9e5e8"/><path d="m43 68 12 2-5 18H37Z" fill="#394453" stroke="#263746" stroke-width="3"/><path d="M76 57h12v9H76Z" fill="#e0c77e"/><circle cx="70" cy="61" r="4" fill="#f5fcff"/>';
  if(model==='rifle') return '<path d="M15 46h48l10 7h15v10H63l-9 7H34l-6-7H15Z" fill="#4d5968" stroke="#242a31" stroke-width="4"/><path d="M20 50h42v6H20Z" fill="#cbd5df"/><path d="m39 67 15 2-5 16H38Z" fill="#303b49" stroke="#242a31" stroke-width="3"/><path d="M61 45v-8h15v8" fill="#8ec2d4" stroke="#526274" stroke-width="3"/><path d="M20 60h-8" stroke="#e7cf85" stroke-width="4"/>';
  if(model==='launcher') return '<path d="M20 42h48l13 8v18l-13 8H20Z" fill="#795c42" stroke="#473b30" stroke-width="4"/><path d="M25 47h40v26H25Z" fill="#9f7953"/><path d="M65 50h18v18H65Z" fill="#e1aa63" stroke="#734f33" stroke-width="3"/><path d="m38 72 18 2-5 13H39Z" fill="#394453" stroke="#263746" stroke-width="3"/><path d="M34 54h23m-23 7h23" stroke="#e6d49d" stroke-width="3"/>';
  if(model==='sabre') return '<path d="M49 4Q79 19 65 42l-10 13-12-6 11-13Q66 20 49 4Z" fill="url(#steel)" stroke="#526170" stroke-width="2.5"/><path d="M53 12Q68 25 57 39" fill="none" stroke="#fff" stroke-opacity=".82" stroke-width="3"/><path d="M38 37 66 45" stroke="#a87542" stroke-width="6" stroke-linecap="round"/><path d="M42 35 62 42" stroke="#e4c996" stroke-width="2"/><path d="M50 44 41 53" stroke="#4c3027" stroke-width="8" stroke-linecap="round"/><path d="M43 47 48 51M40 50 45 54" stroke="#d0a779" stroke-width="2"/><circle cx="39" cy="54" r="4" fill="#bea06e" stroke="#684e35" stroke-width="2"/>';
  if(model==='staff') return '<path d="M47 17 53 17 57 50 43 50Z" fill="#8a6048" stroke="#573c2d" stroke-width="2"/><path d="M45 31h10M44 39h12" stroke="#d1ac7d" stroke-width="2"/><path d="M50 3 64 13 59 25 50 28 40 22 36 12Z" fill="#6e747d" stroke="#444951" stroke-width="2.5"/><circle cx="50" cy="14" r="9" fill="#8fd1d0" stroke="#e4fbf7" stroke-width="2"/><circle cx="50" cy="14" r="4" fill="#fff"/><path d="M50 2v-4m15 15h4M35 13h-4" stroke="#d8dce0" stroke-width="2"/>';
  if(model==='spear') return '<path d="M47 18 53 18 57 51 43 51Z" fill="#79543d" stroke="#533c2e" stroke-width="2"/><path d="M50 2 67 23 56 20 50 27 44 20 33 23Z" fill="url(#steel)" stroke="#526170" stroke-width="2.5"/><path d="m50 7 9 12-8-3-7 4Z" fill="#fff" fill-opacity=".82"/><path d="M37 25h26M42 29h16" stroke="#c7a16c" stroke-width="3"/><path d="M48 40h4" stroke="#d8bd8b" stroke-width="2"/>';
  return '<path d="M50 2 66 28 60 37H40L34 28Z" fill="url(#steel)" stroke="#526170" stroke-width="2.5"/><path d="m50 7 10 20-8 6-2-22-10 17Z" fill="#fff" fill-opacity=".62"/><path d="M31 30h38" stroke="#aa7748" stroke-width="7" stroke-linecap="round"/><path d="M35 28h30" stroke="#e3c68e" stroke-width="2"/><path d="M50 36v14" stroke="#4c3027" stroke-width="9" stroke-linecap="round"/><path d="M47 39v10m6-10v10" stroke="#bc9872" stroke-width="2"/><path d="M42 51h16l-8 6Z" fill="#b79a66" stroke="#664d34" stroke-width="2"/><circle cx="50" cy="31" r="3" fill="#f3e5bf"/>';
}
function bootsSvg(name,cls=''){
  const item=boots.find(entry=>entry.name===name)||boots[0],color=item.model==='storm'?'#59616c':item.model==='light'?'#9eabb8':'#806c5e';
  return `<svg class="${cls}" viewBox="0 0 100 100" role="img" aria-label="${clean(item.name)}"><circle cx="50" cy="51" r="43" fill="var(--icon-back,#eef0f3)"/><path d="M29 22h21v32q8 8 21 11 10 3 9 15H23q-8-5 0-14l7-9Z" fill="${color}" stroke="#303844" stroke-width="4"/><path d="M24 70h53" stroke="#e4e9ed" stroke-width="5"/><path d="m38 46 13 8m-14-1 13 8" stroke="#e6d3ad" stroke-width="3"/><path d="M31 31h16" stroke="#fff" stroke-opacity=".55" stroke-width="3"/></svg>`;
}
function weaponSvg(name, cls='') {
  const item=weapons.find(w=>w.name===name)||weapons[0];
  return `<svg class="${cls}" viewBox="0 0 100 100" role="img" aria-label="${clean(item.name)}"><defs><linearGradient id="steel" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff"/><stop offset=".22" stop-color="#e4e9ed"/><stop offset=".53" stop-color="#9aa6b1"/><stop offset="1" stop-color="#596675"/></linearGradient><radialGradient id="weapon-glow"><stop stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><circle cx="50" cy="51" r="43" fill="var(--icon-back,#eef0f3)"/><circle cx="50" cy="48" r="36" fill="url(#weapon-glow)"/><path d="M18 79q32-12 64 0" fill="none" stroke="var(--line,#c5c6c8)" stroke-width="1.5"/><g>${weaponParts(item.model)}</g></svg>`;
}
function cosmeticSvg(name, cls='') {
  const item=cosmetics.find(x=>x.name===name);const model=item?.model||'hoodie';
  const art=model==='hat'?'<path d="M25 59q4-31 25-31t25 31H25Z" fill="#d8e1e9" stroke="#758391" stroke-width="3"/><path d="M20 57h60v13H20q-8-6 0-13Z" fill="#738393"/><path d="M38 47q12-9 24 0" fill="none" stroke="#fff" stroke-width="3"/>':model==='shoes'?'<path d="M25 30h23v23q7 8 24 11 9 3 7 13H22q-7-5 1-13l5-10Z" fill="#788a9c" stroke="#425164" stroke-width="3"/><path d="M25 66h51" stroke="#f6f7f8" stroke-width="5"/><path d="m44 48 9 7" stroke="#d5e0e7" stroke-width="3"/><path d="m39 58 4-5 4 5-4 5z" fill="#fff"/>':model==='glasses'?'<path d="M16 40h17l5 6h24l5-6h17l-4 22q-2 8-11 8H48q-9 0-11-8l-2-12-3 12q-2 8-11 8h-2q-8 0-10-8Z" fill="#384452" stroke="#9ba9b7" stroke-width="4"/><path d="M42 49h17" stroke="#c4d0db" stroke-width="4"/>':model==='crown'?'<path d="m23 70 4-38 18 18 9-28 12 28 14-18 5 38Z" fill="#d9c887" stroke="#967d48" stroke-width="3"/><path d="M24 70h60v9H24z" fill="#927847"/><circle cx="50" cy="61" r="5" fill="#f7f4df"/>':model==='jacket'?'<path d="m31 23 19 9 19-9 18 17-13 14-3 30H29l-3-30-13-14Z" fill="#b6c1cb" stroke="#566475" stroke-width="3"/><path d="m40 35 10 10 10-10M50 44v28" fill="none" stroke="#f2f3f3" stroke-width="3"/><path d="m72 37 5 5-5 5-5-5z" fill="#777f89"/>':'<path d="m31 23 19 9 19-9 18 17-13 14-3 30H29l-3-30-13-14Z" fill="#697c90" stroke="#415064" stroke-width="3"/><path d="m40 35 10 10 10-10M50 44v28" fill="none" stroke="#eef2f5" stroke-width="3"/><path d="m72 37 5 5-5 5-5-5z" fill="#e5d495"/>';
  return `<svg class="${cls}" viewBox="0 0 100 100" role="img" aria-label="${clean(name)}"><defs><linearGradient id="cloth" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff"/><stop offset="1" stop-color="#ccd5dd"/></linearGradient></defs><circle cx="50" cy="51" r="43" fill="var(--icon-back,#eef0f3)"/>${art}</svg>`;
}
function armorSvg(name,cls=''){
  const armor=armors.find(item=>item.name===name)||armors[0];
  const shape=armor.model==='plate'?'<path d="m30 25 20 9 20-9 16 16-12 14-4 31H30l-4-31-12-14Z" fill="#a8b2bd" stroke="#687480" stroke-width="4"/><path d="m39 39 11 10 11-10M50 50v26" fill="none" stroke="#eef1f4" stroke-width="4"/><path d="m27 36-10 15 14 5m42-20 10 15-14 5" fill="#818d99" stroke="#626e79" stroke-width="3"/><circle cx="50" cy="63" r="6" fill="#d4c27c"/>':armor.model==='shadow'?'<path d="m30 25 20 9 20-9 16 16-12 14-4 31H30l-4-31-12-14Z" fill="#3a3d45" stroke="#1e2025" stroke-width="4"/><path d="m39 39 11 10 11-10M50 50v26" fill="none" stroke="#9299a3" stroke-width="3"/><path d="m27 36-10 15 14 5m42-20 10 15-14 5" fill="#555962" stroke="#27292e" stroke-width="3"/>':armor.model==='leather'?'<path d="m30 25 20 9 20-9 16 16-12 14-4 31H30l-4-31-12-14Z" fill="#8b6650" stroke="#624839" stroke-width="4"/><path d="m39 39 11 10 11-10M50 50v26" fill="none" stroke="#d3b28c" stroke-width="3"/><path d="m27 36-10 15 14 5m42-20 10 15-14 5" fill="#a4785b" stroke="#624839" stroke-width="3"/>':'<path d="m30 25 20 9 20-9 16 16-12 14-4 31H30l-4-31-12-14Z" fill="#d5dce2" stroke="#87929d" stroke-width="4"/><path d="m39 39 11 10 11-10M50 50v26" fill="none" stroke="#a3aeb9" stroke-width="3"/>';
  return `<svg class="${cls}" viewBox="0 0 100 100" role="img" aria-label="${clean(name)}"><circle cx="50" cy="51" r="43" fill="var(--icon-back,#eef0f3)"/>${shape}</svg>`;
}
function hairSvg(style,color){
  const cap=`<path d="M64 78C59 55 69 39 91 39h19c22 2 32 18 26 40-8-7-13-15-16-23-8 11-18 17-30 17-10 0-18-2-26 5Z" fill="${color}"/><path d="M73 57c8-12 20-16 35-13" fill="none" stroke="#fff" stroke-opacity=".2" stroke-width="4" stroke-linecap="round"/>`;
  const shortSides=`<path d="M65 63c-5 12-5 29 1 41l9-6 2-28Z M135 63c5 12 5 29-1 41l-9-6-2-28Z" fill="${color}"/>`;
  if(style==='long')return `<path d="M65 66c-5 29-3 73 0 108l15 5-1-102Z M135 66c5 29 3 73 0 108l-15 5 1-102Z" fill="${color}"/>`+cap;
  if(style==='curls')return `<path d="M64 82q-5 8 0 17l8-4 2-13m62 0q5 8 0 17l-8-4-2-13" fill="${color}"/><circle cx="67" cy="62" r="10" fill="${color}"/><circle cx="81" cy="48" r="11" fill="${color}"/><circle cx="99" cy="43" r="11" fill="${color}"/><circle cx="117" cy="48" r="11" fill="${color}"/><circle cx="133" cy="63" r="10" fill="${color}"/>`+cap;
  if(style==='bob')return `<path d="M65 68c-4 18-3 43 2 63l13 7 1-61Zm70 0c4 18 3 43-2 63l-13 7-1-61Z" fill="${color}"/>`+cap;
  if(style==='ponytail')return `<path d="M130 63c20 7 23 23 14 42l-9 20-10-7 8-21c5-12 1-19-9-22Z" fill="${color}"/>`+cap+`<path d="M128 68q8 3 12 9" fill="none" stroke="#d8c69a" stroke-width="4" stroke-linecap="round"/>`;
  if(style==='sidecut')return `<path d="M66 77c-5 13-4 27 1 35l9-5 1-27Z" fill="${color}"/><path d="M68 92h7m-7 6h7m-7 6h7" stroke="#7d8791" stroke-opacity=".75" stroke-width="2"/>`+`<path d="M64 77c-2-23 11-39 34-39 20 0 35 13 37 36-11-2-19-8-26-18-9 11-23 18-45 21Z" fill="${color}"/><path d="M78 54q19-19 38-8" fill="none" stroke="#fff" stroke-opacity=".2" stroke-width="4" stroke-linecap="round"/>`;
  return cap+shortSides;
}
function hairPreviewSvg(style,color){
  const tone=skinTones.find(item=>item.id===profile?.skinTone)||skinTones[1];
  return '<svg viewBox="54 34 92 96" aria-hidden="true"><ellipse cx="100" cy="91" rx="28" ry="37" fill="'+tone.colors[1]+'"/>'+hairSvg(style,color)+'</svg>';
}
function faceMarkup(face, makeup='natural') {
  let expression;
  if(face==='😎') expression='<rect x="75" y="96" width="21" height="12" rx="5" fill="#293044"/><rect x="104" y="96" width="21" height="12" rx="5" fill="#293044"/><path d="M96 100h8" stroke="#293044" stroke-width="4"/><path d="M91 120h18" stroke="#a8675e" stroke-width="3" stroke-linecap="round"/>';
  else if(face==='😼') expression='<path d="m75 98 22 2-6 9H78zm50 0-22 2 6 9h13z" fill="#302b39"/><path d="M92 120q9 5 17-3" fill="none" stroke="#a8675e" stroke-width="3" stroke-linecap="round"/>';
  else if(face==='😴') expression='<path d="M78 103q7-8 15 0m16 0q7-8 15 0" fill="none" stroke="#302b39" stroke-width="3" stroke-linecap="round"/><path d="M92 120q8 5 16 0" fill="none" stroke="#a8675e" stroke-width="3" stroke-linecap="round"/>';
  else expression='<ellipse cx="86" cy="101" rx="3.3" ry="4.5" fill="#302b39"/><ellipse cx="114" cy="101" rx="3.3" ry="4.5" fill="#302b39"/><path d="M90 120q10 8 20 0" fill="none" stroke="#a8675e" stroke-width="3" stroke-linecap="round"/>';
  const details=makeup==='rosy'?'<ellipse cx="76" cy="113" rx="8" ry="4" fill="#e98383" opacity=".43"/><ellipse cx="124" cy="113" rx="8" ry="4" fill="#e98383" opacity=".43"/><path d="M94 124q6 4 12 0" fill="none" stroke="#bd6470" stroke-width="2.5" stroke-linecap="round"/>':makeup==='liner'?'<path d="m78 98 9-3 10 3m7 0 10-3 9 3" fill="none" stroke="#302b39" stroke-width="2.4" stroke-linecap="round"/>':makeup==='freckles'?'<g fill="#9f674b" opacity=".82"><circle cx="77" cy="111" r="1.4"/><circle cx="83" cy="114" r="1.2"/><circle cx="88" cy="111" r="1.1"/><circle cx="112" cy="111" r="1.1"/><circle cx="117" cy="114" r="1.2"/><circle cx="123" cy="111" r="1.4"/></g>':'';
  return details+expression;
}
function avatarSvg(sizeClass='') {
  const hair=swatches.includes(profile?.hair)?profile.hair:swatches[0],face=faceMarkup(profile?.face||'🙂',profile?.makeup||'natural');
  const skin=skinTones.find(item=>item.id===profile?.skinTone)||skinTones[1];
  const bodyName=profile?.cosmetics?.body, headName=profile?.cosmetics?.head, feetName=profile?.cosmetics?.feet;
  const style=hairStyles.some(item=>item.id===profile?.hairStyle)?profile.hairStyle:'short',hairShape=hairSvg(style,hair);
  const torso=bodyName==='Sternen-Hoodie'?'url(#hoodie)':bodyName==='Nebeljacke'?'url(#steel)':'url(#shirt)';
  const armorModel=armors.find(item=>item.name===profile?.armor)?.model||'vest';
  const armorGraphic=armorModel==='vest'?'':`<g transform="translate(64 132) scale(.72)">${armorModel==='plate'?'<path d="m30 25 20 9 20-9 16 16-12 14-4 31H30l-4-31-12-14Z" fill="#a8b2bd" stroke="#687480" stroke-width="4"/><path d="m39 39 11 10 11-10M50 50v26" fill="none" stroke="#eef1f4" stroke-width="4"/>':armorModel==='shadow'?'<path d="m30 25 20 9 20-9 16 16-12 14-4 31H30l-4-31-12-14Z" fill="#3a3d45" stroke="#1e2025" stroke-width="4"/><path d="m39 39 11 10 11-10M50 50v26" fill="none" stroke="#9299a3" stroke-width="3"/>':'<path d="m30 25 20 9 20-9 16 16-12 14-4 31H30l-4-31-12-14Z" fill="#8b6650" stroke="#624839" stroke-width="4"/><path d="m39 39 11 10 11-10M50 50v26" fill="none" stroke="#d3b28c" stroke-width="3"/>'}</g>`;
  const headwear=headName==='Wolkenmütze'?'<path d="M66 81q2-36 34-36t34 36z" fill="url(#hat)" stroke="#788492" stroke-width="3"/><path d="M61 78h78q7 0 7 8v5H61q-8-5 0-13Z" fill="#8795a1"/><path d="M82 66q18-12 36 0" fill="none" stroke="#fff" stroke-width="4"/>':headName==='Mondkrone'?'<path d="m69 79 4-29 16 15 11-28 12 28 17-15 3 29Z" fill="#d9c887" stroke="#967d48" stroke-width="3"/><path d="M68 79h66v8H68z" fill="#927847"/><circle cx="100" cy="72" r="5" fill="#fff"/>':'';
  const shoes=feetName==='Neon-Sneaker'||feetName==='Sternen-Schuhe'?'url(#sneaker)':'url(#boot)';
  const glasses=profile?.cosmetics?.face==='Cooler Blick'?'<rect x="75" y="96" width="22" height="12" rx="5" fill="#293044"/><rect x="103" y="96" width="22" height="12" rx="5" fill="#293044"/><path d="M97 101h6" stroke="#293044" stroke-width="3"/>':'';
  const equipped=profile?.weapon||'Trainingsklinge',model=weapons.find(w=>w.name===equipped)?.model||'sword';
  return `<svg class="character-figure ${sizeClass}" viewBox="0 0 200 300" role="img" aria-label="${clean(profile?.name||'Dein Charakter')} mit ${clean(equipped)}">
    <defs><linearGradient id="skin" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${skin.colors[0]}"/><stop offset=".58" stop-color="${skin.colors[1]}"/><stop offset="1" stop-color="${skin.colors[2]}"/></linearGradient><linearGradient id="shirt" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff"/><stop offset=".48" stop-color="#dfe5e9"/><stop offset="1" stop-color="#aeb9c4"/></linearGradient><linearGradient id="hoodie" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#687789"/><stop offset=".5" stop-color="#354255"/><stop offset="1" stop-color="#202a39"/></linearGradient><linearGradient id="pants" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#526277"/><stop offset="1" stop-color="#29374a"/></linearGradient><linearGradient id="boot" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#5b4942"/><stop offset="1" stop-color="#292321"/></linearGradient><linearGradient id="sneaker"><stop stop-color="#fff"/><stop offset=".45" stop-color="#c8d7df"/><stop offset="1" stop-color="#8197a7"/></linearGradient><linearGradient id="hat"><stop stop-color="#fff"/><stop offset="1" stop-color="#b8c4cf"/></linearGradient><radialGradient id="shine"><stop stop-color="#fff" stop-opacity=".72"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><linearGradient id="steel" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff"/><stop offset=".45" stop-color="#b9c4ce"/><stop offset="1" stop-color="#727f8e"/></linearGradient></defs>
    <ellipse cx="100" cy="282" rx="61" ry="11" fill="#111827" opacity=".17"/>
    <g class="character-body">
      <path d="m69 198-4 55q12 13 29 5l7-54zm38 5 4 54q14 10 29-1l-12-58z" fill="url(#pants)" stroke="#273446" stroke-width="2"/>
      <path d="m66 246 27 3 1 19H49q-4-8 17-22zm45 3 25-1q19 12 17 20h-41z" fill="${shoes}" stroke="#374252" stroke-width="3"/>
      <path d="M62 124q15-14 38-14t39 14l16 63q-22 17-55 17-34 0-54-17z" fill="${torso}" stroke="#9ba8b4" stroke-width="2"/>
      ${armorGraphic}
      <path d="M80 126q8 14 20 14t20-14" fill="none" stroke="#87939e" stroke-width="4"/>
      <path d="m83 151 17 16 17-16v29H83Z" fill="#b9c7d1" opacity=".72"/><path d="M100 168v28" stroke="#8493a0" stroke-width="3"/>
      <path d="M62 132 39 180q-5 12 6 17 7 2 12-8l23-43m58-14 21 45q5 12-6 17-8 2-13-8l-22-44" fill="url(#skin)" stroke="#bd8b71" stroke-width="2"/>
      <path d="M64 147 48 180m89-32 15 33" stroke="#fff" stroke-opacity=".4" stroke-width="5"/>
      <rect x="67" y="46" width="66" height="91" rx="31" fill="url(#skin)" stroke="#d09c7d" stroke-width="2"/>
      <ellipse cx="87" cy="73" rx="22" ry="15" fill="url(#shine)"/>
      ${hairShape}
      ${headwear}${face}${glasses}
      <g transform="translate(143 148) rotate(28) scale(.72)">${weaponParts(model)}</g>
    </g>
  </svg>`;
}

function legacyProfile() {
  try { const value=JSON.parse(localStorage.getItem(KEY)||'null');return value&&typeof value.name==='string'?value:null; }
  catch { return null; }
}
function loginScreen() {
  if (restoringSession) return `<div class="modal-backdrop"><section class="login-modal auth-loading"><div class="login-logo">HC</div><div class="eyebrow">HERO CLASH</div><h1>Verbinde mit der Arena …</h1></section></div>`;
  const registering = authMode === 'register';
  const hasLocalProfile=Boolean(legacyProfile());
  return `<div class="modal-backdrop"><section class="login-modal" aria-labelledby="welcome-title">
    <div class="login-logo">HC</div><div class="eyebrow">KONTO · HERO CLASH</div>
    <h1 id="welcome-title">${registering?'Dein Held wartet':'Willkommen zurück'}<br>${registering?'auf dich.':'in der Arena.'}</h1>
    <p>${registering?'Erstelle dein Konto. Dein Held und dein Fortschritt werden online gespeichert.':'Melde dich an, um deinen Helden und deine Freunde zu laden.'}</p>
    <form id="login-form">
      ${registering?`<label class="field-label" for="auth-username">Spielername</label><input id="auth-username" class="name-input" name="username" maxlength="18" minlength="3" autocomplete="username" placeholder="Spielername" required />
      <label class="field-label" for="auth-email">E-Mail-Adresse</label><input id="auth-email" class="name-input" name="email" type="email" maxlength="254" autocomplete="email" placeholder="du@beispiel.de" required />`:`<label class="field-label" for="auth-login">Benutzername oder E-Mail</label><input id="auth-login" class="name-input" name="login" autocomplete="username" placeholder="Spielername oder E-Mail" required />`}
      <label class="field-label" for="auth-password">Passwort</label><input id="auth-password" class="name-input" name="password" type="password" minlength="${registering?10:1}" autocomplete="${registering?'new-password':'current-password'}" placeholder="${registering?'Mindestens 10 Zeichen':'Dein Passwort'}" required />
      ${registering&&hasLocalProfile?'<label class="import-option"><input type="checkbox" name="importLocal" checked><span>Vorhandenen lokalen Demo-Spielstand in dieses neue Konto übernehmen</span></label>':''}
      ${authError?`<div class="auth-error" role="alert">${clean(authError)}</div>`:''}
      <button class="button full" type="submit">${registering?'Konto erstellen':'Anmelden'} <span>→</span></button>
    </form>
    <button class="auth-mode-button" type="button" data-auth-mode="${registering?'login':'register'}">${registering?'Du hast schon ein Konto? Anmelden':'Noch kein Konto? Konto erstellen'}</button>
    <div class="demo-note"><span>🔒</span><span>Passwortgeschützte Konten · Spielstände werden auf dem Server gespeichert</span></div>
  </section></div>`;
}

function pageShell(content) {
  const nav = [ ['hub','Start'],['inventory','Inventar'],['quests','Quests'],['skills','Skillbaum'],['shop','Shop'],['friends','Freunde'],['leaderboard','Rang'],['settings','Einst.'] ];
  const active = page==='customize' ? 'settings' : page;
  return `<div class="app-shell ${page==='match'?'in-round':''}" data-theme="${profile.theme||'light'}"><header class="topbar"><button class="brand" data-page="hub" aria-label="Zur Startseite"><div class="brand-mark">HC</div><div><div class="brand-name">HERO CLASH</div><div class="brand-sub">ARENA · SAISON 01</div></div></button>
    <div class="top-actions">${offlineMode?'<span class="offline-pill">OFFLINE</span>':''}<div class="level-chip" aria-label="Level ${profile.level}"><span class="level-gem">✦</span><span>${profile.level}</span></div><div class="wallet" aria-label="Münzen"><span class="wallet-icon">◈</span><span>${profile.coins}</span></div><button class="profile-chip" data-page="settings" aria-label="Einstellungen"><span class="mini-face">${profile.face}</span><span>${clean(profile.name)}</span></button></div></header>
    <main class="main">${content}</main>
    <nav class="bottom-nav ${page==='match'?'is-hidden':''}" aria-label="Hauptmenü">${nav.map(([id,label]) => `<button class="nav-item ${active===id?'active':''}" data-page="${id}"><span class="nav-icon">${icons[id]}</span><span>${label}</span></button>`).join('')}</nav>
    <div id="overlay-root"></div></div>`;
}

function progressCard() {
  const need = xpForNextLevel(profile.level);
  return `<section class="card progress-card level-progress">
    <div class="level-row"><div class="level-badge">${profile.level}</div><div class="level-info"><b>Spielerlevel ${profile.level}</b><small>${formatXp.format(need-profile.xp)} XP bis Level ${profile.level+1}</small></div></div>
    <div class="progress-line" role="progressbar" aria-label="XP bis zum nächsten Spielerlevel" aria-valuenow="${profile.xp}" aria-valuemin="0" aria-valuemax="${need}"><span style="width:${profile.xp/need*100}%"></span></div>
    <div class="progress-meta"><span>Bis Level ${profile.level+1}</span><span>${formatXp.format(profile.xp)} / ${formatXp.format(need)} XP</span></div>
  </section>`;
}

function hubPage() {
  return `<section class="home-screen"><div class="home-copy"><div class="eyebrow">DEIN HELD · LEVEL ${profile.level}</div><h1>${clean(profile.name)}</h1></div>
    <div class="home-stage"><div class="stage-glow"></div><div class="stage-ring"></div><div class="stage-floor"></div>${avatarSvg('home-character')}</div>
    <div class="home-play-row"><button class="button play-button" data-action="start-round"><span class="play-triangle">▶</span> SPIELEN</button><button class="button difficulty-button" data-action="open-difficulty" aria-haspopup="menu" aria-expanded="false"><span>${difficultyName()}</span><span class="difficulty-caret" aria-hidden="true"></span></button></div>
  </section>`;
}

function customizePage() {
  const setup=!profile.onboarded;
  const cosmeticsBySlot=(slot)=>cosmetics.filter(item=>item.slot===slot&&profile.owned.includes(item.name));
  return `<div class="eyebrow">${setup?'ERST EINMAL DEINEN HELD GESTALTEN':'CHARAKTERSTUDIO'}</div><h1>${setup?'Dein erster Look.':'Charakter anpassen'}</h1><p class="page-intro">Haarfarbe und Gesicht ändern sich direkt in der Vorschau. Ausrüstung kannst du freischalten und hier anlegen.</p>
  <div class="customizer"><section class="card preview-card"><div class="preview-halo"></div><div class="hero-ground"></div>${avatarSvg()}</section><section class="card controls-card">
    <div class="control-group"><label>Frisur · Vorschau</label><div class="hair-style-grid">${hairStyles.map(style=>`<button class="hair-style-choice ${profile.hairStyle===style.id?'selected':''}" data-hair-style="${style.id}" aria-label="Frisur ${style.name}"><span class="hair-swatch">${hairPreviewSvg(style.id,swatches.includes(profile.hair)?profile.hair:swatches[0])}</span><small>${style.name}</small></button>`).join('')}</div></div>
    <div class="control-group"><label>Haarfarbe</label><div class="swatches">${swatches.map(c=>`<button class="swatch ${profile.hair===c?'selected':''}" aria-label="Haarfarbe ${c}" data-hair="${c}" style="background:${c}"></button>`).join('')}</div></div>
    <div class="control-group"><label>Hautton</label><div class="swatches skin-swatches">${skinTones.map(tone=>`<button class="swatch skin-swatch ${profile.skinTone===tone.id?'selected':''}" aria-label="Hautton ${tone.name}" title="${tone.name}" data-skin-tone="${tone.id}" style="background:linear-gradient(145deg,${tone.colors[0]},${tone.colors[2]})"></button>`).join('')}</div></div>
    <div class="control-group"><label>Gesichtsausdruck</label><div class="option-row">${['🙂','😎','😼','😴'].map(x=>`<button class="option ${profile.face===x?'selected':''}" data-face="${x}">${x}</button>`).join('')}</div></div>
    <div class="control-group"><label>Gesichtsdetails · Make-up</label><div class="option-row">${makeupOptions.map(item=>`<button class="option ${profile.makeup===item.id?'selected':''}" data-makeup="${item.id}">${item.name}</button>`).join('')}</div></div>
    ${[['head','Kopfbedeckung'],['face','Brille'],['body','Oberteil'],['feet','Schuhe']].map(([slot,label])=>`<div class="control-group"><label>${label}</label><div class="option-row"><button class="option ${!profile.cosmetics[slot]?'selected':''}" data-cosmetic="${slot}" data-item="">Standard</button>${cosmeticsBySlot(slot).map(item=>`<button class="option ${profile.cosmetics[slot]===item.name?'selected':''}" data-cosmetic="${slot}" data-item="${clean(item.name)}">${clean(item.name)}</button>`).join('')}</div></div>`).join('')}
    <div class="online-note"><span>✦</span><span>Deine Kleidung ist rein kosmetisch. Wähle Ausrüstung im Shop und lege sie anschließend hier oder im Inventar an.</span></div>
    <button class="button full" data-action="${setup?'finish-setup':'save-look'}">${setup?'Heldenlook bestätigen':'Änderungen speichern'} <span>✓</span></button>
  </section></div>`;
}

function difficultyName(){ return ({easy:'Einfach',normal:'Normal',hard:'Schwer'})[difficulty]; }

function playPage() {
  return `<div class="eyebrow">Arena-Modus</div><h1>Eine schnelle Runde?</h1><p class="page-intro">Besiege die Gegner, sammle Erfahrung und finde vielleicht eine neue Waffe.</p>
    <section class="card"><div class="card-row"><div><h2>Gegnerische Bots</h2><div class="muted" style="margin-top:5px;font-size:11px">Wähle die Schwierigkeit für deine Runde.</div></div><span class="tag">Solo</span></div>
    <div class="play-options">${[['easy','🌱','Entspannt','6 Gegner · weniger Schaden'],['normal','⚡','Normal','8 Gegner · ausgewogen'],['hard','🔥','Knifflig','10 Gegner · mehr Schaden']].map(([id,em,title,desc])=>`<button class="difficulty ${difficulty===id?'selected':''}" data-difficulty="${id}">${em}<b>${title}</b><small>${desc}</small></button>`).join('')}</div>
    <button class="button full" data-action="start-round">In die Arena <span>→</span></button>
    </section><div class="section-heading"><div><div class="eyebrow">Zusammen spielen</div><h2>Freunde einladen</h2></div></div>
    <div class="online-note"><span>🌐</span><span>Füge im Freunde-Menü Spieler hinzu und fordere Online-Freunde zu einem 1-gegen-1 heraus.</span></div>`;
}

function matchPage() {
  const weapon=arenaWeapon();
  const pvp=match?.mode==='pvp',opponent=match?.remotePlayer;
  const selectedDuel=duelModes.find(item=>item.id===match?.duelMode)||duelModes[1];
  const loaded=match?.player||{},ammoWeapon=Boolean(weapon.ammo),mapName=match?.map?.name||'Arena';
  const magazine=Number.isFinite(loaded.magazine)?loaded.magazine:weapon.ammo?.mag||0,reserve=Number.isFinite(loaded.ammo)?loaded.ammo:weapon.ammo?.reserve||0;
  return `<div class="arena-topline"><div><div class="eyebrow">ARENA · ${pvp?'1 VS 1 · '+clean(selectedDuel.name):difficultyName().toUpperCase()} · ${clean(mapName)}</div><h1>${pvp?`Gegen ${clean(opponent?.name||'Freund')}`:'Halte die Arena.'}</h1></div><div class="arena-top-actions"><div class="arena-weapon">${weaponSvg(weapon.name)}<span>${clean(weapon.name)}</span></div><button class="button ghost small pause-button" data-action="pause-round" aria-label="Runde pausieren"><span aria-hidden="true">Ⅱ</span><span>Pause</span></button></div></div>
    <section class="card arena-card"><div class="arena-hud"><div class="health-track"><span id="health-fill"></span></div><b id="health-text" style="font-size:11px"></b><span class="hud-count" id="enemy-count"></span><span class="hud-round" id="wave-count">${pvp?'DUELL':`WELLE ${match?.wave||1}/3`}</span><span class="hud-money" id="round-money">◈ ${match?.coinsEarned||0}</span><span class="hud-crit">KRIT ${Math.round(critChance()*100)}%</span></div>${pvp?`<div class="opponent-health-row"><span>${clean(opponent?.name||'Gegner')}</span><div class="health-track opponent-health-track"><span id="opponent-health-fill"></span></div><b id="opponent-health-text">${Math.ceil(opponent?.hp||100)} HP</b></div>`:''}<canvas id="arena" aria-label="Spielarena"></canvas>
    <div class="arena-controls">
      <div class="joystick-area" id="joystick-area" aria-label="Bewegen"><div class="joystick-base"><div class="joystick-knob" id="joystick-knob"></div></div><small>BEWEGEN</small></div>
      <div class="combat-buttons">
        <button class="dodge-key" data-action="dodge"><span>↗</span><small>AUSWEICHEN</small><i id="dodge-status">BEREIT</i></button>
        <button class="attack-key" data-action="attack"><span>${ammoWeapon?'⌖':'✦'}</span><small>${ammoWeapon?'FEUERN':'ANGRIFF'}</small><i id="attack-status">BEREIT</i></button>
        ${ammoWeapon?`<button class="reload-key" data-action="reload" aria-label="Nachladen"><span>↻</span><small>NACHLADEN</small><i id="ammo-count">${magazine}/${reserve}</i></button>`:''}
      </div>
      <div class="aim-joystick-area" id="aim-joystick-area" aria-label="Zielen und beim Loslassen angreifen"><div class="joystick-base aim-base"><div class="joystick-knob" id="aim-joystick-knob"></div></div><small>ZIELEN</small></div>
    </div>
    <div class="arena-note">Rechten Joystick ziehen und zum Angriff loslassen.</div></section>
    <div class="arena-exit"><button class="button ghost small" data-action="leave-round">${pvp?'Kampf verlassen':'Runde beenden'}</button></div>`;
}

function inventoryPage() {
  const ownedWeapons=weapons.filter(item=>profile.owned.includes(item.name));
  const ownedArmors=armors.filter(item=>profile.owned.includes(item.name));
  const ownedBoots=boots.filter(item=>profile.owned.includes(item.name));
  const ownedLooks=cosmetics.filter(item=>profile.owned.includes(item.name));
  return `<div class="eyebrow">AUSRÜSTUNG</div><h1>Dein Inventar</h1><p class="page-intro">Dein Held und deine Fundstücke. Rüstungen geben Werte; Kleidung verändert nur den Look.</p>
    <div class="inventory-layout"><section class="card inventory-hero"><div class="inventory-hero-title"><div><div class="eyebrow">HELD · LEVEL ${profile.level}</div><h2>${clean(profile.name)}</h2></div><button class="button ghost small" data-page="customize">Anpassen</button></div><div class="inventory-stage"><div class="preview-halo"></div>${avatarSvg('inventory-character')}</div><div class="equipped-slots"><div><small>WAFFE</small><b>${clean(profile.weapon)}</b></div><div><small>RÜSTUNG</small><b>${clean(profile.armor)}</b></div><div><small>STIEFEL · TEMPO</small><b>${clean(profile.boots)} · +${Math.round((currentBoots().speed-1)*100)} %</b></div><div><small>KLEIDUNG</small><b>${clean(profile.cosmetics.body||'Standard')}</b></div><div><small>LEBEN</small><b>${100+(profile.skills.health||0)*15+currentArmor().hp} HP</b></div></div></section>
    <section class="inventory-items"><div class="section-heading compact"><div><div class="eyebrow">DEINE SAMMLUNG</div><h2>Gegenstände <span class="muted">${ownedWeapons.length+ownedArmors.length+ownedBoots.length+ownedLooks.length}</span></h2></div><button class="button ghost small" data-page="shop">Zum Shop ↗</button></div>
      <div class="inventory-category"><div class="category-title"><h3>Waffen & Klingen</h3><span>${ownedWeapons.length}</span></div><div class="inventory-grid">${ownedWeapons.map(item=>inventoryItem(item,'weapon')).join('')}</div></div>
      <div class="inventory-category"><div class="category-title"><h3>Rüstungen</h3><span>${ownedArmors.length}</span></div><div class="inventory-grid">${ownedArmors.map(item=>inventoryItem(item,'armor')).join('')}</div></div>
      <div class="inventory-category"><div class="category-title"><h3>Stiefel · Bewegungseffekt</h3><span>${ownedBoots.length}</span></div><div class="inventory-grid">${ownedBoots.map(item=>inventoryItem(item,'boots')).join('')}</div></div>
      <div class="inventory-category"><div class="category-title"><h3>Kleidung · kosmetisch</h3><span>${ownedLooks.length}</span></div><div class="inventory-grid">${ownedLooks.map(item=>inventoryItem(item,'cosmetic')).join('')}</div></div>
      ${ownedWeapons.length+ownedArmors.length+ownedBoots.length+ownedLooks.length===0?'<div class="card empty-state">Noch keine Fundstücke. Schau im Shop vorbei!</div>':''}</section></div>`;
}
function inventoryItem(item,kind) {
  const equipped=kind==='weapon'?profile.weapon===item.name:kind==='armor'?profile.armor===item.name:kind==='boots'?profile.boots===item.name:profile.cosmetics[item.slot]===item.name;
  const art=kind==='weapon'?weaponSvg(item.name):kind==='armor'?armorSvg(item.name):kind==='boots'?bootsSvg(item.name):cosmeticSvg(item.name);
  const stats=kind==='weapon'?`${item.damage} SCHADEN · ${item.ammo?`${item.ammo.mag} SCHUSS · ${item.cooldown}s CD`:`${item.cooldown}s CD`} · KRIT ${Math.round((.1+item.crit)*100)}%`:kind==='armor'?`+${item.hp} HP · ${Math.round(item.resist*100)}% SCHUTZ`:kind==='boots'?`TEMPO +${Math.round((item.speed-1)*100)}%`:`${item.slot.toUpperCase()} · KOSMETISCH`;
  return `<article class="item-card"><div class="item-art">${art}</div><div class="item-card-copy"><b>${clean(item.name)}</b><small>${stats}</small>${kind==='weapon'?`<small class="weapon-source">${clean(weaponSource(item.name))}</small>`:''}</div><div class="item-card-actions"><button class="icon-action" data-info="${clean(item.name)}" aria-label="Info zu ${clean(item.name)}">i</button><button class="button ${equipped?'equipped-button':'secondary'} small" data-equip="${clean(item.name)}" data-kind="${kind}">${equipped?'Angelegt':'Anlegen'}</button></div></article>`;
}

function questProgress(q) {
  if (q.id==='wins') return Math.min(profile.daily.wins, q.goal);
  if (q.id==='kills') return Math.min(profile.daily.kills, q.goal);
  return Math.min(Number(profile.daily.xp||0), q.goal);
}
function weaponQuestProgress(goal) {
  const value = goal.stat === 'level' ? profile.level : goal.stat === 'bossMaps' ? profile.stats.bossMaps.length : profile.stats[goal.stat];
  return Math.min(value, goal.count);
}
function weaponQuestCard(quest) {
  const progress = quest.goals.map(goal => ({ ...goal, value: weaponQuestProgress(goal) }));
  const claimed = profile.weaponQuestClaims.includes(quest.id);
  const complete = progress.every(goal => goal.value === goal.count);
  const owned = profile.owned.includes(quest.weapon);
  return `<article class="card weapon-quest-card ${complete&&!claimed?'quest-ready':''}" id="weapon-quest-${quest.id}">
    <header class="weapon-quest-heading">${weaponSvg(quest.weapon)}<div><h3>${clean(quest.title)}</h3><p>${clean(quest.weapon)} · +${quest.xp} XP</p></div></header>
    <ul class="weapon-goals">${progress.map(goal => `<li><div class="quest-goal-label"><span>${clean(goal.label)}</span><b>${goal.value} / ${goal.count}</b></div><div class="progress-line" role="progressbar" aria-label="${clean(goal.label)}" aria-valuemin="0" aria-valuenow="${goal.value}" aria-valuemax="${goal.count}"><span style="width:${goal.value/goal.count*100}%"></span></div></li>`).join('')}</ul>
    <footer class="weapon-quest-footer">
      ${!claimed&&owned?'<small>Waffe bereits im Inventar</small>':''}
      <button class="button ${complete&&!claimed?'':'ghost'} small" data-claim-weapon-quest="${quest.id}" ${complete&&!claimed?'':'disabled'}>${claimed?'Abgeholt':!complete?'Ziele offen':owned?'XP abholen':'Waffe abholen'}</button>
    </footer>
  </article>`;
}
function questsPage() {
  ensureDaily();
  return `<h1>Quests</h1><p class="page-intro">Deine Waffenquests laufen dauerhaft. Sobald alle Ziele erfüllt sind, kannst du die Belohnung hier abholen.</p>
  <section aria-labelledby="weapon-quests-title"><div class="section-heading"><h2 id="weapon-quests-title">Waffenquests</h2><span class="muted">${profile.weaponQuestClaims.length} / ${weaponQuests.length} abgeholt</span></div>
  <div class="weapon-quest-grid">${weaponQuests.map(weaponQuestCard).join('')}</div></section>
  <div class="section-heading"><div><div class="eyebrow">${new Date().toLocaleDateString('de-DE',{day:'2-digit',month:'long'})}</div><h2>Tägliche Quests</h2></div></div>
  <div class="card-stack">${qdefs.map(q=>{const n=questProgress(q), claimed=profile.daily.claims.includes(q.id);return `<article class="card"><div class="quest-top"><div class="item-icon">${q.icon}</div><div class="item-copy"><h3>${q.title}</h3><p>${q.desc}</p></div><div class="quest-count">${n}/${q.goal}</div></div><div class="progress-line"><span style="width:${n/q.goal*100}%"></span></div><div class="card-row" style="margin-top:11px"><span class="quest-reward">+${q.reward} ◈ &nbsp; +${q.xp} XP</span><button class="button ${claimed?'ghost':''} small" data-claim-quest="${q.id}" ${n<q.goal||claimed?'disabled':''}>${claimed?'Abgeholt':'Belohnung holen'}</button></div></article>`}).join('')}</div>
  <div class="season-link card-row"><div><b>Battle Pass</b><small>Kosmetische Belohnungen aus dem Sternenpfad.</small></div><button class="button ghost small" data-page="pass">Ansehen ↗</button></div>
  <div class="section-heading"><h2>Glücksrad</h2></div><button class="card card-row" data-page="wheel" style="width:100%;cursor:pointer;text-align:left"><div class="item-icon">🎡</div><div class="item-copy"><h3>Einmal täglich drehen</h3><p>Ein kleiner Bonus an XP oder Münzen.</p></div><span class="muted">→</span></button>`;
}

function skillsPage() {
  const coords=Object.fromEntries(skillDefs.map(s=>[s.id,s]));
  const lines=skillDefs.flatMap(s=>s.requires.map(id=>{const from=coords[id];return `<path d="M${from.x+40} ${from.y+42} L${s.x+40} ${s.y+42}" class="skill-link ${profile.skills[id]>0?'lit':''}"/>`;})).join('');
  return `<div class="eyebrow">DEINE ENTWICKLUNG</div><div class="skill-heading"><div><h1>Skillbaum</h1><p class="page-intro">Wische durch den Baum. Ein neues Level gibt dir einen Punkt; Knoten schalten weitere Pfade frei.</p></div><div class="points-card"><span>✦</span><b>${profile.skillPoints}</b><small>PUNKTE</small></div></div>
    ${progressCard()}
    <section class="card skill-legend"><span><i class="legend-dot ready"></i> Verfügbar</span><span><i class="legend-dot owned"></i> Aktiv</span><span><i class="legend-dot locked"></i> Gesperrt</span></section>
    <div class="skill-viewport" aria-label="Wischbarer Skillbaum"><div class="skill-board"><svg class="skill-lines" viewBox="0 0 760 850" aria-hidden="true">${lines}</svg>${skillDefs.map(s=>skillNode(s)).join('')}</div></div>
    <div class="skill-scroll-hint">↔ Wische, um den ganzen Skillbaum anzusehen ↕</div>`;
}
function skillIconSvg(id) {
  const paths={health:'<path d="M50 82 18 52C-1 29 26 7 50 28 74 7 101 29 82 52Z"/>',might:'<path d="m50 9 12 25 27 4-19 19 5 28-25-13-25 13 5-28-19-19 27-4Z"/>',precision:'<circle cx="50" cy="50" r="34"/><circle cx="50" cy="50" r="20"/><circle cx="50" cy="50" r="7"/>',quickstep:'<path d="M18 67h42c12 0 16-7 16-17V22M18 48l17 19-17 19"/><path d="m59 22 17-17 17 17"/>',dodge:'<path d="M16 61q14-39 40-36 18 2 28 22"/><path d="m66 41 18 7 4-18"/><path d="M23 78h54"/>',focus:'<path d="M18 50h64M50 18v64"/><circle cx="50" cy="50" r="29"/><path d="m38 50 8 8 17-19"/>',luck:'<path d="M20 30q16-20 30 0 14-20 30 0t-8 27L50 78 28 57q-12-12-8-27Z"/><path d="m32 48 9-10 9 11 10-12 9 11"/>',mastery:'<path d="M20 76 76 20M25 20l55 55M50 8v84M8 50h84"/><circle cx="50" cy="50" r="13"/>'};
  return `<svg viewBox="0 0 100 100" aria-hidden="true" class="skill-icon-svg"><g>${paths[id]||paths.might}</g></svg>`;
}
function skillNode(s) {
  const level=profile.skills[s.id]||0,ready=s.requires.every(id=>profile.skills[id]>0),maxed=level>=s.max;
  return `<button class="skill-node-hex ${level?'owned':''} ${ready&&!maxed?'ready':''} ${!ready?'locked':''}" style="left:${s.x}px;top:${s.y}px" data-skill="${s.id}" aria-label="${s.title}, Stufe ${level} von ${s.max}"><span class="skill-node-icon">${skillIconSvg(s.icon)}</span><span class="skill-node-name">${s.title}</span><span class="skill-node-level">${level}/${s.max}</span></button>`;
}

function passPage() {
  const reached = passRewards.filter(reward=>profile.passXp>=reward.xp).length;
  const previousXp = passRewards[reached-1]?.xp || 0;
  const next = passRewards[reached];
  const inStage = profile.passXp - previousXp;
  return `<div class="eyebrow">BATTLE PASS · SAISON 01</div><h1>Sternenpfad</h1><p class="page-intro">Jede Stufe braucht mehr XP als die vorige und schaltet einen neuen Look frei.</p>
  <section class="card progress-card level-progress">
    <div class="progress-meta"><b>${reached} / ${passRewards.length} Stufen erreicht</b><span>${formatXp.format(profile.passXp)} XP gesamt</span></div>
    ${next?`<div class="progress-line" role="progressbar" aria-label="XP bis zur nächsten Pass-Stufe" aria-valuemin="0" aria-valuenow="${inStage}" aria-valuemax="${next.xp-previousXp}"><span style="width:${inStage/(next.xp-previousXp)*100}%"></span></div><div class="progress-meta"><span>Bis Stufe ${reached+1}</span><span>${formatXp.format(inStage)} / ${formatXp.format(next.xp-previousXp)} XP</span></div>`:'<p class="pass-complete">Alle Pass-Stufen erreicht.</p>'}
  </section>
  <ol class="season-track">${passRewards.map((reward,index)=>{
    const unlocked = index < reached, claimed = profile.passClaims.includes(index);
    const required = reward.xp - (passRewards[index-1]?.xp || 0);
    return `<li class="pass-tier ${unlocked?'unlocked':''}"><b>Stufe ${index+1}</b><div class="tier-art">${cosmeticSvg(reward.item)}</div><h2>${clean(reward.title)}</h2><small>${formatXp.format(required)} XP für diese Stufe<br>${formatXp.format(reward.xp)} XP gesamt</small><button class="button ${claimed||!unlocked?'ghost':''} small" data-pass-claim="${index}" ${!unlocked||claimed?'disabled':''}>${claimed?'Abgeholt':unlocked?'Abholen':'Gesperrt'}</button></li>`;
  }).join('')}</ol>`;
}

function shopPage() {
  return `<div class="eyebrow">Camp-Kiosk</div><h1>Shop</h1><p class="page-intro">Neue Waffen und Looks gegen deine gesammelten Münzen.</p>
  <div class="section-heading" style="margin-top:0"><div><div class="eyebrow">ARENA-AUSRÜSTUNG</div><h2>Waffen</h2></div></div><div class="shop-grid">${weapons.map(w=>shopItem(w,'weapon')).join('')}</div>
  <div class="section-heading"><div><div class="eyebrow">VERTEIDIGUNG · ECHTE WERTE</div><h2>Rüstungen</h2></div></div><div class="shop-grid armor-shop-grid">${armors.filter(item=>!profile.owned.includes(item.name)).map(item=>shopItem(item,'armor')).join('')}</div>
  <div class="section-heading"><div><div class="eyebrow">AUSRÜSTUNG · TEMPO</div><h2>Stiefel</h2></div></div><div class="shop-grid armor-shop-grid">${boots.filter(item=>!profile.owned.includes(item.name)).map(item=>shopItem(item,'boots')).join('')}</div>
  <div class="section-heading"><div><div class="eyebrow">LOOKS · NUR KOSMETISCH</div><h2>Kleidung</h2></div></div><div class="shop-grid cosmetics-grid">${cosmetics.filter(c=>c.shop!==false&&!profile.owned.includes(c.name)).map(c=>shopItem(c,'cosmetic')).join('')}</div>
  <div class="season-link card-row"><div><b>Clash-Pass</b><small>Hol dir saisonale Looks mit deinen Runden-XP.</small></div><button class="button ghost small" data-page="pass">Ansehen ↗</button></div>`;
}
function shopItem(item,type) {
  const owned=profile.owned.includes(item.name);
  const art=type==='weapon'?weaponSvg(item.name):type==='armor'?armorSvg(item.name):type==='boots'?bootsSvg(item.name):cosmeticSvg(item.name);
  const stats=type==='weapon'?`<div class="stat-pills"><span>SCHADEN ${item.damage}</span><span>KRIT ${Math.round((.1+item.crit)*100)}%</span><span>${item.ammo?`${item.ammo.mag} SCHUSS`: 'NAHKAMPF'}</span><span>CD ${item.cooldown}s</span></div>`:type==='armor'?`<div class="stat-pills"><span>+${item.hp} HP</span><span>${Math.round(item.resist*100)}% SCHUTZ</span></div>`:type==='boots'?`<div class="stat-pills"><span>+${Math.round((item.speed-1)*100)}% TEMPO</span><span>NUR ANGELEGT</span></div>`:'';
  return `<article class="shop-item-card"><div class="shop-art ${type}">${art}</div><div class="shop-item-copy"><div class="item-overline">${type==='weapon'?'ARENA-WAFFE':type==='armor'?'RÜSTUNG · MIT EFFEKT':type==='boots'?'RÜSTUNGSSTIEFEL · TEMPO':'KOSMETIK'}</div><h3>${clean(item.name)}</h3><p>${clean(item.desc)}</p>${stats}<div class="shop-card-actions"><button class="icon-action" data-info="${clean(item.name)}" aria-label="Info zu ${clean(item.name)}">i</button><button class="button ${owned?'ghost':'secondary'} small" data-buy="${clean(item.name)}" data-kind="${type}" ${owned||profile.coins<item.price?'disabled':''}>${owned?'Im Inventar':`◈ ${item.price} · Kaufen`}</button></div></div></article>`;
}

function wheelPage() {
  ensureDaily(); const used=profile.daily.claims.includes('wheel');
  return `<div class="eyebrow">TÄGLICHER BONUS</div><h1>Clash-Rad</h1><p class="page-intro">Die Gewinne stehen direkt auf dem Rad. Ein kostenloser Dreh pro Tag.</p>
  <section class="card wheel-card"><div class="wheel-ring"><span class="wheel-pointer">▼</span><div class="wheel" id="wheel">${wheelSvg()}<div class="wheel-center">HC</div></div></div><div class="wheel-result" id="wheel-result">${used?'Dein Dreh für heute ist schon verbraucht.':'Der Zeiger zeigt auf deinen Tagesgewinn.'}</div><button class="button wheel-spin-button ${used?'ghost':''}" data-action="spin" ${used?'disabled':''}>${used?'Morgen wieder drehen':'RAD DREHEN'}</button><div class="wheel-caption">Münzen oder XP · kein Einsatz erforderlich</div></section>`;
}
const wheelPrizes=[{kind:'coins',value:20,label:'20 ◈'},{kind:'xp',value:20,label:'20 XP'},{kind:'coins',value:40,label:'40 ◈'},{kind:'xp',value:35,label:'35 XP'},{kind:'coins',value:60,label:'60 ◈'},{kind:'xp',value:60,label:'60 XP'}];
function wheelSvg() {
  const fills=['var(--wheel-a)','var(--wheel-b)','var(--wheel-c)','var(--wheel-d)','var(--wheel-e)','var(--wheel-f)'];
  const sectors=wheelPrizes.map((item,i)=>{const a0=(-90+i*60)*Math.PI/180,a1=(-90+(i+1)*60)*Math.PI/180,r=110,c=120,x0=c+r*Math.cos(a0),y0=c+r*Math.sin(a0),x1=c+r*Math.cos(a1),y1=c+r*Math.sin(a1),mid=(-60+i*60)*Math.PI/180,tx=c+69*Math.cos(mid),ty=c+69*Math.sin(mid);return `<path d="M${c} ${c}L${x0} ${y0}A${r} ${r} 0 0 1 ${x1} ${y1}Z" fill="${fills[i]}" stroke="var(--wheel-border)" stroke-width="2"/><text x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="middle" class="wheel-label">${item.label}</text>`;}).join('');
  return `<svg viewBox="0 0 240 240" aria-label="Rad mit sichtbaren Gewinnen">${sectors}<circle cx="120" cy="120" r="110" fill="none" stroke="var(--wheel-outline)" stroke-width="5"/></svg>`;
}

function settingsPage() {
  return `<div class="eyebrow">DEIN SPIEL</div><h1>Einstellungen</h1><p class="page-intro">Gestalte deinen Helden und passe das Spielerlebnis an.</p>
    <section class="settings-profile card"><div class="settings-avatar">${avatarSvg()}</div><div class="settings-profile-copy"><div class="eyebrow">LEVEL ${profile.level}</div><h2>${clean(profile.name)}</h2><p>Haar, Gesicht und Ausrüstung deines Helden.</p><button class="button secondary small" data-page="customize">Charakter anpassen ↗</button></div></section>
    <section class="card settings-section"><div class="section-heading compact"><div><div class="eyebrow">ERSCHEINUNGSBILD</div><h2>Farbschema</h2></div></div><div class="theme-picker"><button class="theme-choice ${profile.theme==='light'?'selected':''}" data-theme-choice="light"><span class="theme-preview light-preview"><i></i><i></i></span><b>Hell</b></button><button class="theme-choice ${profile.theme==='dark'?'selected':''}" data-theme-choice="dark"><span class="theme-preview dark-preview"><i></i><i></i></span><b>Dunkel</b></button></div></section>
    <section class="card settings-section"><div class="section-heading compact"><div><div class="eyebrow">AUDIO</div><h2>Musik & Effekte</h2></div></div>
      <div class="setting"><div><b>Hintergrundmusik</b><small>Leise, generierte Arena-Musik</small></div><button class="switch ${profile.musicEnabled?'on':''}" data-toggle="musicEnabled" aria-label="Musik umschalten"></button></div>
      <label class="volume-row"><span>Musiklautstärke</span><input type="range" min="0" max="100" value="${Math.round(profile.musicVolume*100)}" data-volume="musicVolume"><output>${Math.round(profile.musicVolume*100)}%</output></label>
      <div class="setting"><div><b>Kampfsounds</b><small>Treffer, Ausweichen und Menüs</small></div><button class="switch ${profile.soundEnabled?'on':''}" data-toggle="soundEnabled" aria-label="Effekte umschalten"></button></div>
      <label class="volume-row"><span>Effektlautstärke</span><input type="range" min="0" max="100" value="${Math.round(profile.effectsVolume*100)}" data-volume="effectsVolume"><output>${Math.round(profile.effectsVolume*100)}%</output></label>
    </section>
    <section class="card settings-section"><div class="section-heading compact"><div><div class="eyebrow">KONTO</div><h2>${clean(profile.name)}</h2></div><button class="button ghost small" data-action="rename">Umbenennen</button></div><div class="online-note"><span>☁</span><span>@${clean(currentUser?.username||profile.name)} · ${clean(currentUser?.email||'')}<br>Cloud-Spielstand · Level ${profile.level} · ${profile.stats.wins} gewonnene Runden</span></div><button class="button ghost small logout-button" data-action="logout">Abmelden</button></section>`;
}

function friendsPage() {
  if(offlineMode)return `<div class="eyebrow">OFFLINE</div><h1>Freunde</h1><p class="page-intro">Freundesliste und 1-gegen-1 brauchen eine Internetverbindung. Du kannst gerade Solo spielen; deine Änderungen werden beim nächsten Online-Login synchronisiert.</p>`;
  const friends=friendData.friends.map(friend=>{const online=friendData.online.has(friend.id);return `<article class="friend-card"><div class="friend-avatar">${clean((friend.name||friend.username).slice(0,1).toUpperCase())}</div><div class="friend-copy"><b>${clean(friend.name)}</b><small>@${clean(friend.username)} · <span class="presence ${online?'online':''}">${online?'Online':'Offline'}</span></small></div><button class="button ${online?'':'ghost'} small" data-challenge="${clean(friend.id)}" ${online?'':'disabled'}>1 vs 1</button></article>`;}).join('');
  const incoming=friendData.incoming.map(friend=>`<article class="friend-card request-card"><div class="friend-avatar">${clean((friend.name||friend.username).slice(0,1).toUpperCase())}</div><div class="friend-copy"><b>${clean(friend.name)}</b><small>@${clean(friend.username)} · Anfrage</small></div><button class="button small" data-friend-accept="${clean(friend.id)}">Annehmen</button><button class="button ghost small" data-friend-decline="${clean(friend.id)}" aria-label="Anfrage ablehnen">×</button></article>`).join('');
  const outgoing=friendData.outgoing.map(friend=>`<article class="friend-card"><div class="friend-avatar muted-avatar">${clean((friend.name||friend.username).slice(0,1).toUpperCase())}</div><div class="friend-copy"><b>${clean(friend.name)}</b><small>@${clean(friend.username)} · Ausstehend</small></div><span class="request-pending">Gesendet</span></article>`).join('');
  return `<div class="eyebrow">ZUSAMMEN SPIELEN</div><h1>Freunde</h1><p class="page-intro">Füge Freunde mit ihrem Benutzernamen hinzu. Lade online Freunde zu einem Live-1-gegen-1 ein.</p>
    <label class="duel-mode-picker">Duellmodus<select id="duel-mode">${duelModes.map(mode=>`<option value="${mode.id}" ${duelMode===mode.id?'selected':''}>${mode.name} · ${mode.desc}</option>`).join('')}</select></label>
    <form class="card friend-add-form" id="friend-add-form"><label class="field-label" for="friend-username">Freund hinzufügen</label><div class="friend-add-row"><input id="friend-username" class="name-input" name="username" maxlength="18" autocomplete="off" placeholder="Benutzername" required/><button class="button" type="submit">Anfrage senden</button></div><div class="friend-form-message" id="friend-form-message" aria-live="polite"></div></form>
    <div class="friend-section-heading"><h2>Deine Freunde</h2><span>${friendData.friends.length} · ${[...friendData.online].filter(id=>friendData.friends.some(f=>f.id===id)).length} online</span></div>
    <section class="card friend-list">${friendData.loading&&!friendData.loaded?'<div class="friend-empty">Freundesliste wird geladen …</div>':friends||'<div class="friend-empty">Noch keine Freunde. Suche oben nach ihrem Benutzernamen.</div>'}</section>
    ${friendData.incoming.length?`<div class="friend-section-heading"><h2>Anfragen</h2><span>${friendData.incoming.length}</span></div><section class="card friend-list">${incoming}</section>`:''}
    ${friendData.outgoing.length?`<div class="friend-section-heading"><h2>Ausstehend</h2></div><section class="card friend-list">${outgoing}</section>`:''}
    <div class="online-note friend-help"><span>⚔</span><span>1-gegen-1 startet per Einladung. Beide Spieler brauchen ein Konto und müssen gleichzeitig online sein.</span></div>`;
}

function leaderboardPage(){
  if(offlineMode)return `<div class="eyebrow">OFFLINE</div><h1>Bestenliste</h1><p class="page-intro">Die Bestenliste wird geladen, sobald du wieder online bist.</p>`;
  const rows=leaderboardData.players.map((player,index)=>`<article class="leader-row ${player.username===currentUser?.username?'leader-self':''}"><span class="leader-rank">${index+1}</span><div class="leader-copy"><b>${clean(player.name||player.username)}</b><small>@${clean(player.username)}</small></div><span class="leader-stat"><b>${player.level}</b><small>LEVEL</small></span><span class="leader-stat"><b>${player.pvp_wins}</b><small>PVP</small></span></article>`).join('');
  const status=leaderboardData.error||(!leaderboardData.loaded?'Bestenliste wird geladen …':'Noch keine Konten in der Liste.');
  return `<div class="eyebrow">ALLE SPIELER</div><h1>Bestenliste</h1><p class="page-intro">Sortiert nach Level und danach nach 1-gegen-1-Siegen.</p><section class="card leaderboard-list">${rows||`<div class="friend-empty">${clean(status)}</div>`}</section>`;
}

function morePage() {
  return `<div class="eyebrow">Weitere Menüs</div><h1>Camp-Menü</h1><p class="page-intro">Fähigkeiten, Saison-Belohnungen und Einstellungen.</p><div class="card-stack">
  <button class="card card-row" data-page="skills" style="text-align:left;cursor:pointer"><div class="item-icon">🌿</div><div class="item-copy"><h3>Skillbaum</h3><p>Fähigkeiten mit XP und Skill-Punkten verbessern.</p></div><span class="muted">→</span></button>
  <button class="card card-row" data-page="pass" style="text-align:left;cursor:pointer"><div class="item-icon">🎟️</div><div class="item-copy"><h3>Sternenpfad</h3><p>Kosmetische Belohnungen freischalten.</p></div><span class="muted">→</span></button>
  <button class="card card-row" data-page="wheel" style="text-align:left;cursor:pointer"><div class="item-icon">🎡</div><div class="item-copy"><h3>Glücksrad</h3><p>Dein täglicher Bonus.</p></div><span class="muted">→</span></button>
  <button class="card card-row" data-page="settings" style="text-align:left;cursor:pointer"><div class="item-icon">⚙️</div><div class="item-copy"><h3>Einstellungen</h3><p>Spielername und Anzeigeoptionen.</p></div><span class="muted">→</span></button></div>`;
}

const pages = { hub:hubPage, customize:customizePage, match:matchPage, inventory:inventoryPage, quests:questsPage, skills:skillsPage, pass:passPage, shop:shopPage, friends:friendsPage, leaderboard:leaderboardPage, wheel:wheelPage, settings:settingsPage };
function render() {
  closeDifficultyMenu?.();
  document.body.classList.toggle('round-active',page==='match'&&Boolean(profile&&match));
  if (!profile) { app.innerHTML=loginScreen(); bind(); return; }
  if(!profile.onboarded) page='customize';
  if (page==='match' && match) { app.innerHTML=pageShell(matchPage()); startLoop(); }
  else { stopLoop(); app.innerHTML=pageShell((pages[page]||hubPage)()); }
  bind();
  if(page==='friends') refreshFriends();
  if(page==='leaderboard')refreshLeaderboard();
}
async function submitAuth(form) {
  const button=form.querySelector('button[type="submit"]');button.disabled=true;authError='';
  try {
    const registering=authMode==='register';
    const payload=registering
      ? { username:form.elements.username.value.trim(),email:form.elements.email.value.trim(),password:form.elements.password.value }
      : { login:form.elements.login.value.trim(),password:form.elements.password.value };
    const result=await api(registering?'/api/auth/register':'/api/auth/login',{method:'POST',body:JSON.stringify(payload)});
    const importedProfile=registering&&form.elements.importLocal?.checked?legacyProfile():null;
    useAccount(result);
    if (importedProfile) { profile = normalizeProfile(importedProfile, currentUser.username); save(); }
    page=profile.onboarded?'hub':'customize';
    setupSocket();startAudio();render();playSound('confirm');showUpdateVlog();syncProfile();
  } catch(error) { authError=error.message;render(); }
  finally { const active=document.querySelector('#login-form button[type="submit"]');if(active)active.disabled=false; }
}
function useAccount(result) {
  currentUser = result.user;
  offlineMode = false;
  const account = { id: currentUser.id, username: currentUser.username };
  const cached = readAccountCache(account.id);
  const cloud = normalizeProfile(result.profile, account.username);
  profileSync = cached?.pending ? { ...cached, account, base: normalizeProfile(cached.base, account.username) } : { account, base: cloud, version: result.profileVersion, pending: false, write: null };
  delete profileSync.profile;
  profile = cached?.pending ? normalizeProfile(cached.profile, account.username) : structuredClone(cloud);
  localStorage.setItem(ACTIVE_PROFILE_KEY, account.id);
  cacheAccount();
}
async function restoreSession() {
  if (page === 'match' || reconnecting) return;
  reconnecting = true;
  const initial = restoringSession;
  try {
    const result = await api('/api/auth/me');
    if (page === 'match') return;
    useAccount(result);
    if (initial) page=profile.onboarded?'hub':'customize';
    setupSocket();
    await syncProfile();
  } catch (error) {
    if (page === 'match') return;
    currentUser = null;
    const cached = readAccountCache(localStorage.getItem(ACTIVE_PROFILE_KEY));
    if (cached?.account && error.status !== 401) {
      profileSync = cached;
      profile = normalizeProfile(cached.profile, cached.account.username);
      offlineMode = true;
      if (initial) page=profile.onboarded?'hub':'customize';
    } else {
      profile = null;
      offlineMode = false;
      authError = error.status === 401 ? '' : error.message;
    }
  } finally {
    reconnecting = false;
    restoringSession = false;
    if (page !== 'match') render();
  }
  if(currentUser)showUpdateVlog();
}
function setupSocket() {
  if (!window.io||!currentUser) return;
  socket?.disconnect();socket=window.io();
  socket.on('connect_error',error=>{if(currentUser)toast(error.message||'Verbindung zur Arena fehlgeschlagen.');});
  socket.on('friends:presence',ids=>{friendData.online=new Set(ids||[]);if(page==='friends')render();});
  socket.on('friend:presence',({userId,online})=>{if(online)friendData.online.add(userId);else friendData.online.delete(userId);if(page==='friends')render();});
  socket.on('friends:refresh',()=>{friendData.loaded=false;refreshFriends(true);});
  socket.on('friend:challenge:incoming',invite=>showIncomingChallenge(invite));
  socket.on('friend:challenge:expired',()=>{document.querySelector('#overlay-root').innerHTML='';toast('Die Einladung ist abgelaufen.');});
  socket.on('friend:challenge:declined',who=>{toast(`${who.name||'Dein Freund'} hat die Einladung abgelehnt.`);});
  socket.on('pvp:started',snapshot=>enterPvpMatch(snapshot));
  socket.on('pvp:state',snapshot=>updatePvpState(snapshot));
  socket.on('pvp:attack-result',result=>handlePvpAttack(result));
  socket.on('pvp:blast',blast=>{if(match?.mode==='pvp'&&!match.over){match.blasts.push({...blast,t:0});playSound('blast');}});
  socket.on('pvp:finished',result=>showPvpResult(result));
  socket.on('disconnect',()=>{if(match?.mode==='pvp')showPvpResult({ reason:'connection-lost' });});
}
async function refreshFriends(force=false) {
  if (!currentUser||friendData.loading||(!force&&friendData.loaded)) return;
  friendData.loading=true;
  try {
    const result=await api('/api/friends');friendData.friends=result.friends||[];friendData.incoming=result.incoming||[];friendData.outgoing=result.outgoing||[];friendData.loaded=true;
  } catch(error) { if(page==='friends')toast(error.message); }
  finally { friendData.loading=false;if(page==='friends'){app.innerHTML=pageShell(friendsPage());bind();} }
}
async function refreshLeaderboard(){
  if(!currentUser||leaderboardData.loading||leaderboardData.loaded)return;
  leaderboardData.loading=true;
  leaderboardData.error='';
  try{const result=await api('/api/leaderboard');leaderboardData.players=result.players||[];leaderboardData.loaded=true;}
  catch(error){leaderboardData.error=error.message;if(page==='leaderboard')toast(error.message);}
  finally{leaderboardData.loading=false;if(page==='leaderboard'){app.innerHTML=pageShell(leaderboardPage());bind();}}
}
async function showUpdateVlog(){
  if(!currentUser)return;
  try{
    const {updates=[]}=await api('/api/updates/unseen');if(!updates.length||page==='match')return;
    const newest=updates[updates.length-1],root=document.querySelector('#overlay-root');if(!root)return;
    root.innerHTML=`<div class="overlay update-vlog-overlay"><section class="detail-modal update-vlog" role="dialog" aria-modal="true" aria-labelledby="update-vlog-title"><div class="eyebrow">HERO CLASH · UPDATE ${clean(newest.version)}</div><h2 id="update-vlog-title">${clean(newest.title)}</h2>${updates.map(update=>`<article class="update-entry"><div class="update-entry-title">${clean(update.title)}</div><p>${clean(update.body)}</p></article>`).join('')}<button class="button full" data-update-done>Alles klar</button></section></div>`;
    root.querySelector('[data-update-done]').addEventListener('click',async()=>{await api('/api/updates/seen',{method:'POST',body:JSON.stringify({id:newest.id})}).catch(()=>{});root.innerHTML='';});
  }catch{}
}
function showIncomingChallenge(invite) {
  const root=document.querySelector('#overlay-root');if(!root||page==='match')return;
  const chosenMode=duelModes.find(item=>item.id===invite.mode)||duelModes[1];
  root.innerHTML=`<div class="overlay"><section class="detail-modal challenge-modal" role="dialog" aria-modal="true"><div class="friend-avatar challenge-avatar">${clean((invite.fromName||'F').slice(0,1).toUpperCase())}</div><div class="eyebrow">1-GEGEN-1-EINLADUNG</div><h2>${clean(invite.fromName||'Ein Freund')} fordert dich heraus</h2><p>${clean(chosenMode.name)} · ${clean(chosenMode.desc)}</p><button class="button full" data-challenge-accept>Herausforderung annehmen <span>⚔</span></button><button class="button ghost full" data-challenge-decline>Ablehnen</button></section></div>`;
  root.querySelector('[data-challenge-accept]').addEventListener('click',async event=>{
    const button=event.currentTarget;
    button.disabled=true;
    await syncProfile();
    if (!socket?.connected) { button.disabled=false; return toast('Keine Verbindung zur Arena.'); }
    socket.emit('friend:challenge:accept',{id:invite.id},result=>{if(result?.error){root.innerHTML='';toast(result.error);}});
  });
  root.querySelector('[data-challenge-decline]').addEventListener('click',()=>{socket?.emit('friend:challenge:decline',{id:invite.id});root.innerHTML='';});
}
async function challengeFriend(friendId) {
  if(!socket?.connected)return toast('Keine Verbindung zur Arena.');
  const mode=duelMode;
  await syncProfile();
  if(!socket?.connected)return toast('Keine Verbindung zur Arena.');
  socket.emit('friend:challenge',{friendId,mode},result=>{if(result?.error)toast(result.error);else toast((duelModes.find(item=>item.id===mode)?.name||'Duell')+'-Einladung gesendet. Sie ist 30 Sekunden gültig.');});
}
function go(next) {
  if (page === 'match' && next !== 'match') return showLeaveRoundConfirm();
  if (next === 'leaderboard') leaderboardData.loaded = false;
  page=next;
  window.scrollTo({top:0,behavior:'instant'});
  render();
}

function bind() {
  document.querySelectorAll('[data-page]').forEach(el=>el.addEventListener('click',()=>go(el.dataset.page)));
  const form=document.querySelector('#login-form');
  if(form) form.addEventListener('submit',e=>{e.preventDefault();submitAuth(form);});
  document.querySelectorAll('[data-auth-mode]').forEach(el=>el.addEventListener('click',()=>{authMode=el.dataset.authMode;authError='';render();}));
  const friendForm=document.querySelector('#friend-add-form');
  if(friendForm)friendForm.addEventListener('submit',async e=>{e.preventDefault();const message=document.querySelector('#friend-form-message'),button=friendForm.querySelector('button[type="submit"]');button.disabled=true;if(message)message.textContent='';try{const result=await api('/api/friends/request',{method:'POST',body:JSON.stringify({username:friendForm.elements.username.value.trim()})});friendForm.reset();if(message)message.textContent=result.accepted?'Anfrage angenommen. Ihr seid jetzt befreundet.':'Freundschaftsanfrage gesendet.';await refreshFriends(true);}catch(error){if(message)message.textContent=error.message;}finally{button.disabled=false;}});
  document.querySelectorAll('[data-friend-accept]').forEach(el=>el.addEventListener('click',async()=>{el.disabled=true;try{await api('/api/friends/accept',{method:'POST',body:JSON.stringify({friendId:el.dataset.friendAccept})});friendData.loaded=false;await refreshFriends(true);toast('Freund hinzugefügt.');}catch(error){el.disabled=false;toast(error.message);}}));
  document.querySelectorAll('[data-friend-decline]').forEach(el=>el.addEventListener('click',async()=>{el.disabled=true;try{await api('/api/friends/decline',{method:'POST',body:JSON.stringify({friendId:el.dataset.friendDecline})});friendData.loaded=false;await refreshFriends(true);}catch(error){el.disabled=false;toast(error.message);}}));
  document.querySelectorAll('[data-challenge]').forEach(el=>el.addEventListener('click',()=>challengeFriend(el.dataset.challenge)));
  document.querySelector('#duel-mode')?.addEventListener('change',event=>{duelMode=duelModes.some(item=>item.id===event.target.value)?event.target.value:'standard';});
  document.querySelectorAll('[data-hair]').forEach(el=>el.addEventListener('click',()=>{profile.hair=el.dataset.hair;save();render();}));
  document.querySelectorAll('[data-hair-style]').forEach(el=>el.addEventListener('click',()=>{profile.hairStyle=el.dataset.hairStyle;save();render();}));
  document.querySelectorAll('[data-face]').forEach(el=>el.addEventListener('click',()=>{profile.face=el.dataset.face;save();render();}));
  document.querySelectorAll('[data-skin-tone]').forEach(el=>el.addEventListener('click',()=>{profile.skinTone=el.dataset.skinTone;save();render();}));
  document.querySelectorAll('[data-makeup]').forEach(el=>el.addEventListener('click',()=>{profile.makeup=el.dataset.makeup;save();render();}));
  document.querySelectorAll('[data-difficulty]').forEach(el=>el.addEventListener('click',()=>{difficulty=el.dataset.difficulty;render();}));
  document.querySelectorAll('[data-equip]').forEach(el=>el.addEventListener('click',()=>{
    if(el.dataset.kind==='cosmetic'){const item=cosmetics.find(x=>x.name===el.dataset.equip);if(item)profile.cosmetics[item.slot]=profile.cosmetics[item.slot]===item.name?'':item.name;}
    else if(el.dataset.kind==='armor')profile.armor=el.dataset.equip;
    else if(el.dataset.kind==='boots')profile.boots=el.dataset.equip;
    else profile.weapon=el.dataset.equip;
    save();render();playSound('ui');toast(`${el.dataset.equip} ${el.dataset.kind==='cosmetic'?(profile.cosmetics[cosmetics.find(x=>x.name===el.dataset.equip)?.slot]===el.dataset.equip?'angelegt.':'abgelegt.'):el.dataset.kind==='armor'?'angelegt.':'ausgerüstet.'}`);
  }));
  document.querySelectorAll('[data-cosmetic]').forEach(el=>el.addEventListener('click',()=>{profile.cosmetics[el.dataset.cosmetic]=el.dataset.item;save();render();}));
  document.querySelectorAll('[data-info]').forEach(el=>el.addEventListener('click',()=>showItemInfo(el.dataset.info)));
  document.querySelectorAll('[data-buy]').forEach(el=>el.addEventListener('click',()=>buy(el.dataset.buy,el.dataset.kind)));
  document.querySelectorAll('[data-skill]').forEach(el=>el.addEventListener('click',()=>showSkillInfo(el.dataset.skill)));
  document.querySelectorAll('[data-claim-quest]').forEach(el=>el.addEventListener('click',()=>claimQuest(el.dataset.claimQuest)));
  document.querySelectorAll('[data-claim-weapon-quest]').forEach(el=>el.addEventListener('click',()=>claimWeaponQuest(el.dataset.claimWeaponQuest)));
  document.querySelectorAll('[data-pass-claim]').forEach(el=>el.addEventListener('click',()=>claimPass(Number(el.dataset.passClaim))));
  document.querySelectorAll('[data-toggle]').forEach(el=>el.addEventListener('click',()=>{profile[el.dataset.toggle]=!profile[el.dataset.toggle];save();if(el.dataset.toggle==='musicEnabled')startAudio();render();}));
  document.querySelectorAll('[data-theme-choice]').forEach(el=>el.addEventListener('click',()=>{profile.theme=el.dataset.themeChoice;save();render();}));
  document.querySelectorAll('[data-volume]').forEach(el=>el.addEventListener('input',()=>{profile[el.dataset.volume]=Number(el.value)/100;el.nextElementSibling.value=`${el.value}%`;save();if(el.dataset.volume==='musicVolume')startAudio();}));
  document.querySelectorAll('[data-action]').forEach(el=>el.addEventListener('click',()=>action(el.dataset.action)));
  const joystick=document.querySelector('#joystick-area'),knob=document.querySelector('#joystick-knob');
  if(joystick&&knob){
    let pointerId=null;
    const reset=()=>{pointerId=null;if(match)match.joystick={x:0,y:0};knob.style.left='50%';knob.style.top='50%';};
    const update=e=>{const base=joystick.querySelector('.joystick-base'),rect=base.getBoundingClientRect(),cx=rect.left+rect.width/2,cy=rect.top+rect.height/2,limit=rect.width*.28;let dx=e.clientX-cx,dy=e.clientY-cy,len=Math.hypot(dx,dy);if(len>limit){dx=dx/len*limit;dy=dy/len*limit;}if(match)match.joystick={x:dx/limit,y:dy/limit};knob.style.left=(50+dx/rect.width*100)+'%';knob.style.top=(50+dy/rect.height*100)+'%';};
    joystick.addEventListener('pointerdown',e=>{e.preventDefault();pointerId=e.pointerId;joystick.setPointerCapture(pointerId);update(e);});
    joystick.addEventListener('pointermove',e=>{if(e.pointerId===pointerId){e.preventDefault();update(e);}});
    joystick.addEventListener('pointerup',e=>{if(e.pointerId===pointerId)reset();});
    joystick.addEventListener('pointercancel',reset);joystick.addEventListener('lostpointercapture',reset);
  }
  const aimPad=document.querySelector('#aim-joystick-area'),aimKnob=document.querySelector('#aim-joystick-knob');
  if(aimPad&&aimKnob){
    let pointerId=null;
    const reset=()=>{pointerId=null;if(match)match.aimJoystick={x:0,y:0};aimKnob.style.left='50%';aimKnob.style.top='50%';};
    const update=e=>{const base=aimPad.querySelector('.aim-base'),rect=base.getBoundingClientRect(),cx=rect.left+rect.width/2,cy=rect.top+rect.height/2,limit=rect.width*.28;let dx=e.clientX-cx,dy=e.clientY-cy,len=Math.hypot(dx,dy);if(len>limit){dx=dx/len*limit;dy=dy/len*limit;}if(match){match.aimJoystick={x:dx/limit,y:dy/limit};match.player.aimX=dx/limit;match.player.aimY=dy/limit;match.player.aimFromPointer=false;}aimKnob.style.left=(50+dx/rect.width*100)+'%';aimKnob.style.top=(50+dy/rect.height*100)+'%';};
    aimPad.addEventListener('pointerdown',e=>{e.preventDefault();pointerId=e.pointerId;aimPad.setPointerCapture(pointerId);update(e);});
    aimPad.addEventListener('pointermove',e=>{if(e.pointerId===pointerId){e.preventDefault();update(e);}});
    aimPad.addEventListener('pointerup',e=>{
      if(e.pointerId!==pointerId)return;
      if(Math.hypot(match?.aimJoystick?.x||0,match?.aimJoystick?.y||0)>.18)attack();
      reset();
    });
    aimPad.addEventListener('pointercancel',reset);aimPad.addEventListener('lostpointercapture',reset);
  }
  const arena=document.querySelector('#arena');
  const aimAtPointer=event=>{
    if(event.pointerType==='touch'||!match||match.paused)return;
    const rect=arena.getBoundingClientRect(),p=match.player,dx=(event.clientX-rect.left)/rect.width-p.x,dy=(event.clientY-rect.top)/rect.height-p.y,len=Math.hypot(dx,dy);
    if(len>.008){p.aimX=dx/len;p.aimY=dy/len;p.aimFromPointer=true;}
  };
  arena?.addEventListener('pointermove',aimAtPointer);
  arena?.addEventListener('pointerdown',event=>{if(event.pointerType!=='touch'&&event.button===0){aimAtPointer(event);attack();}});
  document.querySelectorAll('[data-action="attack"]').forEach(el=>{
    el.addEventListener('pointerdown',e=>{e.preventDefault();attack();});
  });
  document.querySelectorAll('[data-action="dodge"]').forEach(el=>el.addEventListener('pointerdown',e=>{e.preventDefault();dodge();}));
  if(page==='match') bindKeyboard();
}

function buy(name,kind) {
  const item=[...weapons,...armors,...boots,...cosmetics].find(x=>x.name===name);
  if(!item||profile.coins<item.price||profile.owned.includes(name))return;
  profile.coins-=item.price;
  profile.owned.push(name);
  if(kind==='weapon'){
    profile.weapon=name;
    profile.weaponSources[name]='shop';
  }
  if(kind==='armor')profile.armor=name;
  if(kind==='boots')profile.boots=name;
  save();render();playSound('buy');toast(`${name} gekauft!`);
}
function showSkillInfo(id) {
  const skill=skillDefs.find(item=>item.id===id);if(!skill)return;
  const level=profile.skills[id]||0,ready=skill.requires.every(req=>profile.skills[req]>0),cost=skill.costs[level],maxed=level>=skill.max;
  const detail=document.createElement('div');detail.className='overlay';detail.innerHTML=`<section class="detail-modal"><button class="modal-close" data-close>×</button><div class="skill-detail-icon">${skillIconSvg(skill.icon)}</div><div class="eyebrow">SKILLKNOTEN · ${level}/${skill.max}</div><h2>${skill.title}</h2><p>${skill.desc}</p><div class="detail-stats"><span>Aktuelle Stufe <b>${level}/${skill.max}</b></span><span>Verbesserung kostet <b>${maxed?'—':`${cost} Skillpunkt${cost===1?'':'e'}`}</b></span><span>Verfügbar <b>${profile.skillPoints} Punkte</b></span></div><button class="button full" data-upgrade="${id}" ${maxed||!ready||profile.skillPoints<cost?'disabled':''}>${maxed?'Maximale Stufe':!ready?'Pfad noch gesperrt':profile.skillPoints<cost?'Nicht genug Skillpunkte':'Verbessern'}</button></section>`;
  (document.querySelector('.app-shell')||document.body).append(detail);detail.querySelector('[data-close]').addEventListener('click',()=>detail.remove());detail.addEventListener('click',e=>{if(e.target===detail)detail.remove();});detail.querySelector('[data-upgrade]').addEventListener('click',()=>upgradeSkill(id,detail));
}
function upgradeSkill(id,modal) {
  const def=skillDefs.find(item=>item.id===id);if(!def)return;
  const level=profile.skills[id]||0,cost=def.costs[level];
  if(level>=def.max||!def.requires.every(req=>profile.skills[req]>0)||profile.skillPoints<cost)return;
  profile.skillPoints-=cost;profile.skills[id]=level+1;save();playSound('upgrade');modal?.remove();render();toast(`${def.title} auf Stufe ${level+1} verbessert.`);
}
function claimQuest(id) {
  ensureDaily();const q=qdefs.find(x=>x.id===id);if(!q||profile.daily.claims.includes(id)||questProgress(q)<q.goal)return;
  profile.daily.claims.push(id);profile.coins+=q.reward;addXp(q.xp);save();render();playSound('reward');toast(`+${q.reward} Münzen · +${q.xp} XP`);
}
function claimPass(i) {
  const r=passRewards[i];if(!r||profile.passXp<r.xp||profile.passClaims.includes(i))return;
  profile.passClaims.push(i);if(!profile.owned.includes(r.item))profile.owned.push(r.item);save();playSound('reward');render();toast(`${r.title} freigeschaltet!`);
}
function action(id) {
  if(id==='start-round') startRound();
  if(id==='attack') attack();
  if(id==='reload') reloadWeapon();
  if(id==='dodge') dodge();
  if(id==='pause-round') showPauseMenu();
  if(id==='open-difficulty') showDifficultyMenu();
  if(id==='finish-setup'){profile.onboarded=true;save();page='hub';render();playSound('confirm');}
  if(id==='save-look'){save();page='settings';render();toast('Heldenlook gespeichert.');}
  if(id==='leave-round') showLeaveRoundConfirm();
  if(id==='spin') spin();
  if(id==='rename') rename();
  if(id==='logout') logout();
}
function showPauseMenu(){
  if(!match||match.over||match.paused)return;
  match.paused=true;match.keys.clear();match.joystick={x:0,y:0};
  const root=document.querySelector('#overlay-root');if(!root)return;
  if(match.mode==='pvp')socket?.emit('pvp:input',{x:0,y:0});
  root.innerHTML=`<div class="overlay pause-overlay"><section class="detail-modal pause-modal" role="dialog" aria-modal="true" aria-labelledby="pause-title"><div class="pause-mark">Ⅱ</div><div class="eyebrow">ARENA PAUSIERT</div><h2 id="pause-title">Kurze Pause?</h2><p>${match.mode==='pvp'?'Deine Steuerung pausiert. Dein Gegner kann währenddessen weiterspielen.':'Die Runde steht still. Du kannst jederzeit weiterspielen.'}</p><button class="button full" data-pause-resume>Weiter spielen <span>▶</span></button><button class="button ghost full" data-pause-end>${match.mode==='pvp'?'Kampf verlassen':'Runde beenden'}</button></section></div>`;
  root.querySelector('[data-pause-resume]').addEventListener('click',()=>{root.innerHTML='';match.paused=false;});
  root.querySelector('[data-pause-end]').addEventListener('click',()=>showLeaveRoundConfirm(true));
}
function showLeaveRoundConfirm(fromPause=false){
  if(!match||match.over)return;
  const returnToPause=fromPause||match.paused;match.paused=true;match.keys.clear();match.joystick={x:0,y:0};
  if(match.mode==='pvp')socket?.emit('pvp:input',{x:0,y:0});
  const root=document.querySelector('#overlay-root');if(!root)return;
  root.innerHTML='<div class="overlay pause-overlay"><section class="detail-modal pause-modal warning-modal" role="dialog" aria-modal="true" aria-labelledby="leave-title"><div class="warning-mark">!</div><div class="eyebrow">RUNDE ABBRECHEN</div><h2 id="leave-title">Runde wirklich beenden?</h2><p>Der Kampf wird abgebrochen. Belohnungen für diese Runde erhältst du nicht.</p><button class="button full danger-button" data-confirm-leave>Ja, Runde beenden</button><button class="button ghost full" data-cancel-leave></button></section></div>';
  root.querySelector('[data-cancel-leave]').textContent=returnToPause?'Zurück zur Pause':'Weiterkämpfen';
  root.querySelector('[data-confirm-leave]').addEventListener('click',()=>{if(match.mode==='pvp')socket?.emit('pvp:leave');returnToHub();});
  root.querySelector('[data-cancel-leave]').addEventListener('click',()=>{root.innerHTML='';match.paused=false;if(returnToPause)showPauseMenu();});
}
function returnToHub(){
  stopLoop();
  match=null;
  page='hub';
  render();
  if(offlineMode&&navigator.onLine)restoreSession();
  else if(!offlineMode)syncProfile();
}
function showDifficultyMenu(){
  const trigger=document.querySelector('.difficulty-button'),parent=trigger?.closest('.home-play-row');if(!trigger||!parent)return;
  if(closeDifficultyMenu){closeDifficultyMenu();return;}
  const names={easy:'Einfach',normal:'Normal',hard:'Schwer'},copy={easy:'Weniger Gegner, geringerer Schaden.',normal:'Ausgewogene Gegner und Belohnungen.',hard:'Mehr Gegnerleben und kräftigere Angriffe.'};
  const menu=document.createElement('div');menu.className='difficulty-popover';menu.setAttribute('role','menu');menu.innerHTML=`<div class="popover-heading"><span class="eyebrow">RUNDE WÄHLEN</span><b>Schwierigkeit</b></div>${Object.keys(names).map(id=>`<button class="difficulty-option ${difficulty===id?'selected':''}" role="menuitemradio" aria-checked="${difficulty===id}" data-set-difficulty="${id}"><span class="difficulty-radio">${difficulty===id?'✓':''}</span><span><b>${names[id]}</b><small>${copy[id]}</small></span><span class="difficulty-reward">${id==='easy'?'Kurz':id==='normal'?'Standard':'Mehr XP'}</span></button>`).join('')}`;
  parent.append(menu);trigger.setAttribute('aria-expanded','true');
  const listeners=new AbortController();
  closeDifficultyMenu=()=>{
    listeners.abort();
    menu.remove();
    trigger.setAttribute('aria-expanded','false');
    closeDifficultyMenu=null;
  };
  document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target)&&!trigger.contains(event.target))closeDifficultyMenu?.();},{signal:listeners.signal});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeDifficultyMenu?.();trigger.focus();}},{signal:listeners.signal});
  requestAnimationFrame(()=>{
    if(!menu.isConnected)return;
    const navTop=document.querySelector('.bottom-nav')?.getBoundingClientRect().top||innerHeight;
    const scrollNeeded=menu.getBoundingClientRect().bottom-navTop+12;
    if(scrollNeeded>0)window.scrollBy({top:scrollNeeded,behavior:'instant'});
  });
  menu.querySelectorAll('[data-set-difficulty]').forEach(el=>el.addEventListener('click',()=>{
    difficulty=el.dataset.setDifficulty;
    render();
    document.querySelector('.difficulty-button')?.focus({preventScroll:true});
  }));
}
function rename() {
  const name=prompt('Neuer Spielername (max. 18 Zeichen):',profile.name);
  if(name?.trim()){profile.name=name.trim().slice(0,18);save();render();}
}
async function logout() {
  clearTimeout(profileSaveTimer);
  if (offlineMode) return toast('Zum Abmelden brauchst du eine Verbindung.');
  await syncProfile();
  try { await api('/api/auth/logout',{method:'POST'}); } catch(error) { toast(error.message); return; }
  socket?.disconnect();socket=null;localStorage.removeItem(ACTIVE_PROFILE_KEY);
  currentUser=null;profile=null;profileSync=null;friendData.friends=[];friendData.incoming=[];friendData.outgoing=[];friendData.online.clear();friendData.loaded=false;
  leaderboardData.players=[];leaderboardData.loaded=false;page='hub';authMode='login';authError='';render();
}
function claimWeaponQuest(id) {
  const quest = weaponQuests.find(entry=>entry.id===id);
  if (!quest || profile.weaponQuestClaims.includes(id) || !quest.goals.every(goal=>weaponQuestProgress(goal)===goal.count)) return;
  profile.weaponQuestClaims.push(id);
  const newWeapon = !profile.owned.includes(quest.weapon);
  if (newWeapon) {
    profile.owned.push(quest.weapon);
    profile.weaponSources[quest.weapon] = id;
  }
  addXp(quest.xp);
  save();
  render();
  playSound('reward');
  toast(newWeapon ? `${quest.weapon} · +${quest.xp} XP` : `${quest.title} · +${quest.xp} XP`);
}
function spin() {
  if(profile.daily.claims.includes('wheel'))return;
  const wheel=document.querySelector('#wheel'),idx=Math.floor(Math.random()*wheelPrizes.length),prize=wheelPrizes[idx];
  const result=document.querySelector('#wheel-result'),button=document.querySelector('[data-action="spin"]');button.disabled=true;playSound('spin');wheel.style.transform=`rotate(${1800+330-idx*60}deg)`;
  setTimeout(()=>{profile.daily.claims.push('wheel');if(prize.kind==='coins')profile.coins+=prize.value;else {profile.daily.xp=(profile.daily.xp||0)+prize.value;addXp(prize.value);}save();playSound('reward');if(result)result.textContent=`${prize.kind==='coins'?`+${prize.value} Münzen`:`+${prize.value} XP`} – Glück gehabt!`;if(button){button.textContent='Morgen wieder drehen';button.classList.add('ghost');}render();},3650);
}

const arenaCfg={easy:{count:6,hp:.8,damage:.78,reward:35},normal:{count:8,hp:1,damage:1,reward:55},hard:{count:10,hp:1.25,damage:1.25,reward:80}};
const arenaMaps=[
  {id:'foundry',name:'Sternenschmiede',ground:['#f0ece5','#d5d0c7','#3a3b40','#222429'],cover:[[.25,.22,.13,.07],[.62,.22,.13,.07],[.40,.46,.20,.07],[.20,.70,.14,.07],[.66,.70,.14,.07]],trim:'#a9825d'},
  {id:'frost',name:'Frostpass',ground:['#e8eff2','#c7d4d9','#333a40','#20252a'],cover:[[.12,.34,.17,.06],[.71,.34,.17,.06],[.35,.18,.10,.09],[.55,.60,.12,.08],[.20,.73,.12,.07],[.69,.73,.12,.07]],trim:'#90b6c2'},
  {id:'grove',name:'Nebelhain',ground:['#e4e8e1','#c9d0c5','#303631','#1e231f'],cover:[[.22,.20,.12,.08],[.66,.20,.12,.08],[.38,.35,.24,.07],[.12,.62,.17,.07],[.71,.62,.17,.07],[.42,.77,.16,.06]],trim:'#809578'},
];
function getArenaMap(id){return arenaMaps.find(item=>item.id===id)||arenaMaps[Math.floor(Math.random()*arenaMaps.length)];}
const enemyTypes={
  scout:{name:'Späher',hp:20,speed:.12,damage:7,range:.06,cooldown:.85,color:'#e47d65',shape:'scout',coins:[2,5]},
  guard:{name:'Wächter',hp:34,speed:.075,damage:11,range:.065,cooldown:1.1,color:'#73839a',shape:'guard',coins:[4,8]},
  brute:{name:'Koloss',hp:58,speed:.045,damage:17,range:.075,cooldown:1.35,color:'#bf685f',shape:'brute',coins:[7,12]},
  ranger:{name:'Fernkämpfer',hp:26,speed:.04,damage:9,range:.43,cooldown:1.8,color:'#937fbd',shape:'ranger',coins:[5,10]},
  boss:{name:'Arena-Boss',hp:160,speed:.065,damage:15,range:.17,cooldown:1.25,color:'#c79a48',shape:'boss',coins:[20,34]},
};
const arenaBosses = {
  foundry: { name:'Schmiedekoloss', shots:3, color:'#c79a48' },
  frost: { name:'Frostwächter', shots:2, color:'#85bce0' },
  grove: { name:'Nebelriese', shots:4, color:'#83aa79' },
};
function isBlocked(map,x,y,r=.018){
  return (map?.cover||[]).some(([cx,cy,cw,ch])=>x+r>cx&&x-r<cx+cw&&y+r>cy&&y-r<cy+ch);
}
function coverBetween(map, from, to) {
  const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / .014);
  for (let step = 1; step < steps; step++) {
    const t = step / steps;
    if (isBlocked(map, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, 0)) return true;
  }
  return false;
}
function spawnWave(wave){
  const m=match,cfg=arenaCfg[difficulty];if(!m||wave>3)return;
  m.wave=wave;m.enemies=[];m.projectiles=[];
  if(wave>1)m.player.hp=Math.min(m.player.max,m.player.hp+22);
  const count=Math.floor(cfg.count/3)+(wave<=cfg.count%3?1:0),pool=wave===1?['scout','guard','ranger']:wave===2?['guard','brute','ranger']:['brute','guard','ranger'];
  const spawn=typeId=>{
    const type=enemyTypes[typeId];let x=.08,y=.1,attempt=0;
    do{x=.07+Math.random()*.86;y=.13+Math.random()*.73;attempt++;}while(attempt<100&&(Math.hypot(x-m.player.x,y-m.player.y)<.27||isBlocked(m.map,x,y,.035)));
    const hp=Math.round(type.hp*cfg.hp);
    m.enemies.push({type:typeId,x,y,hp,max:hp,attackCd:.6+Math.random()*.9,hit:0,flash:0,faceX:0,faceY:1,defeated:false});
    m.total++;
  };
  for(let i=0;i<count;i++)spawn(pool[(i+wave)%pool.length]);
  if(wave===3)spawn('boss');
  m.waveToast=1.35;
}
function startRound() {
  ensureDaily();
  const availableMaps=arenaMaps.filter(map=>map.id!==lastSoloMap);
  const map=availableMaps[Math.floor(Math.random()*availableMaps.length)];
  lastSoloMap=map.id;
  const hp=100+(profile.skills.health||0)*15+currentArmor().hp,weapon=currentWeapon();
  match={keys:new Set(),joystick:{x:0,y:0},aimJoystick:{x:0,y:0},paused:false,map,wave:1,coinsEarned:0,pickups:[],blasts:[],player:{x:.5,y:.58,r:18,hp,max:hp,attackCd:0,hitFlash:0,attackAnim:0,dodgeTime:0,dodgeCd:0,vx:0,vy:0,faceX:1,faceY:0,aimX:1,aimY:0,magazine:weapon.ammo?.mag||0,ammo:weapon.ammo?.reserve||0,reloadingUntil:0},enemies:[],projectiles:[],floats:[],kills:0,total:0,last:0,elapsed:0,over:false,shake:0,parryFlash:0};
  spawnWave(1);
  match.weapon = weapon;
  playSound('confirm');startAudio();go('match');
}
function enterPvpMatch(snapshot) {
  const players=snapshot.players||[],own=players.find(player=>player.userId===currentUser?.id),opponent=players.find(player=>player.userId!==currentUser?.id);
  if(!own||!opponent)return toast('Die 1-gegen-1-Runde konnte nicht geladen werden.');
  stopLoop();
  match={mode:'pvp',matchId:snapshot.matchId,duelMode:snapshot.mode||'standard',map:getArenaMap(snapshot.mapId),keys:new Set(),joystick:{x:0,y:0},aimJoystick:{x:0,y:0},paused:false,player:{...own,max:own.maxHp,attackCd:0,dodgeCd:0,dodgeTime:0,vx:0,vy:0,faceX:1,faceY:0,aimX:own.aim?.x??1,aimY:own.aim?.y??0},remotePlayer:{...opponent},enemies:[],projectiles:[],floats:[],kills:0,total:0,last:0,elapsed:0,over:false,shake:0,parryFlash:0,lastInputAt:0};
  match.weapon = weapons.find(item=>item.name===own.weapon)||weapons[0];
  match.blasts = [];
  window.scrollTo(0,0);
  document.querySelector('#overlay-root').innerHTML='';page='match';render();playSound('confirm');toast(`1 gegen 1 mit ${opponent.name} gestartet.`);
}
function updatePvpState(snapshot) {
  if(!match||match.mode!=='pvp'||snapshot.matchId!==match.matchId)return;
  const own=snapshot.players?.find(player=>player.userId===currentUser?.id),opponent=snapshot.players?.find(player=>player.userId!==currentUser?.id);
  if(own)Object.assign(match.player,own,{max:own.maxHp,vx:own.move?.x??0,vy:own.move?.y??0});
  if(opponent)match.remotePlayer={...match.remotePlayer,...opponent};
  match.projectiles = snapshot.projectiles || [];
}
function handlePvpAttack(result) {
  if(!match||match.mode!=='pvp')return;
  const target=result.targetId===currentUser?.id?match.player:match.remotePlayer;
  if(target)match.floats.push({x:target.x,y:target.y-.04,text:result.result==='dodge'?'AUSGEWICHEN':`${result.result==='critical'?'KRIT! ':''}-${result.damage||0}`,t:0,color:result.result==='dodge'?'#596574':result.result==='critical'?'#a17637':'#bd5555'});
  if(result.result==='dodge')playSound('dodge');else if(result.result==='critical')playSound('crit');else playSound('hit');
}
function showPvpResult(result) {
  if(!match||match.mode!=='pvp'||match.over)return;
  match.over=true;match.keys.clear();match.joystick={x:0,y:0};stopLoop();
  const won=result.winnerId===currentUser?.id,draw=!result.winnerId;
  if(won)leaderboardData.loaded=false;
  const title=draw?'Runde beendet':won?'Du hast gewonnen!':'Dein Freund gewinnt';
  const detail=result.reason==='connection-lost'?'Deine Verbindung zur Arena wurde getrennt.':result.reason==='disconnect'?'Die Verbindung deines Gegners wurde getrennt.':result.reason==='forfeit'?'Der Kampf wurde vorzeitig verlassen.':result.reason==='knockout'?'Der Kampf endete durch einen Knockout.':'Die Runde ist beendet.';
  const root=document.querySelector('#overlay-root');root.innerHTML=`<div class="overlay"><section class="result-card"><div class="result-icon">${draw?'⚔️':won?'🏆':'💫'}</div><div class="eyebrow">1-GEGEN-1 BEENDET</div><h2 style="margin:8px 0">${title}</h2><p class="muted" style="font-size:11px;line-height:1.6">${detail}</p><button class="button full" data-pvp-continue>Weiter</button></section></div>`;
  root.querySelector('[data-pvp-continue]').addEventListener('click',returnToHub);
}
function bindKeyboard() {
  window.addEventListener('keydown',keyDown);window.addEventListener('keyup',keyUp);
  document.addEventListener('visibilitychange',pauseWhenHidden);
}
function keyDown(e) {
  const map={ArrowUp:'up',w:'up',W:'up',ArrowDown:'down',s:'down',S:'down',ArrowLeft:'left',a:'left',A:'left',ArrowRight:'right',d:'right',D:'right'};
  if(map[e.key]&&match&&!match.paused){e.preventDefault();match.keys.add(map[e.key]);}
  if((e.code==='Space'||e.key===' ')&&page==='match'){e.preventDefault();attack();}
  if(e.key==='r'||e.key==='R'){if(page==='match'){e.preventDefault();reloadWeapon();}}
  if((e.key==='Shift'||e.code==='ShiftLeft'||e.code==='ShiftRight')&&page==='match'){e.preventDefault();dodge();}
}
function keyUp(e) { const map={ArrowUp:'up',w:'up',W:'up',ArrowDown:'down',s:'down',S:'down',ArrowLeft:'left',a:'left',A:'left',ArrowRight:'right',d:'right',D:'right'};if(map[e.key])match?.keys.delete(map[e.key]); }
function pauseWhenHidden() { if(document.hidden&&page==='match'&&match){match.keys.clear();match.joystick={x:0,y:0};if(match.mode==='pvp')socket?.emit('pvp:input',{x:0,y:0});} }
function startLoop() {
  if(loopId)return;
  const canvas=document.querySelector('#arena');if(!canvas||!match)return;
  const ctx=canvas.getContext('2d');
  const frame=(stamp)=>{
    loopId=requestAnimationFrame(frame);if(!match||page!=='match')return;
    const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
    if(canvas.width!==Math.round(rect.width*dpr)||canvas.height!==Math.round(rect.height*dpr)){canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);}
    ctx.setTransform(dpr,0,0,dpr,0,0);const w=rect.width,h=rect.height;
    const dt=Math.min(.04,(stamp-(match.last||stamp))/1000);match.last=stamp;
    if(!match.paused&&!match.over){match.elapsed+=dt;updateMatch(dt,w,h);}
    drawArena(ctx,w,h);updateHud();
  };
  loopId=requestAnimationFrame(frame);
}
function stopLoop() { if(loopId){cancelAnimationFrame(loopId);loopId=0;}window.removeEventListener('keydown',keyDown);window.removeEventListener('keyup',keyUp);document.removeEventListener('visibilitychange',pauseWhenHidden); }
function moveWithCover(map,x,y,dx,dy,r=.018){
  const nx=Math.max(.055,Math.min(.945,x+dx)),ny=Math.max(.075,Math.min(.925,y+dy));
  if(!isBlocked(map,nx,y,r))x=nx;
  if(!isBlocked(map,x,ny,r))y=ny;
  return {x,y};
}
function steerEnemy(enemy, dx, dy) {
  const map = match.map;
  const advance = moveWithCover(map, enemy.x, enemy.y, dx, dy, .02);
  if (Math.hypot(advance.x - enemy.x, advance.y - enemy.y) > Math.hypot(dx,dy)*.3) return advance;
  const side = enemy.x < .5 ? -1 : 1;
  const flank = moveWithCover(map, enemy.x, enemy.y, -dy*side, dx*side, .02);
  return flank.x !== enemy.x || flank.y !== enemy.y ? flank : moveWithCover(map, enemy.x, enemy.y, dy*side, -dx*side, .02);
}
function aimVector(){
  const p=match?.player;if(!p)return {x:1,y:0};
  const stick=match.aimJoystick||{},length=Math.hypot(stick.x||0,stick.y||0);
  const source=length>.18?stick:{x:p.aimX??1,y:p.aimY??0},len=Math.hypot(source.x,source.y)||1;
  return {x:source.x/len,y:source.y/len};
}
function dropEnemyLoot(enemy){
  const spec=enemyTypes[enemy.type],luck=1+(profile.skills.luck||0)*.06,value=Math.max(1,Math.round((spec.coins[0]+Math.floor(Math.random()*(spec.coins[1]-spec.coins[0]+1)))*luck));
  match.pickups.push({x:enemy.x,y:enemy.y,value,t:0});
}
function damageEnemy(enemy,amount,crit=false,position=null){
  if(!enemy||enemy.hp<=0)return;
  const damage=Math.max(1,Math.round(amount*(crit?2:1)));enemy.hp=Math.max(0,enemy.hp-damage);enemy.hit=.16;enemy.flash=.14;
  const point=position||enemy;match.floats.push({x:point.x,y:point.y,text:(crit?'KRIT! ':'')+damage,t:0,color:crit?'#a17637':'#303844'});
  playSound(crit?'crit':'hit');
  if(enemy.hp<=0&&!enemy.defeated){
    enemy.defeated=true;
    match.kills++;
    profile.stats.knockouts++;
    ensureDaily();
    profile.daily.kills++;
    if(enemy.type==='boss'&&!profile.stats.bossMaps.includes(match.map.id))profile.stats.bossMaps.push(match.map.id);
    dropEnemyLoot(enemy);
    save();
  }
}
function explodePlayerShot(shot,x,y,directTarget=null){
  const radius=shot.splash||0;
  for(const enemy of match.enemies){
    if(enemy.hp<=0)continue;
    const distance=Math.hypot(enemy.x-x,enemy.y-y);
    if(enemy===directTarget)damageEnemy(enemy,shot.damage,shot.crit,{x:enemy.x,y:enemy.y});
    else if(radius>0&&distance<=radius&&!coverBetween(match.map,{x,y},enemy))damageEnemy(enemy,shot.damage*.58,shot.crit,{x:enemy.x,y:enemy.y});
  }
  if(radius>0){match.blasts.push({x,y,r:radius,t:0});match.shake=.12;playSound('blast');}
}
function updateMatch(dt,w,h) {
  const m=match;if(m.paused)return;const p=m.player,speed=168*currentBoots().speed;let dx=0,dy=0;
  if(m.keys.has('left'))dx--;if(m.keys.has('right'))dx++;if(m.keys.has('up'))dy--;if(m.keys.has('down'))dy++;
  dx+=m.joystick?.x||0;dy+=m.joystick?.y||0;
  p.vx=dx;p.vy=dy;
  if(dx||dy){
    const len=Math.max(1,Math.hypot(dx,dy));dx/=len;dy/=len;p.vx=dx;p.vy=dy;p.faceX=dx;p.faceY=dy;
    if(m.mode!=='pvp')Object.assign(p,moveWithCover(m.map,p.x,p.y,dx*speed*dt/w,dy*speed*dt/h,.022));
  }
  const aim=aimVector();
  if(Math.hypot(m.aimJoystick?.x||0,m.aimJoystick?.y||0)>.18){p.aimX=aim.x;p.aimY=aim.y;}
  else if(!p.aimFromPointer&&(dx||dy)&&!arenaWeapon().ammo){p.aimX=dx;p.aimY=dy;}
  p.attackCd=Math.max(0,p.attackCd-dt);p.hitFlash=Math.max(0,p.hitFlash-dt);p.attackAnim=Math.max(0,p.attackAnim-dt);
  p.dodgeTime=Math.max(0,p.dodgeTime-dt);p.dodgeCd=Math.max(0,p.dodgeCd-dt);
  if(m.mode!=='pvp'&&p.reloadingUntil&&m.elapsed>=p.reloadingUntil){
    const load=Math.min(arenaWeapon().ammo.mag-p.magazine,p.ammo);
    p.magazine+=load;p.ammo-=load;p.reloadingUntil=0;playSound('reload');
  }
  m.shake=Math.max(0,m.shake-dt);m.parryFlash=Math.max(0,m.parryFlash-dt);m.waveToast=Math.max(0,(m.waveToast||0)-dt);
  m.floats=m.floats.filter(f=>{f.t+=dt;f.y-=dt*.045;return f.t<.8;});
  m.blasts=m.blasts.filter(b=>{b.t+=dt;return b.t<.35;});
  if(m.mode==='pvp'){
    if(Date.now()-m.lastInputAt>45){socket?.emit('pvp:input',{x:dx,y:dy,aim:{x:p.aimX,y:p.aimY}});m.lastInputAt=Date.now();}
    return;
  }
  const cfg=arenaCfg[difficulty];
  for(const e of m.enemies){if(e.hp<=0)continue;const spec=enemyTypes[e.type],vx=p.x-e.x,vy=p.y-e.y,d=Math.hypot(vx,vy)||1;e.faceX=vx/d;e.faceY=vy/d;e.attackCd-=dt;e.hit=Math.max(0,e.hit-dt);e.flash=Math.max(0,e.flash-dt);
    const ranged=e.type==='ranger'||e.type==='boss',hasCover=coverBetween(m.map,e,p);
    if(ranged){
      if(d>spec.range*.82||hasCover)Object.assign(e,steerEnemy(e,vx/d*spec.speed*dt,vy/d*spec.speed*dt));
      else if(d<spec.range*.52)Object.assign(e,moveWithCover(m.map,e.x,e.y,-vx/d*spec.speed*.65*dt,-vy/d*spec.speed*.65*dt,.02));
      if(!hasCover&&d<spec.range&&e.attackCd<=0){
        const shotCount=e.type==='boss'?arenaBosses[m.map.id].shots:1,angle=Math.atan2(vy,vx);
        for(let i=0;i<shotCount;i++){const spread=(i-(shotCount-1)/2)*.24,a=angle+spread;m.projectiles.push({owner:'enemy',x:e.x,y:e.y,vx:Math.cos(a)*.32,vy:Math.sin(a)*.32,damage:spec.damage*cfg.damage,r:e.type==='boss'?7:5,life:2.5,splash:e.type==='boss'?.055:0});}
        e.attackCd=spec.cooldown*(difficulty==='hard'?.84:1);
      }
    } else {
      if(d>spec.range*.75||hasCover)Object.assign(e,steerEnemy(e,vx/d*spec.speed*dt,vy/d*spec.speed*dt));
      if(!hasCover&&d<spec.range&&e.attackCd<=0){resolveHit(spec.damage*cfg.damage,e.x,e.y);e.attackCd=spec.cooldown;}
    }
  }
  m.projectiles=m.projectiles.filter(b=>{
    b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;
    if(isBlocked(m.map,b.x,b.y,.007)){if(b.owner==='player'&&b.splash)explodePlayerShot(b,b.x,b.y);return false;}
    if(b.owner==='player'){
      const enemy=m.enemies.find(e=>e.hp>0&&Math.hypot(e.x-b.x,e.y-b.y)<.026);
      if(enemy){explodePlayerShot(b,b.x,b.y,enemy);return false;}
      if(b.life<=0){if(b.splash)explodePlayerShot(b,b.x,b.y);return false;}
    }else if(Math.hypot(p.x-b.x,p.y-b.y)<.052){if(b.splash)m.blasts.push({x:b.x,y:b.y,r:b.splash,t:0});resolveHit(b.damage,b.x,b.y);return false;}
    return b.life>0&&b.x>-.1&&b.x<1.1&&b.y>-.1&&b.y<1.1;
  });
  m.pickups=m.pickups.filter(item=>{item.t+=dt;if(Math.hypot(p.x-item.x,p.y-item.y)<.055){m.coinsEarned+=item.value;match.floats.push({x:item.x,y:item.y,text:'+'+item.value+' ◈',t:0,color:'#b1883e'});playSound('reward');return false;}return true;});
  if(p.hp<=0&&!m.over) endRound(false);
  if(!m.over&&m.enemies.length&&m.enemies.every(enemy=>enemy.hp<=0)){
    m.waveAdvanceTimer=(m.waveAdvanceTimer||0)+dt;
    if(m.wave<3&&m.waveAdvanceTimer>=1.1){m.waveAdvanceTimer=0;spawnWave(m.wave+1);}
    else if(m.wave===3&&((!m.pickups.length&&m.waveAdvanceTimer>=.65)||m.waveAdvanceTimer>=8))endRound(true);
  } else if(m.enemies.some(enemy=>enemy.hp>0))m.waveAdvanceTimer=0;
}
function resolveHit(amount,x,y){
  const p=match.player;
  if(p.dodgeTime>0||Math.random()<dodgeChance()){match.floats.push({x,y,text:'VERFEHLT',t:0,color:'#596574'});playSound('dodge');return;}
  const finalDamage=amount*(1-currentArmor().resist);p.hp=Math.max(0,p.hp-finalDamage);p.hitFlash=.2;match.shake=.08;match.floats.push({x,y,text:`-${Math.round(finalDamage)}`,t:0,color:'#c44d4d'});playSound('hit');
}
function dodge(){
  if(!match||match.over||match.paused||match.player.dodgeCd>0)return;
  const p=match.player,keys=match.keys;let dx=(keys.has('right')?1:0)-(keys.has('left')?1:0)+(match.joystick?.x||0),dy=(keys.has('down')?1:0)-(keys.has('up')?1:0)+(match.joystick?.y||0);
  if(!dx&&!dy){dx=p.faceX??1;dy=p.faceY??0;}const len=Math.hypot(dx,dy)||1;dx/=len;dy/=len;
  if(match.mode!=='pvp'){
    const step=.012*currentBoots().speed;
    for(let i=0;i<10;i++)Object.assign(p,moveWithCover(match.map,p.x,p.y,dx*step,dy*step,.022));
  }
  p.faceX=dx;p.faceY=dy;p.dodgeTime=.43;p.dodgeCd=Math.max(1.25,2.35-(profile.skills.dodge||0)*.28);playSound('dodge');
  if(match.mode==='pvp')socket?.emit('pvp:dodge',{x:dx,y:dy},result=>{if(result?.error){p.dodgeCd=0;toast(result.error);}});
}
function drawWeapon(ctx,model,scale=1){
  ctx.save();ctx.scale(scale,scale);ctx.lineCap='round';ctx.lineJoin='round';
  if(model==='blaster'||model==='rifle'||model==='launcher'){
    const body=model==='launcher'?'#a77b55':model==='rifle'?'#576576':'#637f94',metal='#d2d9df';
    ctx.fillStyle=body;ctx.strokeStyle='#303944';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(-6,-23,12,38,4);ctx.fill();ctx.stroke();
    ctx.fillStyle=metal;ctx.beginPath();ctx.roundRect(-3,-39,6,19,2);ctx.fill();ctx.fillStyle='#303944';ctx.beginPath();ctx.roundRect(-4,12,8,12,3);ctx.fill();
    ctx.fillStyle=model==='launcher'?'#d7a14d':'#93d8df';ctx.beginPath();ctx.arc(0,-21,3,0,Math.PI*2);ctx.fill();
  }
  else if(model==='staff'){ctx.strokeStyle='#825b43';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(0,14);ctx.lineTo(0,-31);ctx.stroke();ctx.fillStyle='#89d5d0';ctx.beginPath();ctx.arc(0,-37,7,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();}
  else {ctx.strokeStyle='#553a2c';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(0,8);ctx.lineTo(0,-9);ctx.stroke();ctx.strokeStyle='#d7b577';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-10,-11);ctx.lineTo(10,-11);ctx.stroke();ctx.fillStyle='#d6dde4';ctx.strokeStyle='#708090';ctx.lineWidth=1.5;ctx.beginPath();if(model==='spear'){ctx.moveTo(0,-44);ctx.lineTo(9,-17);ctx.lineTo(0,-12);ctx.lineTo(-9,-17);}else if(model==='sabre'){ctx.moveTo(-1,-42);ctx.quadraticCurveTo(18,-28,8,-12);ctx.lineTo(-3,-16);ctx.quadraticCurveTo(7,-28,-1,-42);}else{ctx.moveTo(0,-44);ctx.lineTo(10,-17);ctx.lineTo(5,-11);ctx.lineTo(-5,-11);ctx.lineTo(-10,-17);}ctx.closePath();ctx.fill();ctx.stroke();ctx.strokeStyle='rgba(255,255,255,.86)';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,-39);ctx.lineTo(0,-18);ctx.stroke();ctx.fillStyle='#d9c58f';ctx.beginPath();ctx.arc(0,31,3,0,Math.PI*2);ctx.fill();}
  ctx.restore();
}
function drawFighter(ctx,x,y,p,w,h){
  const weapon=arenaWeapon(),moving=Math.hypot(p.vx||0,p.vy||0)>.01,bob=moving?Math.sin(match.elapsed*18)*2:Math.sin(match.elapsed*3.3)*1.2;
  const skinTone=skinTones.find(tone=>tone.id===profile.skinTone)||skinTones[1],skinColor=skinTone.colors[1];
  ctx.save();ctx.translate(x,y+bob);if(p.dodgeTime>0){ctx.globalAlpha=.68;ctx.scale(1.12,.88);}ctx.fillStyle='rgba(15,22,30,.18)';ctx.beginPath();ctx.ellipse(0,21,18,7,0,0,Math.PI*2);ctx.fill();
  const stride=moving?Math.sin(match.elapsed*17)*4:0,cosmeticShoes=profile.cosmetics.feet==='Neon-Sneaker'||profile.cosmetics.feet==='Sternen-Schuhe',bootColor=cosmeticShoes?'#e4ebf1':currentBoots().model==='storm'?'#7b7791':currentBoots().model==='light'?'#9db0ba':'#806c5e';ctx.fillStyle='#354356';
  ctx.save();ctx.translate(-6,5);ctx.rotate(stride*.025);ctx.beginPath();ctx.roundRect(-5,-3,9,22,4);ctx.fill();ctx.fillStyle=bootColor;ctx.beginPath();ctx.roundRect(-7,15,14,8,4);ctx.fill();ctx.restore();
  ctx.fillStyle='#354356';ctx.save();ctx.translate(6,5);ctx.rotate(-stride*.025);ctx.beginPath();ctx.roundRect(-4,-3,9,22,4);ctx.fill();ctx.fillStyle=bootColor;ctx.beginPath();ctx.roundRect(-2,15,14,8,4);ctx.fill();ctx.restore();
  const armor=currentArmor();ctx.fillStyle=profile.cosmetics.body==='Sternen-Hoodie'?'#37465a':profile.cosmetics.body==='Nebeljacke'?'#b7c1c9':'#e7ebef';ctx.strokeStyle='#788593';ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(-17,-16,34,26,9);ctx.fill();ctx.stroke();ctx.fillStyle='rgba(255,255,255,.38)';ctx.beginPath();ctx.ellipse(-7,-8,5,9,-.4,0,Math.PI*2);ctx.fill();
  if(armor.model!=='vest'){ctx.fillStyle=armor.model==='leather'?'#8b6650':armor.model==='shadow'?'#3a3d45':'#a8b2bd';ctx.strokeStyle=armor.model==='leather'?'#624839':'#66727f';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-14,-14);ctx.lineTo(-5,-10);ctx.lineTo(0,-14);ctx.lineTo(5,-10);ctx.lineTo(14,-14);ctx.lineTo(16,3);ctx.lineTo(8,9);ctx.lineTo(-8,9);ctx.lineTo(-16,3);ctx.closePath();ctx.fill();ctx.stroke();ctx.strokeStyle='rgba(255,255,255,.5)';ctx.beginPath();ctx.moveTo(0,-10);ctx.lineTo(0,6);ctx.stroke();}
  ctx.fillStyle=skinColor;ctx.beginPath();ctx.roundRect(-22,-11,8,18,5);ctx.roundRect(14,-11,8,18,5);ctx.fill();
  ctx.fillStyle=skinColor;ctx.beginPath();ctx.ellipse(0,-26,14,16,0,0,Math.PI*2);ctx.fill();
  const hairColor=swatches.includes(profile.hair)?profile.hair:swatches[0];ctx.fillStyle=hairColor;
  const cap=()=>{ctx.beginPath();ctx.moveTo(-14,-28);ctx.bezierCurveTo(-19,-49,-9,-52,0,-51);ctx.bezierCurveTo(15,-52,19,-43,14,-28);ctx.quadraticCurveTo(7,-31,4,-39);ctx.quadraticCurveTo(-2,-34,-9,-35);ctx.closePath();ctx.fill();};
  const lock=(side,bottom)=>{ctx.beginPath();ctx.moveTo(side*11,-34);ctx.quadraticCurveTo(side*16,-20,side*13,bottom);ctx.lineTo(side*8,bottom-3);ctx.lineTo(side*7,-31);ctx.closePath();ctx.fill();};
  if(profile.hairStyle==='long'){lock(-1,7);lock(1,7);cap();}
  else if(profile.hairStyle==='curls'){for(const [cx,cy,r] of [[-12,-43,6],[-7,-49,7],[2,-51,7],[11,-47,7],[15,-39,6],[-14,-34,4],[14,-34,4]]){ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();}cap();}
  else if(profile.hairStyle==='bob'){lock(-1,-8);lock(1,-8);cap();}
  else if(profile.hairStyle==='ponytail'){ctx.beginPath();ctx.moveTo(10,-37);ctx.bezierCurveTo(25,-35,23,-21,17,-10);ctx.lineTo(12,-15);ctx.bezierCurveTo(19,-28,15,-31,8,-31);ctx.fill();cap();ctx.fillStyle='#d8c69a';ctx.beginPath();ctx.ellipse(15,-31,3,2,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=hairColor;}
  else if(profile.hairStyle==='sidecut'){ctx.beginPath();ctx.moveTo(-14,-29);ctx.bezierCurveTo(-18,-50,-6,-53,4,-50);ctx.bezierCurveTo(16,-48,18,-40,14,-29);ctx.quadraticCurveTo(6,-32,4,-40);ctx.quadraticCurveTo(-4,-34,-14,-29);ctx.fill();ctx.strokeStyle='rgba(255,255,255,.62)';ctx.lineWidth=1;for(let y=-30;y<=-22;y+=4){ctx.beginPath();ctx.moveTo(10,y);ctx.lineTo(13,y+1);ctx.stroke();}ctx.fillStyle=hairColor;}
  else {cap();lock(-1,-22);lock(1,-22);}
  if(profile.cosmetics.head==='Wolkenmütze'){ctx.fillStyle='#dfe5eb';ctx.beginPath();ctx.ellipse(0,-41,15,6,0,0,Math.PI*2);ctx.fill();ctx.fillRect(-10,-51,20,11);}
  if(profile.cosmetics.head==='Mondkrone'){ctx.fillStyle='#d4bd72';ctx.beginPath();ctx.moveTo(-13,-39);ctx.lineTo(-10,-51);ctx.lineTo(-3,-44);ctx.lineTo(0,-56);ctx.lineTo(4,-44);ctx.lineTo(12,-51);ctx.lineTo(14,-39);ctx.closePath();ctx.fill();}
  ctx.fillStyle='#30303a';ctx.beginPath();ctx.arc(-5,-25,1.4,0,Math.PI*2);ctx.arc(5,-25,1.4,0,Math.PI*2);ctx.fill();
  if(profile.makeup==='rosy'){ctx.fillStyle='rgba(219,105,111,.46)';ctx.beginPath();ctx.ellipse(-9,-19,3.5,1.8,0,0,Math.PI*2);ctx.ellipse(9,-19,3.5,1.8,0,0,Math.PI*2);ctx.fill();}
  if(profile.makeup==='freckles'){ctx.fillStyle='#925f47';for(const [fx,fy] of [[-8,-18],[-5,-17],[-2,-18],[2,-18],[5,-17],[8,-18]]){ctx.beginPath();ctx.arc(fx,fy,.7,0,Math.PI*2);ctx.fill();}}
  if(profile.makeup==='liner'){ctx.strokeStyle='#302b39';ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(-9,-27);ctx.lineTo(-4,-26);ctx.moveTo(4,-26);ctx.lineTo(9,-27);ctx.stroke();}
  if(profile.cosmetics.face==='Cooler Blick'){ctx.strokeStyle='#303943';ctx.lineWidth=2;ctx.strokeRect(-11,-29,9,7);ctx.strokeRect(2,-29,9,7);ctx.beginPath();ctx.moveTo(-2,-26);ctx.lineTo(2,-26);ctx.stroke();}
  ctx.save();ctx.translate(17,-6);const swing=p.attackAnim>0?Math.sin((.23-p.attackAnim)/.23*Math.PI)*1.4:0;ctx.rotate(Math.atan2(p.aimY||p.faceY||0,p.aimX||p.faceX||1)+Math.PI/2+swing);drawWeapon(ctx,weapon.model,.72);ctx.restore();
  if(p.attackAnim>0){ctx.strokeStyle='rgba(255,255,255,.78)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(12,-8,29,-1.2,1.05);ctx.stroke();}
  ctx.restore();
}
function drawEnemy(ctx,e,x,y){
  const spec=enemyTypes[e.type],scale=e.type==='boss'?1.72:e.type==='brute'?1.28:e.type==='scout'?.78:1;ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);ctx.fillStyle='rgba(20,25,32,.17)';ctx.beginPath();ctx.ellipse(0,18,17,6,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=e.flash?'#fff':e.type==='boss'?arenaBosses[match.map.id].color:spec.color;ctx.strokeStyle='#414958';ctx.lineWidth=2;
  if(e.type==='boss'){ctx.beginPath();ctx.moveTo(0,-23);ctx.lineTo(17,-10);ctx.lineTo(14,13);ctx.lineTo(0,19);ctx.lineTo(-14,13);ctx.lineTo(-17,-10);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#f3d58c';ctx.beginPath();ctx.moveTo(-12,-13);ctx.lineTo(-17,-28);ctx.lineTo(-3,-18);ctx.lineTo(0,-31);ctx.lineTo(4,-18);ctx.lineTo(18,-28);ctx.lineTo(12,-12);ctx.closePath();ctx.fill();}
  else if(e.type==='brute'){ctx.beginPath();ctx.roundRect(-16,-13,32,31,8);ctx.fill();ctx.stroke();ctx.fillStyle='#e2c2a4';ctx.beginPath();ctx.moveTo(-11,-13);ctx.lineTo(-15,-23);ctx.lineTo(-4,-15);ctx.moveTo(11,-13);ctx.lineTo(15,-23);ctx.lineTo(4,-15);ctx.fill();}
  else if(e.type==='ranger'){ctx.beginPath();ctx.moveTo(0,-19);ctx.lineTo(15,-4);ctx.lineTo(10,15);ctx.lineTo(-10,15);ctx.lineTo(-15,-4);ctx.closePath();ctx.fill();ctx.stroke();ctx.strokeStyle='#e5d9ac';ctx.lineWidth=3;ctx.beginPath();ctx.arc(18,-6,15,-1.1,1.1);ctx.stroke();}
  else {ctx.beginPath();ctx.ellipse(0,0,12,15,0,0,Math.PI*2);ctx.fill();ctx.stroke();if(e.type==='scout'){ctx.fillStyle='#e7d2a1';ctx.beginPath();ctx.moveTo(-7,-10);ctx.lineTo(-15,-19);ctx.lineTo(-3,-15);ctx.moveTo(7,-10);ctx.lineTo(15,-19);ctx.lineTo(3,-15);ctx.fill();}}
  ctx.fillStyle='#282c34';ctx.beginPath();ctx.arc(-4,-3,1.8,0,Math.PI*2);ctx.arc(4,-3,1.8,0,Math.PI*2);ctx.fill();ctx.fillStyle='#252c37';ctx.beginPath();ctx.roundRect(-15,-24,30,4,2);ctx.fill();ctx.fillStyle='#d75e58';ctx.beginPath();ctx.roundRect(-15,-24,30*Math.max(0,e.hp/e.max),4,2);ctx.fill();ctx.restore();
}
function drawRemoteFighter(ctx,x,y,p){
  const moving=Boolean(p.move?.x||p.move?.y),bob=moving?Math.sin(match.elapsed*18)*2:Math.sin(match.elapsed*3.3)*1.1,stride=moving?Math.sin(match.elapsed*17)*4:0;
  const tones=skinTones.find(item=>item.id===p.skinTone)||skinTones[1],skin=tones.colors[1],hair=swatches.includes(p.hair)?p.hair:swatches[0];
  ctx.save();ctx.translate(x,y+bob);ctx.fillStyle='rgba(15,22,30,.18)';ctx.beginPath();ctx.ellipse(0,21,18,7,0,0,Math.PI*2);ctx.fill();
  for(const side of [-1,1]){ctx.save();ctx.translate(side*6,5);ctx.rotate(side*stride*.025);ctx.fillStyle='#354356';ctx.beginPath();ctx.roundRect(-5,-3,9,22,4);ctx.fill();ctx.fillStyle=p.feetModel==='shoes'?'#e4ebf1':p.bootsModel==='storm'?'#7b7791':p.bootsModel==='light'?'#9db0ba':'#806c5e';ctx.beginPath();ctx.roundRect(side<0?-7:-2,15,14,8,4);ctx.fill();ctx.restore();}
  ctx.fillStyle=p.bodyModel==='hoodie'?'#37465a':p.bodyModel==='jacket'?'#b7c1c9':'#e7ebef';ctx.strokeStyle='#788593';ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(-17,-16,34,26,9);ctx.fill();ctx.stroke();
  if(p.armorModel&&p.armorModel!=='vest'){ctx.fillStyle=p.armorModel==='leather'?'#8b6650':p.armorModel==='shadow'?'#3a3d45':'#a8b2bd';ctx.strokeStyle='#66727f';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-14,-14);ctx.lineTo(-5,-10);ctx.lineTo(0,-14);ctx.lineTo(5,-10);ctx.lineTo(14,-14);ctx.lineTo(16,3);ctx.lineTo(8,9);ctx.lineTo(-8,9);ctx.lineTo(-16,3);ctx.closePath();ctx.fill();ctx.stroke();}
  ctx.fillStyle=skin;ctx.beginPath();ctx.roundRect(-22,-11,8,18,5);ctx.roundRect(14,-11,8,18,5);ctx.fill();ctx.beginPath();ctx.ellipse(0,-26,14,16,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=hair;
  if(p.hairStyle==='long'||p.hairStyle==='bob'){ctx.beginPath();ctx.roundRect(-15,-39,7,p.hairStyle==='long'?48:28,4);ctx.roundRect(8,-39,7,p.hairStyle==='long'?48:28,4);ctx.fill();}
  if(p.hairStyle==='curls'){for(const [hx,hy,hr] of [[-12,-41,6],[-5,-49,7],[4,-50,7],[12,-42,6]]){ctx.beginPath();ctx.arc(hx,hy,hr,0,Math.PI*2);ctx.fill();}}
  if(p.hairStyle==='ponytail'){ctx.beginPath();ctx.moveTo(10,-39);ctx.bezierCurveTo(25,-36,23,-20,17,-9);ctx.lineTo(12,-14);ctx.bezierCurveTo(18,-27,15,-32,8,-32);ctx.fill();}
  ctx.beginPath();ctx.moveTo(-14,-28);ctx.bezierCurveTo(-19,-49,-9,-52,0,-51);ctx.bezierCurveTo(15,-52,19,-43,14,-28);ctx.quadraticCurveTo(7,-31,4,-39);ctx.quadraticCurveTo(-2,-34,-9,-35);ctx.closePath();ctx.fill();
  if(p.hairStyle==='ponytail'){ctx.fillStyle='#d8c69a';ctx.beginPath();ctx.ellipse(15,-31,3,2,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=hair;}
  if(p.hairStyle==='sidecut'){ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=1;for(let hy=-30;hy<=-22;hy+=4){ctx.beginPath();ctx.moveTo(10,hy);ctx.lineTo(13,hy+1);ctx.stroke();}}
  if(p.headModel==='hat'){ctx.fillStyle='#dfe5eb';ctx.beginPath();ctx.ellipse(0,-41,15,6,0,0,Math.PI*2);ctx.fill();ctx.fillRect(-10,-51,20,11);}
  if(p.headModel==='crown'){ctx.fillStyle='#d4bd72';ctx.beginPath();ctx.moveTo(-13,-39);ctx.lineTo(-10,-51);ctx.lineTo(-3,-44);ctx.lineTo(0,-56);ctx.lineTo(4,-44);ctx.lineTo(12,-51);ctx.lineTo(14,-39);ctx.closePath();ctx.fill();}
  ctx.fillStyle='#30303a';ctx.beginPath();ctx.arc(-5,-25,1.4,0,Math.PI*2);ctx.arc(5,-25,1.4,0,Math.PI*2);ctx.fill();
  if(p.faceModel==='glasses'){ctx.strokeStyle='#303943';ctx.lineWidth=2;ctx.strokeRect(-11,-29,9,7);ctx.strokeRect(2,-29,9,7);ctx.beginPath();ctx.moveTo(-2,-26);ctx.lineTo(2,-26);ctx.stroke();}
  if(p.hitFlash>0){ctx.globalAlpha=Math.min(.65,p.hitFlash*3);ctx.fillStyle='#fff';ctx.beginPath();ctx.ellipse(0,-14,20,36,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
  ctx.save();ctx.translate(17,-6);const swing=p.attackAnim>0?Math.sin((.22-p.attackAnim)/.22*Math.PI)*1.4:0;ctx.rotate(swing);drawWeapon(ctx,p.weaponModel||'sword',.72);ctx.restore();
  if(p.attackAnim>0){ctx.strokeStyle='rgba(255,255,255,.78)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(12,-8,29,-1.2,1.05);ctx.stroke();}
  ctx.fillStyle=profile.theme==='dark'?'#f4f4f2':'#25262a';ctx.font='700 10px Manrope,sans-serif';ctx.textAlign='center';ctx.fillText(p.name||p.username||'Spieler',0,-58);ctx.restore();
}
function drawArena(ctx,w,h) {
  const m=match;if(!m)return;const p=m.player,dark=profile.theme==='dark';
  ctx.clearRect(0,0,w,h);ctx.save();if(m.shake>0)ctx.translate((Math.random()-.5)*6,(Math.random()-.5)*5);
  const colors=m.map?.ground||arenaMaps[0].ground;const floor=ctx.createRadialGradient(w*.5,h*.44,Math.min(w,h)*.04,w*.5,h*.5,Math.max(w,h)*.75);floor.addColorStop(0,dark?colors[2]:colors[0]);floor.addColorStop(1,dark?colors[3]:colors[1]);ctx.fillStyle=floor;ctx.fillRect(0,0,w,h);
  ctx.strokeStyle=dark?'rgba(255,255,255,.11)':'rgba(71,71,69,.12)';ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(10,10,w-20,h-20,22);ctx.stroke();
  ctx.fillStyle=dark?'rgba(255,255,255,.035)':'rgba(30,35,42,.035)';for(let x=0;x<w;x+=36){for(let y=0;y<h;y+=36){ctx.fillRect(x+((y/36)%2?18:0),y,2,2);}}
  ctx.strokeStyle=dark?'rgba(255,255,255,.045)':'rgba(38,44,52,.06)';ctx.lineWidth=1;for(let x=0;x<w;x+=56){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}for(let y=0;y<h;y+=56){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  ctx.strokeStyle=dark?'rgba(255,255,255,.08)':'rgba(74,70,64,.11)';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(w*.5,h*.52,w*.25,h*.22,0,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle=dark?'rgba(255,255,255,.045)':'rgba(255,255,255,.35)';ctx.beginPath();ctx.ellipse(w*.5,h*.52,w*.12,h*.09,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=dark?'rgba(255,255,255,.06)':'rgba(50,55,60,.09)';ctx.font='800 11px Manrope,sans-serif';ctx.textAlign='left';ctx.fillText(m.map?.name||'Arena',24,32);
  for(const [cx,cy,cw,ch] of (m.map?.cover||[])){const x=cx*w,y=cy*h,bw=cw*w,bh=ch*h;ctx.fillStyle='rgba(20,24,30,.2)';ctx.beginPath();ctx.roundRect(x+3,y+6,bw,bh,8);ctx.fill();ctx.fillStyle=dark?'#51555a':m.map?.trim||'#b1a187';ctx.strokeStyle=dark?'#777b80':'#8e8071';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(x,y,bw,bh,8);ctx.fill();ctx.stroke();ctx.fillStyle=dark?'rgba(255,255,255,.12)':'rgba(255,255,255,.42)';ctx.beginPath();ctx.roundRect(x+5,y+4,bw-10,Math.max(4,bh*.18),4);ctx.fill();}
  const aim=aimVector(),weapon=arenaWeapon(),angle=Math.atan2(aim.y,aim.x);
  const reach=weapon.range+(weapon.ammo||m.mode==='pvp'?0:(profile.skills.focus||0)*.015);
  const spread=weapon.ammo ? .15 : Math.acos(.62);
  ctx.save();ctx.translate(p.x*w,p.y*h);ctx.fillStyle='rgba(247,211,118,.19)';ctx.strokeStyle='rgba(224,172,68,.66)';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,0);ctx.ellipse(0,0,reach*w,reach*h,0,angle-spread,angle+spread);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
  m.blasts?.forEach(blast=>{ctx.globalAlpha=Math.max(0,1-blast.t/.35);ctx.fillStyle='rgba(255,175,89,.35)';ctx.strokeStyle='rgba(255,218,150,.85)';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(blast.x*w,blast.y*h,w*blast.r,h*blast.r,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.globalAlpha=1;});
  m.pickups?.forEach(item=>{const x=item.x*w,y=item.y*h+Math.sin(item.t*5)*3;ctx.fillStyle='rgba(22,27,33,.22)';ctx.beginPath();ctx.ellipse(x,y+10,12,4,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#eac56b';ctx.strokeStyle='#996f2c';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x,y,9,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#fff2c6';ctx.beginPath();ctx.arc(x-2,y-2,2,0,Math.PI*2);ctx.fill();ctx.fillStyle=dark?'#fff':'#40331d';ctx.font='800 9px Manrope,sans-serif';ctx.textAlign='center';ctx.fillText(item.value,x,y-14);});
  m.enemies.forEach(e=>{if(e.hp<=0)return;drawEnemy(ctx,e,e.x*w,e.y*h);});
  m.projectiles.forEach(b=>{const color=b.owner==='player'?(b.splash?'#ffb35c':'#8acde3'):(b.splash?'#ff8762':'#ab92d2');ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=b.splash?16:10;ctx.beginPath();ctx.arc(b.x*w,b.y*h,b.r||6,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;});
  drawFighter(ctx,p.x*w,p.y*h,p,w,h);
  if(m.mode==='pvp'&&m.remotePlayer)drawRemoteFighter(ctx,m.remotePlayer.x*w,m.remotePlayer.y*h,m.remotePlayer);
  if(m.parryFlash>0){ctx.globalAlpha=Math.min(1,m.parryFlash/.12);ctx.strokeStyle='#e8f4ff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(p.x*w,p.y*h,24+(1-m.parryFlash/.24)*18,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;}
  const collecting=m.wave===3&&m.waveAdvanceTimer>0&&!m.over;
  if(m.mode!=='pvp'&&(m.waveToast>0||collecting)){
    ctx.fillStyle=dark?'#fff':'#25272a';ctx.font='900 17px Manrope,sans-serif';ctx.textAlign='center';
    const banner=collecting?`Münzen einsammeln · ${Math.ceil(8-m.waveAdvanceTimer)} s`:m.wave===3?arenaBosses[m.map.id].name:'Welle '+m.wave;
    ctx.fillText(banner,w/2,32);
  }
  m.floats.forEach(f=>{
    const critical=f.text.startsWith('KRIT!');
    ctx.globalAlpha=Math.max(0,1-f.t);
    ctx.fillStyle=critical?'#ffda77':f.color;ctx.font=`900 ${critical?18:12}px Manrope, sans-serif`;ctx.textAlign='center';
    if(critical){ctx.strokeStyle='#493018';ctx.lineWidth=3;ctx.strokeText(f.text,f.x*w,f.y*h-f.t*25);}
    ctx.fillText(f.text,f.x*w,f.y*h-f.t*25);ctx.globalAlpha=1;
  });
  ctx.restore();
}
function updateHud() {
  if(!match)return;const p=match.player,fill=document.querySelector('#health-fill'),txt=document.querySelector('#health-text'),count=document.querySelector('#enemy-count');
  if(fill)fill.style.width=`${Math.max(0,p.hp/p.max*100)}%`;if(txt)txt.textContent=`${Math.ceil(p.hp)} HP`;if(count)count.textContent=match.mode==='pvp'?`VS ${match.remotePlayer?.name||'Freund'}`:`${match.kills} / ${match.total} Gegner`;
  if(match.mode==='pvp'){const opponent=match.remotePlayer,opponentFill=document.querySelector('#opponent-health-fill'),opponentText=document.querySelector('#opponent-health-text');if(opponentFill)opponentFill.style.width=`${Math.max(0,opponent.hp/opponent.maxHp*100)}%`;if(opponentText)opponentText.textContent=`${Math.ceil(opponent.hp)} HP`;}
  const dodgeStatus=document.querySelector('#dodge-status');if(dodgeStatus)dodgeStatus.textContent=p.dodgeCd>0?`${p.dodgeCd.toFixed(1)} S`:'BEREIT';
  const ammoText=document.querySelector('#ammo-count');if(ammoText)ammoText.textContent=p.reloadingUntil?'LÄDT …':`${p.magazine||0} / ${p.ammo||0}`;
  const attackStatus=document.querySelector('#attack-status');if(attackStatus)attackStatus.textContent=p.reloadingUntil?'LÄDT …':p.attackCd>0?p.attackCd.toFixed(1)+' S':'BEREIT';
  const money=document.querySelector('#round-money');if(money)money.textContent='◈ '+(match.coinsEarned||0);
  const wave=document.querySelector('#wave-count');if(wave&&match.mode!=='pvp')wave.textContent=`WELLE ${match.wave||1}/3`;
}
function reloadWeapon(){
  if(!match||match.over||match.paused)return;
  const weapon=arenaWeapon(),p=match.player;if(!weapon.ammo||p.reloadingUntil)return;
  if(p.magazine>=weapon.ammo.mag||p.ammo<=0)return toast(p.ammo<=0?'Keine Reservemunition mehr.':'Magazin ist voll.');
  playSound('reload');
  if(match.mode==='pvp')socket?.emit('pvp:reload',{},result=>{if(result?.error)toast(result.error);});
  else p.reloadingUntil=match.elapsed+weapon.ammo.reload;
}
function attack() {
  if(!match||match.over||match.paused||match.player.attackCd>0)return;
  const p=match.player,weapon=arenaWeapon();
  if(p.reloadingUntil){return;}
  const aim=aimVector();p.aimX=aim.x;p.aimY=aim.y;p.faceX=aim.x;p.faceY=aim.y;
  if(match.mode==='pvp'){
    if(weapon.ammo&&p.magazine<=0){reloadWeapon();return;}
    p.attackCd=weapon.cooldown;p.attackAnim=.22;playSound('attack');
    socket?.emit('pvp:attack',{aim},result=>{if(result?.error){p.attackCd=.15;toast(result.error);}});return;
  }
  if(weapon.ammo&&p.magazine<=0){reloadWeapon();return;}
  p.attackCd=weapon.cooldown;p.attackAnim=.23;playSound('attack');
  let parryIndex=-1,parryDistance=.14;
  for(let i=0;i<match.projectiles.length;i++){const shot=match.projectiles[i];if(shot.owner!=='enemy')continue;const dx=shot.x-p.x,dy=shot.y-p.y,d=Math.hypot(dx,dy),dot=(dx*aim.x+dy*aim.y)/(d||1);if(d<parryDistance&&dot>.2){parryDistance=d;parryIndex=i;}}
  if(parryIndex>=0){const shot=match.projectiles.splice(parryIndex,1)[0];match.parryFlash=.24;match.floats.push({x:shot.x,y:shot.y,text:'ABGEWEHRT',t:0,color:'#647eaa'});playSound('parry');return;}
  if(weapon.ammo){
    const crit=Math.random()<critChance();p.magazine--;const speed=weapon.model==='launcher'?.55:weapon.model==='rifle'?1.05:.88;
    match.projectiles.push({owner:'player',x:p.x+aim.x*.03,y:p.y+aim.y*.03,vx:aim.x*speed,vy:aim.y*speed,damage:weapon.damage+(profile.skills.might||0)*3,crit,splash:weapon.splash,life:weapon.range/speed,r:weapon.model==='launcher'?8:5});
    if(p.magazine===0&&p.ammo>0)reloadWeapon();
    return;
  }
  let best=weapon.range+(profile.skills.focus||0)*.015,target=null;
  for(const e of match.enemies){if(e.hp<=0)continue;const dx=e.x-p.x,dy=e.y-p.y,d=Math.hypot(dx,dy),dot=(dx*aim.x+dy*aim.y)/(d||1);if(d<best&&dot>.62&&!coverBetween(match.map,p,e)){best=d;target=e;}}
  if(target){const crit=Math.random()<critChance(),damage=weapon.damage+(profile.skills.might||0)*3;damageEnemy(target,damage,crit);const dx=target.x-p.x,dy=target.y-p.y,len=Math.hypot(dx,dy)||1;const pos=moveWithCover(match.map,target.x,target.y,dx/len*.025,dy/len*.025,.02);target.x=pos.x;target.y=pos.y;}
}
function endRound(won) {
  if(!match||match.over)return;match.over=true;match.keys.clear();
  ensureDaily();
  const coins=match.coinsEarned||0;profile.coins+=coins;
  const xp=(won?arenaCfg[difficulty].reward:0)+match.kills*4;
  if(xp){addXp(xp);profile.daily.xp=(profile.daily.xp||0)+xp;}
  if(won){
    profile.daily.wins++;
    profile.stats.wins++;
    if(difficulty==='hard')profile.stats.hardWins++;
  }
  save();setTimeout(()=>showResult(won,xp,coins),300);
}
function showResult(won,xp,coins) {
  const root=document.querySelector('#overlay-root');if(!root)return;
  const available = weaponQuests.some(quest=>!profile.weaponQuestClaims.includes(quest.id) && quest.goals.every(goal=>weaponQuestProgress(goal)===goal.count));
  root.innerHTML=`<div class="overlay"><section class="result-card"><div class="result-icon">${won?'🏆':'💫'}</div><div class="eyebrow">${won?'Runde geschafft':'Runde vorbei'}</div><h2 style="margin:8px 0">${won?'Starke Runde!':'Gleich nochmal?'}</h2><p class="muted" style="font-size:11px;line-height:1.6">${won?'Du hast alle drei Wellen überstanden.':'Deine eingesammelten Münzen und dein XP-Fortschritt bleiben erhalten.'}</p><div class="result-rewards">${xp?`<span>+${xp} XP</span>`:''}${coins?`<span>+${coins} ◈ eingesammelt</span>`:''}</div><p class="result-xp">Level ${profile.level} · ${formatXp.format(profile.xp)} / ${formatXp.format(xpForNextLevel(profile.level))} XP</p>${available?'<button class="button ghost full weapon-quest-link" data-result-quests>Waffenquest abholen</button>':''}<button class="button full" data-result="continue">Weiter</button></section></div>`;
  root.querySelector('[data-result]').addEventListener('click',returnToHub);
  root.querySelector('[data-result-quests]')?.addEventListener('click',()=>{returnToHub();go('quests');});
}

function normalizeProfile(value,username) {
  const name=typeof value?.name==='string'&&value.name.trim()?value.name.trim():username;
  const base=defaults(name),oldSkills=value?.skills||{};
  const migratedSkills={...base.skills,...oldSkills,health:oldSkills.health??oldSkills.vitality??0,might:oldSkills.might??oldSkills.power??0,luck:oldSkills.luck??oldSkills.magnet??0};
  const next={...base,...(value||{}),name,onboarded:value?.onboarded??false,theme:value?.theme==='dark'?'dark':'light',hairStyle:hairStyles.some(item=>item.id===value?.hairStyle)?value.hairStyle:'short',skinTone:skinTones.some(item=>item.id===value?.skinTone)?value.skinTone:'warm',makeup:makeupOptions.some(item=>item.id===value?.makeup)?value.makeup:'natural',armor:armors.some(item=>item.name===value?.armor)?value.armor:'Camp-Weste',boots:boots.some(item=>item.name===value?.boots)?value.boots:'Camp-Stiefel',cosmetics:{...base.cosmetics,...value?.cosmetics},skills:migratedSkills,daily:{...base.daily,...value?.daily},stats:{...base.stats,...value?.stats}};
  const count = (value, fallback=0) => Number.isSafeInteger(value) && value>=0 && value<=1e12 ? value : fallback;
  next.progressionVersion = PROGRESSION_VERSION;
  next.level = Math.max(1, Math.min(count(next.level,1), 99990));
  Object.assign(next, levelProgress(xpAtLevel(next.level) + count(next.xp)));
  next.passClaims = [...new Set((Array.isArray(value?.passClaims)?value.passClaims:[]).filter(index=>Number.isInteger(index)&&index>=0&&index<passRewards.length))];
  next.passXp = value && value.progressionVersion !== PROGRESSION_VERSION ? upgradeLegacyPassXp(count(next.passXp), next.passClaims) : count(next.passXp);
  const claims = new Set(Array.isArray(value?.weaponQuestClaims) ? value.weaponQuestClaims : []);
  if(value?.mainClaimed)claims.add('first-blade');
  next.weaponQuestClaims = weaponQuests.filter(quest=>claims.has(quest.id)).map(quest=>quest.id);
  delete next.mainClaimed;
  next.weaponSources = Object.fromEntries(weaponQuests
    .map(quest=>[quest.weapon,value?.weaponSources?.[quest.weapon],quest.id])
    .filter(([, source, id])=>source==='shop'||source===id)
    .map(([weapon, source])=>[weapon,source]));
  for(const stat of ['wins','knockouts','hardWins'])next.stats[stat]=count(next.stats[stat]);
  const bossMaps = Array.isArray(next.stats.bossMaps) ? next.stats.bossMaps : [];
  next.stats.bossMaps = arenaMaps.map(map=>map.id).filter(id=>bossMaps.includes(id));
  next.owned = Array.isArray(next.owned) ? [...next.owned] : [];
  if(!next.owned.includes('Trainingsklinge'))next.owned.push('Trainingsklinge');
  if(!next.owned.includes('Camp-Weste'))next.owned.push('Camp-Weste');
  if(!next.owned.includes('Camp-Stiefel'))next.owned.push('Camp-Stiefel');
  if(!next.owned.includes(next.boots))next.boots='Camp-Stiefel';
  next.soundEnabled=value?.soundEnabled??value?.sound??true;next.musicEnabled=value?.musicEnabled??true;next.effectsVolume=value?.effectsVolume??.45;next.musicVolume=value?.musicVolume??.18;
  return next;
}
document.addEventListener('pointerdown',()=>startAudio(),{once:true});
document.addEventListener('click',event=>{const control=event.target.closest('button,select');if(!control||control.disabled||!profile)return;if(control.matches('.move-key,.attack-key,.dodge-key,[data-action="start-round"],[data-action="spin"]'))return;playSound('ui');});
if('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('/sw.js').catch(()=>{});
window.addEventListener('offline',()=>{
  if (!profile) return;
  offlineMode = true;
  if (page !== 'match') render();
});
window.addEventListener('online',()=>{
  if (page !== 'match' && offlineMode) restoreSession();
  else if (!offlineMode) syncProfile();
});
setInterval(()=>{
  if (page === 'match' || document.hidden || !navigator.onLine || !profile) return;
  if (offlineMode) restoreSession();
  else if (profileSync?.pending) syncProfile();
}, 15000);
document.addEventListener('touchmove',event=>{if(document.body.classList.contains('round-active')&&!event.target.closest('.joystick-area,.aim-joystick-area,.combat-buttons,#arena'))event.preventDefault();},{passive:false});
render();
restoreSession();
