-- Lobby/UI schema for monopolyui (rooms, members)
CREATE TABLE IF NOT EXISTS lobby_rooms (
  id TEXT PRIMARY KEY,
  owner_user TEXT,
  status TEXT DEFAULT 'open',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lobby_members (
  room_id TEXT,
  user TEXT,
  joined_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (room_id, user)
);
