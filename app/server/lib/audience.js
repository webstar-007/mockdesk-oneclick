// Who an announcement (or reminder) is for. Returns a SQL condition on `users u` plus its parameters.
const DAY = 86400000;
export const AUDIENCES = [
  ['all', 'Every student'], ['new', 'New students (joined in the last 7 days)'], ['never', 'Students who have not started a mock'],
  ['inactive', 'Students who have not practised for 7 days'], ['batch', 'One batch'],
];
const base = "COALESCE(u.role,'student')='student' AND COALESCE(u.status,'active')='active'";
export function audienceWhere(audience, batchId, t) {
  switch (audience) {
    case 'new': return { sql: `${base} AND u.created_at > ?`, params: [new Date(t - 7 * DAY).toISOString()] };
    case 'never': return { sql: `${base} AND NOT EXISTS (SELECT 1 FROM attempts a WHERE a.user_id=u.id)`, params: [] };
    case 'inactive': return { sql: `${base} AND EXISTS (SELECT 1 FROM attempts a WHERE a.user_id=u.id) AND NOT EXISTS (SELECT 1 FROM attempts a WHERE a.user_id=u.id AND a.started_at>?)`, params: [t - 7 * DAY] };
    case 'batch': return { sql: `${base} AND EXISTS (SELECT 1 FROM batch_members bm WHERE bm.user_id=u.id AND bm.batch_id=?)`, params: [Number(batchId) || 0] };
    default: return { sql: base, params: [] };
  }
}
export const audienceCount = (db, aud, batchId, t) => { const w = audienceWhere(aud, batchId, t); return db.prepare(`SELECT COUNT(*) c FROM users u WHERE ${w.sql}`).get(...w.params).c; };
export const inAudience = (db, userId, aud, batchId, t) => { const w = audienceWhere(aud, batchId, t); return !!db.prepare(`SELECT 1 FROM users u WHERE u.id=? AND ${w.sql}`).get(userId, ...w.params); };
export const audienceIds = (db, aud, batchId, t, limit = 100000) => { const w = audienceWhere(aud, batchId, t); return db.prepare(`SELECT u.id FROM users u WHERE ${w.sql} LIMIT ${limit}`).all(...w.params).map((x) => x.id); };
