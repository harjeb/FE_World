import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// SQLite keeps the prototype self-contained (docs/07 specifies PostgreSQL; the schema below is plain
// SQL and the store is the only place that touches it, so swapping the driver is a contained change).
export function openDb(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, password_hash TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
  token TEXT PRIMARY KEY, account_id TEXT NOT NULL, kind TEXT NOT NULL, label TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, account_id TEXT NOT NULL, created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY, account_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL, legion TEXT NOT NULL,
  day INTEGER NOT NULL, gold INTEGER NOT NULL, bexp INTEGER NOT NULL,
  arena_points INTEGER NOT NULL DEFAULT 0, arena_medals INTEGER NOT NULL DEFAULT 0,
  registered INTEGER NOT NULL DEFAULT 0, protagonist TEXT NOT NULL, defense TEXT, flags TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS units (
  id TEXT NOT NULL, player_id TEXT NOT NULL, position INTEGER NOT NULL, data TEXT NOT NULL,
  PRIMARY KEY (player_id, id)
);
CREATE INDEX IF NOT EXISTS units_player ON units(player_id, position);
CREATE TABLE IF NOT EXISTS battles (
  id TEXT NOT NULL, player_id TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, id)
);
CREATE INDEX IF NOT EXISTS battles_player ON battles(player_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS arena_days (
  id TEXT PRIMARY KEY, player_id TEXT NOT NULL, day INTEGER NOT NULL, data TEXT NOT NULL, settled INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS arena_days_player ON arena_days(player_id, day DESC);
CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY, player_id TEXT NOT NULL, day INTEGER NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT NOT NULL, item TEXT NOT NULL, uses INTEGER NOT NULL, count INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS inventory_player ON inventory(player_id, item);
CREATE TABLE IF NOT EXISTS shop (
  player_id TEXT NOT NULL, item TEXT NOT NULL, stock INTEGER NOT NULL, PRIMARY KEY (player_id, item)
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL,
  data TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS events_player ON events(player_id, id);
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL,
  battle_id TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS due_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT, kind TEXT NOT NULL, due_at INTEGER NOT NULL,
  payload TEXT, done INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS due_tasks_pending ON due_tasks(done, due_at);
CREATE TABLE IF NOT EXISTS replays (
  id TEXT NOT NULL, player_id TEXT NOT NULL, data TEXT NOT NULL, public_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, id)
);
`;
