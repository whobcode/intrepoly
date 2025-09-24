export async function initCore(monopolyd1: D1Database) {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS users (
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
    );`,
    `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );`,
    `CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      owner_user_id INTEGER,
      state_json TEXT,
      status TEXT DEFAULT 'open',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(owner_user_id) REFERENCES users(id)
    );`
  ];
  for (const s of stmts) {
    await monopolyd1.exec(s);
  }
}

export async function initUi(monopolyui: D1Database) {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS lobby_rooms (
      id TEXT PRIMARY KEY,
      owner_user TEXT,
      status TEXT DEFAULT 'open',
      created_at TEXT DEFAULT (datetime('now'))
    );`,
    `CREATE TABLE IF NOT EXISTS lobby_members (
      room_id TEXT,
      user TEXT,
      joined_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (room_id, user)
    );`
  ];
  for (const s of stmts) {
    await monopolyui.exec(s);
  }
}

export async function ensureUserByUsername(monopolyd1: D1Database, username: string) {
  await monopolyd1.prepare('INSERT OR IGNORE INTO users (username, gamer_id) VALUES (?, ?)')
    .bind(username, makeGamerId()).run();
  const row = await monopolyd1.prepare('SELECT id, username, gamer_id FROM users WHERE username=?').bind(username).first();
  return row as { id: number; username: string; gamer_id: string } | null;
}

export async function findUserByEmail(monopolyd1: D1Database, email: string) {
  const row = await monopolyd1.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
  return row as any;
}

export async function createUserWithPassword(monopolyd1: D1Database, email: string, username: string, password_hash: string) {
  await monopolyd1.prepare('INSERT INTO users (email, username, password_hash, gamer_id) VALUES (?, ?, ?, ?)')
    .bind(email, username, password_hash, makeGamerId()).run();
  const row = await monopolyd1.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
  return row as any;
}

export async function updateUserOnline(monopolyd1: D1Database, username: string, online: boolean) {
  await monopolyd1.prepare('UPDATE users SET online=?, updated_at=datetime("now") WHERE username=?')
    .bind(online ? 1 : 0, username).run();
}

function makeGamerId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
