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
  try { db.exec('ALTER TABLE mocks ADD COLUMN doubt_chat INTEGER DEFAULT 1'); } catch { /* column already exists */ }
  // v7: referrals, announcements v2, notifications, batches, practice sets
  for (const sql of ['ALTER TABLE users ADD COLUMN ref_code TEXT', 'ALTER TABLE users ADD COLUMN referred_by INTEGER', 'ALTER TABLE users ADD COLUMN notify_prefs TEXT',
    'ALTER TABLE mocks ADD COLUMN ref_locked INTEGER DEFAULT 0', "ALTER TABLE attempts ADD COLUMN kind TEXT DEFAULT 'mock'",
    'ALTER TABLE announcements ADD COLUMN title TEXT', 'ALTER TABLE announcements ADD COLUMN link_url TEXT', 'ALTER TABLE announcements ADD COLUMN link_label TEXT',
    "ALTER TABLE announcements ADD COLUMN audience TEXT DEFAULT 'all'", 'ALTER TABLE announcements ADD COLUMN batch_id INTEGER', 'ALTER TABLE announcements ADD COLUMN starts_at INTEGER',
    'ALTER TABLE announcements ADD COLUMN ends_at INTEGER', 'ALTER TABLE announcements ADD COLUMN pinned INTEGER DEFAULT 0', 'ALTER TABLE announcements ADD COLUMN dismissible INTEGER DEFAULT 1',
    "ALTER TABLE announcements ADD COLUMN notify TEXT DEFAULT ''", 'ALTER TABLE announcements ADD COLUMN created_by TEXT', 'ALTER TABLE announcements ADD COLUMN updated_at INTEGER', 'ALTER TABLE announcements ADD COLUMN broadcast_at INTEGER']) { try { db.exec(sql); } catch { /* column already exists */ } }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_ref ON users(ref_code);
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS unlocks(user_id INTEGER, mock_id TEXT, reason TEXT, at INTEGER, PRIMARY KEY(user_id, mock_id));
    CREATE TABLE IF NOT EXISTS referrals(id INTEGER PRIMARY KEY, referrer_id INTEGER, friend_id INTEGER UNIQUE, status TEXT DEFAULT 'joined', created_at INTEGER, qualified_at INTEGER);
    CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
    CREATE TABLE IF NOT EXISTS announcement_state(announcement_id INTEGER, user_id INTEGER, seen_at INTEGER, dismissed_at INTEGER, clicked_at INTEGER, read_at INTEGER, PRIMARY KEY(announcement_id, user_id));
    CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY, user_id INTEGER, kind TEXT, title TEXT, body TEXT, link TEXT, created_at INTEGER, read_at INTEGER, ref TEXT);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_ref ON notifications(user_id, ref) WHERE ref IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at);
    CREATE TABLE IF NOT EXISTS deliveries(id INTEGER PRIMARY KEY, user_id INTEGER, channel TEXT, kind TEXT, ref TEXT, status TEXT, error TEXT, at INTEGER);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_deliv_ref ON deliveries(user_id, channel, ref) WHERE ref IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_deliv_at ON deliveries(at);
    CREATE INDEX IF NOT EXISTS idx_deliv_user ON deliveries(user_id, at);
    CREATE TABLE IF NOT EXISTS push_subs(endpoint TEXT PRIMARY KEY, user_id INTEGER, p256dh TEXT, auth TEXT, created_at INTEGER);
    CREATE INDEX IF NOT EXISTS idx_push_user ON push_subs(user_id);
    CREATE TABLE IF NOT EXISTS batches(id INTEGER PRIMARY KEY, name TEXT, code TEXT UNIQUE, created_at INTEGER, created_by TEXT, archived INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS batch_members(batch_id INTEGER, user_id INTEGER, joined_at INTEGER, PRIMARY KEY(batch_id, user_id));
    CREATE INDEX IF NOT EXISTS idx_bm_user ON batch_members(user_id);
    CREATE TABLE IF NOT EXISTS batch_teachers(batch_id INTEGER, user_id INTEGER, PRIMARY KEY(batch_id, user_id));
  `);
  db.exec('CREATE TABLE IF NOT EXISTS doubts(id INTEGER PRIMARY KEY, user_id INTEGER, attempt_id TEXT, question_id TEXT, intent TEXT, at INTEGER); CREATE INDEX IF NOT EXISTS idx_doubts_user ON doubts(user_id, at);');
  db.exec('UPDATE questions SET created_at=COALESCE(updated_at, 0) WHERE created_at IS NULL');
  return db;
}
