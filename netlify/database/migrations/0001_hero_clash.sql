CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY,
  username varchar(18) NOT NULL,
  email varchar(254) NOT NULL,
  password_hash text NOT NULL,
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS last_seen_update integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profile_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profile_writes text[] NOT NULL DEFAULT '{}';

CREATE UNIQUE INDEX IF NOT EXISTS accounts_username_ci ON accounts (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_ci ON accounts (lower(email));

CREATE TABLE IF NOT EXISTS friendships (
  user_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  friend_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  status varchar(16) NOT NULL CHECK (status IN ('pending', 'accepted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, friend_id),
  CHECK (user_id <> friend_id)
);

CREATE TABLE IF NOT EXISTS update_announcements (
  id serial PRIMARY KEY,
  version varchar(64) UNIQUE NOT NULL,
  title varchar(120) NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO update_announcements (version, title, body) VALUES
('2026-11-18-arena-waves-update', 'Neue Arenen, Wellen und Waffen',
$$Kampf: Zieljoystick, Cooldowns, Magazine, Nachladen und Flächenschaden. Kritische Treffer werden hervorgehoben.
Solo: Drei Karten mit Deckung, Gegnerwellen mit Boss und einsammelbare Münzen mit Rundenzähler.
Ausrüstung: Waffeninfos im Shop und Rüstungsstiefel mit Tempobonus.
iPad: Angepasste Touchsteuerung und Schwierigkeit direkt am Startknopf. Die Arena bleibt während der Runde fest.
Konto: Drei Duellmodi, Bestenliste und Offline-Solo mit Synchronisierung auf dein Konto.$$),
('2026-11-18-progression-update', 'Spielerlevel, Waffenquests und Battle Pass',
$$Jedes Spielerlevel und jede Pass-Stufe braucht mehr XP als die vorige.
Sechs dauerhafte Waffenquests zeigen deine Ziele und Belohnungen. Erfüllte Quests holst du im Questmenü ab.
Waffen aus dem Shop und Questbelohnungen sind im Inventar an ihrer Herkunft erkennbar. Bereits erhaltene Waffen und erreichte Stufen bleiben erhalten.$$)
ON CONFLICT (version) DO NOTHING;
