-- Core schema for monopolyd1 (users, sessions, games)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE,
  username TEXT UNIQUE,
  password_hash TEXT,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  credits INTEGER DEFAULT 0,
  wallet_amount INTEGER DEFAULT 0,
  wallet_id TEXT,
  online INTEGER DEFAULT 0,
  gamer_id TEXT UNIQUE,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  owner_user_id INTEGER,
  state_json TEXT,
  status TEXT DEFAULT 'open',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(owner_user_id) REFERENCES users(id)
);
