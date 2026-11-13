// Mocks and questions live in the database so they can be edited from the admin dashboard.
// The 5 built-in mocks (content/*.json + config/mocks.config.js) are imported once, on first start.
import crypto from 'node:crypto';
import examConfig from '../../config/exam.config.js';
import mocksConfig from '../../config/mocks.config.js';
import { buildMock, loadMockRaw } from './bank.js';

const ORDER = Object.keys(examConfig.sections);
/** Fields an admin may set on a question. Anything else is dropped (notably `check`, which is evaluated as code). */
export const Q_FIELDS = ['topic', 'subtopic', 'difficulty', 'text', 'options', 'answer', 'explanation', 'steps', 'shortcut', 'trap', 'revise', 'wrongReasons', 'approach', 'passageId', 'passage', 'table', 'figure', 'optionFigures', 'image', 'optionImages', 'solutionImage', 'tags', 'currentAffairs', 'marks', 'negativeMarks'];
export const newId = (p = 'q') => `${p}_${crypto.randomBytes(5).toString('hex')}`;

export function seedFromFiles(db, { force = false, only } = {}) {
  const t = Date.now();
  const insM = db.prepare('INSERT OR REPLACE INTO mocks(id,number,name,difficulty,description,status,tags,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)');
  const insQ = db.prepare('INSERT OR REPLACE INTO questions(id,mock_id,section,position,data,updated_at,created_at) VALUES (?,?,?,?,?,?,?)');
  for (const meta of mocksConfig) {
    if (only && only !== meta.id) continue;
    const have = db.prepare('SELECT 1 FROM mocks WHERE id=?').get(meta.id);
    if (have && !force) continue;
    if (!Object.keys(loadMockRaw(meta.id)).length) continue;
    const prev = have ? db.prepare('SELECT status, tags, created_at FROM mocks WHERE id=?').get(meta.id) : null;
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM questions WHERE mock_id=?').run(meta.id);
      insM.run(meta.id, meta.number, meta.name, meta.difficulty, meta.description, prev?.status || 'published', prev?.tags || JSON.stringify([meta.difficulty]), 'file', prev?.created_at || t, t);
      for (const q of buildMock(meta.id)) {
        const { id, section, index, ...data } = q;
        if (data.marks === examConfig.sections[section].marksPerQuestion) delete data.marks;
        if (data.negativeMarks === examConfig.sections[section].negativeMarks) delete data.negativeMarks;
        insQ.run(id, meta.id, section, index, JSON.stringify(data), t, t);
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
}

/** Question rows -> runtime question objects (same shape the exam engine always used). */
export function loadQuestions(db, mockId) {
  const rows = db.prepare('SELECT id, section, position, data FROM questions WHERE mock_id=?').all(mockId);
  rows.sort((a, b) => ORDER.indexOf(a.section) - ORDER.indexOf(b.section) || a.position - b.position);
  const per = {};
  return rows.map((r) => {
    const d = JSON.parse(r.data); const sec = examConfig.sections[r.section];
    const index = (per[r.section] = (per[r.section] ?? -1) + 1);
    return {
      subtopic: '', trap: '', revise: '', shortcut: '', approach: '', steps: [], tags: [], ...d,
      wrongReasons: Array.isArray(d.wrongReasons) && d.wrongReasons.length === (d.options || []).length ? d.wrongReasons : (d.options || []).map(() => null),
      id: r.id, section: r.section, index, marks: d.marks ?? sec?.marksPerQuestion ?? 3, negativeMarks: d.negativeMarks ?? sec?.negativeMarks ?? 1,
      passage: d.passage || null, passageId: d.passageId || null,
    };
  });
}

export const mockRow = (db, id) => db.prepare('SELECT * FROM mocks WHERE id=?').get(id);
export const parseMock = (r) => r && ({ ...r, tags: JSON.parse(r.tags || '[]') });

/** Cut-off for qualifying sections scales with the number of questions present in partial (admin) mocks. */
export function sectionsFor(questions, source) {
  const out = {};
  for (const [k, c] of Object.entries(examConfig.sections)) {
    out[k] = { ...c };
    if (c.qualifying && source !== 'file') { const n = questions.filter((q) => q.section === k).length; if (n && n < c.questions) out[k].qualifyingMarks = Math.ceil((c.qualifyingMarks * n) / c.questions); }
  }
  return out;
}
/** Timed segments for the sections a mock actually has. Admin mocks with fewer questions get proportionally shorter timers. */
export function segmentsFor(questions, source) {
  const have = new Set(questions.map((q) => q.section));
  return examConfig.segments.map((s) => {
    const secs = s.sections.filter((x) => have.has(x));
    if (!secs.length) return null;
    let minutes = s.minutes;
    if (source !== 'file') {
      const full = s.sections.reduce((a, x) => a + examConfig.sections[x].questions, 0);
      const got = secs.reduce((a, x) => a + questions.filter((q) => q.section === x).length, 0);
      minutes = Math.max(1, Math.ceil((s.minutes * got) / full));
    }
    return { ...s, sections: secs, minutes };
  }).filter(Boolean);
}
