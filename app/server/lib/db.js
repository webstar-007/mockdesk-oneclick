import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export function openDb(file = process.env.MOCKDESK_DB || path.join(ROOT, 'data', 'mockdesk.db')) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT, email TEXT UNIQUE, salt TEXT, hash TEXT, target_score INTEGER, exam_date TEXT, created_at TEXT);
    CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, user_id INTEGER, expires_at INTEGER);
    CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY, user_id INTEGER, mock_id TEXT, status TEXT, segment_index INTEGER, segment_started_at INTEGER,
      started_at INTEGER, submitted_at INTEGER, auto_submitted INTEGER DEFAULT 0, responses TEXT DEFAULT '{}', last_qid TEXT, result TEXT);
    CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id);
  `);
  try { db.exec('ALTER TABLE users ADD COLUMN phone TEXT'); } catch { /* column already exists */ }
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL;
    CREATE TABLE IF NOT EXISTS otps(key TEXT PRIMARY KEY, salt TEXT, code_hash TEXT, expires_at INTEGER, wrong INTEGER DEFAULT 0, sent_at INTEGER, window_start INTEGER, sent_count INTEGER DEFAULT 0);`);
  for (const sql of ["ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'student'", "ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'", 'ALTER TABLE users ADD COLUMN last_seen INTEGER', 'ALTER TABLE attempts ADD COLUMN snapshot TEXT', 'ALTER TABLE users ADD COLUMN admin_note TEXT']) { try { db.exec(sql); } catch { /* column already exists */ } }
  db.exec(`
    CREATE TABLE IF NOT EXISTS mocks(id TEXT PRIMARY KEY, number INTEGER, name TEXT, difficulty TEXT, description TEXT DEFAULT '', status TEXT DEFAULT 'draft', tags TEXT DEFAULT '[]', source TEXT DEFAULT 'admin', available_from INTEGER, created_at INTEGER, updated_at INTEGER);
    CREATE TABLE IF NOT EXISTS questions(id TEXT PRIMARY KEY, mock_id TEXT, section TEXT, position INTEGER, data TEXT, updated_at INTEGER);
    CREATE INDEX IF NOT EXISTS idx_questions_mock ON questions(mock_id);
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, at INTEGER, admin_id INTEGER, admin_name TEXT, action TEXT, target TEXT, detail TEXT);
    CREATE TABLE IF NOT EXISTS reports(id INTEGER PRIMARY KEY, question_id TEXT, mock_id TEXT, user_id INTEGER, reason TEXT, note TEXT, status TEXT DEFAULT 'open', created_at INTEGER, resolved_at INTEGER, admin_note TEXT);
    CREATE TABLE IF NOT EXISTS announcements(id INTEGER PRIMARY KEY, text TEXT, level TEXT DEFAULT 'info', active INTEGER DEFAULT 1, created_at INTEGER);
  `);
  for (const sql of ['ALTER TABLE questions ADD COLUMN created_at INTEGER', 'ALTER TABLE questions ADD COLUMN created_by TEXT']) { try { db.exec(sql); } catch { /* column already exists */ } }
  for (const sql of ["ALTER TABLE attempts ADD COLUMN integrity TEXT DEFAULT '{}'", 'ALTER TABLE attempts ADD COLUMN ip TEXT', 'ALTER TABLE users ADD COLUMN last_ip TEXT']) { try { db.exec(sql); } catch { /* column already exists */ } }
  db.exec('UPDATE questions SET created_at=COALESCE(updated_at, 0) WHERE created_at IS NULL');
  return db;
}
