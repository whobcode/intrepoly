/**
 * Initializes the core database schema for the application.
 * This includes tables for users, sessions, and games.
 * @param monopolyd1 The D1 database instance for core data.
 * @returns A promise that resolves when the schema is initialized.
 */
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
      email_verified INTEGER DEFAULT 0,
      verification_token TEXT,
      verification_expires TEXT,
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
    try {
      await monopolyd1.prepare(s).run();
    } catch (e) {
      // Ignore errors for tables that already exist
      console.log('initCore statement skipped:', e);
    }
  }

  // Migration: Add missing columns to existing users table
  const migrations = [
    `ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0;`,
    `ALTER TABLE users ADD COLUMN verification_token TEXT;`,
    `ALTER TABLE users ADD COLUMN verification_expires TEXT;`
  ];
  for (const m of migrations) {
    try {
      await monopolyd1.prepare(m).run();
    } catch (e) {
      // Column already exists, ignore
    }
  }
}

/**
 * Initializes the UI-related database schema.
 * This includes tables for lobby rooms and members.
 * @param monopolyui The D1 database instance for UI data.
 * @returns A promise that resolves when the schema is initialized.
 */
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
    try {
      await monopolyui.prepare(s).run();
    } catch (e) {
      console.log('initUi statement skipped:', e);
    }
  }
}

/**
 * Initializes the analytics/app database schema (binding: DB).
 * Executes each statement individually to avoid SQL parsing issues.
 */
export async function initApp(DB: D1Database) {
  const stmts = [
    `PRAGMA foreign_keys = ON;`,
    `CREATE TABLE IF NOT EXISTS game_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      type TEXT NOT NULL,
      payload_json TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE (game_id, seq)
    );`,
    `CREATE INDEX IF NOT EXISTS idx_game_events_game ON game_events (game_id);`,
    `CREATE INDEX IF NOT EXISTS idx_game_events_created ON game_events (created_at);`,
    `CREATE TABLE IF NOT EXISTS game_snapshots (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL,
      turn INTEGER NOT NULL,
      state_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE (game_id, turn)
    );`,
    `CREATE INDEX IF NOT EXISTS idx_game_snapshots_game ON game_snapshots (game_id);`,
    `CREATE INDEX IF NOT EXISTS idx_game_snapshots_created ON game_snapshots (created_at);`,
    `CREATE TABLE IF NOT EXISTS bets (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK (amount >= 0),
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );`,
    `CREATE INDEX IF NOT EXISTS idx_bets_game ON bets (game_id);`,
    `CREATE INDEX IF NOT EXISTS idx_bets_user ON bets (user_id);`,
    `CREATE TABLE IF NOT EXISTS payouts (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      reason TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );`,
    `CREATE INDEX IF NOT EXISTS idx_payouts_game ON payouts (game_id);`,
    `CREATE INDEX IF NOT EXISTS idx_payouts_user ON payouts (user_id);`
  ];
  for (const s of stmts) {
    try {
      await DB.prepare(s).run();
    } catch (e) {
      console.log('initApp statement skipped:', e);
    }
  }
}

/**
 * Ensures a user exists in the database with the given username.
 * If the user does not exist, a new user is created.
 * @param monopolyd1 The D1 database instance.
 * @param username The username to ensure.
 * @returns A promise that resolves to the user object.
 */
export async function ensureUserByUsername(monopolyd1: D1Database, username: string) {
  await monopolyd1.prepare('INSERT OR IGNORE INTO users (username, gamer_id) VALUES (?, ?)')
    .bind(username, makeGamerId()).run();
  const row = await monopolyd1.prepare('SELECT id, username, gamer_id FROM users WHERE username=?').bind(username).first();
  return row as { id: number; username: string; gamer_id: string } | null;
}

/**
 * Finds a user by their email address.
 * @param monopolyd1 The D1 database instance.
 * @param email The email address to search for.
 * @returns A promise that resolves to the user object if found, otherwise null.
 */
export async function findUserByEmail(monopolyd1: D1Database, email: string) {
  const row = await monopolyd1.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
  return row as any;
}

/**
 * Creates a new user with an email, username, and hashed password.
 * @param monopolyd1 The D1 database instance.
 * @param email The user's email address.
 * @param username The user's username.
 * @param password_hash The user's hashed password.
 * @returns A promise that resolves to the newly created user object.
 */
export async function createUserWithPassword(monopolyd1: D1Database, email: string, username: string, password_hash: string) {
  await monopolyd1.prepare('INSERT INTO users (email, username, password_hash, gamer_id) VALUES (?, ?, ?, ?)')
    .bind(email, username, password_hash, makeGamerId()).run();
  const row = await monopolyd1.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
  return row as any;
}

/**
 * Updates the online status of a user.
 * @param monopolyd1 The D1 database instance.
 * @param username The username of the user to update.
 * @param online `true` if the user is online, `false` otherwise.
 * @returns A promise that resolves when the update is complete.
 */
export async function updateUserOnline(monopolyd1: D1Database, username: string, online: boolean) {
  await monopolyd1.prepare('UPDATE users SET online=?, updated_at=datetime("now") WHERE username=?')
    .bind(online ? 1 : 0, username).run();
}

/**
 * Generates a unique, URL-safe gamer ID.
 * @returns A unique gamer ID string.
 */
function makeGamerId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * Generates a secure verification token.
 * @returns A URL-safe verification token string.
 */
export function generateVerificationToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * Saves a verification token for a user.
 * @param monopolyd1 The D1 database instance.
 * @param email The user's email address.
 * @param token The verification token.
 * @param expiresInHours How many hours until the token expires (default 24).
 */
export async function saveVerificationToken(monopolyd1: D1Database, email: string, token: string, expiresInHours: number = 24) {
  const expires = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();
  await monopolyd1.prepare(
    'UPDATE users SET verification_token=?, verification_expires=?, updated_at=datetime("now") WHERE email=?'
  ).bind(token, expires, email).run();
}

/**
 * Verifies a user's email using their verification token.
 * @param monopolyd1 The D1 database instance.
 * @param token The verification token.
 * @returns The user if verification succeeded, null otherwise.
 */
export async function verifyEmailToken(monopolyd1: D1Database, token: string): Promise<any> {
  const user = await monopolyd1.prepare(
    'SELECT * FROM users WHERE verification_token=? AND verification_expires > datetime("now")'
  ).bind(token).first();

  if (!user) return null;

  // Mark email as verified and clear token
  await monopolyd1.prepare(
    'UPDATE users SET email_verified=1, verification_token=NULL, verification_expires=NULL, updated_at=datetime("now") WHERE id=?'
  ).bind(user.id).run();

  return user;
}

/**
 * Checks if a user's email is verified.
 * @param monopolyd1 The D1 database instance.
 * @param email The user's email address.
 * @returns True if verified, false otherwise.
 */
export async function isEmailVerified(monopolyd1: D1Database, email: string): Promise<boolean> {
  const user = await monopolyd1.prepare('SELECT email_verified FROM users WHERE email=?').bind(email).first();
  return user?.email_verified === 1;
}
