-- App/Log schema for third D1 binding `DB` (database_name: monopoly_db)
-- Focus: append-only event log, periodic snapshots, and optional betting/payouts.

PRAGMA foreign_keys = ON;

-- Event log of all authoritative game events for analytics/replay/debugging.
CREATE TABLE IF NOT EXISTS game_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  -- Uniqueness per game to ensure strict ordering
  UNIQUE (game_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_game_events_game ON game_events (game_id);
CREATE INDEX IF NOT EXISTS idx_game_events_created ON game_events (created_at);

-- Periodic snapshots of game state (for fast resume and auditing).
CREATE TABLE IF NOT EXISTS game_snapshots (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  turn INTEGER NOT NULL,
  state_json TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (game_id, turn)
);
CREATE INDEX IF NOT EXISTS idx_game_snapshots_game ON game_snapshots (game_id);
CREATE INDEX IF NOT EXISTS idx_game_snapshots_created ON game_snapshots (created_at);

-- Optional virtual credits wagering (planned feature; safe defaults).
CREATE TABLE IF NOT EXISTS bets (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  status TEXT NOT NULL DEFAULT 'pending', -- pending|accepted|rejected|settled|void
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bets_game ON bets (game_id);
CREATE INDEX IF NOT EXISTS idx_bets_user ON bets (user_id);

-- Payout records for auditability and dispute handling.
CREATE TABLE IF NOT EXISTS payouts (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  reason TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payouts_game ON payouts (game_id);
CREATE INDEX IF NOT EXISTS idx_payouts_user ON payouts (user_id);

