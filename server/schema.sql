-- Arcainad - Esquema do banco (SQLite)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS servers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  server_name TEXT NOT NULL,
  password_hash TEXT, -- NULL = sem senha
  save_data TEXT,     -- JSON com estado do mundo (posições, inventários, notas, etc.)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Permissões/membros: dono tem acesso implícito; outros podem ter permissão concedida
CREATE TABLE IF NOT EXISTS server_members (
  server_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'member', -- owner | member
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (server_id, user_id),
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_servers_owner ON servers(owner_id);
CREATE INDEX IF NOT EXISTS idx_members_user ON server_members(user_id);
