// Exam patterns. The built-in SSC CGL Tier-II pattern lives in config/exam.config.js. Other exams are stored in the
// database and edited from Admin > Exams, so adding an exam never needs a code change. Each mock follows one exam.
import examConfig from '../../config/exam.config.js';
import { setExtraSections } from './sections.js';

export const BUILTIN_ID = examConfig.exam.id;
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

/** Starter patterns the operator can copy and edit. Always check the latest official notice before using one. */
export const TEMPLATES = [
  { id: 'ssc-chsl-t1', name: 'SSC CHSL Tier-I', short: 'CHSL Tier-I', description: 'Computer-based test of 100 questions in 60 minutes with one overall timer.', timing: 'overall', minutes: 60,
    sections: [
      { key: 'reasoning', name: 'General Intelligence', short: 'Reasoning', questions: 25, marks: 2, negative: 0.5 },
      { key: 'ga', name: 'General Awareness', short: 'GA', questions: 25, marks: 2, negative: 0.5 },
      { key: 'maths', name: 'Quantitative Aptitude', short: 'Quant', questions: 25, marks: 2, negative: 0.5 },
      { key: 'english', name: 'English Language', short: 'English', questions: 25, marks: 2, negative: 0.5 }] },
  { id: 'bank-prelims', name: 'Bank PO / Clerk Prelims', short: 'Bank Prelims', description: 'Prelims-style paper: 100 questions in 60 minutes with 20 minutes for each section.', timing: 'sectional',
    sections: [
      { key: 'english', name: 'English Language', short: 'English', questions: 30, marks: 1, negative: 0.25, minutes: 20 },
      { key: 'maths', name: 'Quantitative Aptitude', short: 'Quant', questions: 35, marks: 1, negative: 0.25, minutes: 20 },
      { key: 'reasoning', name: 'Reasoning Ability', short: 'Reasoning', questions: 35, marks: 1, negative: 0.25, minutes: 20 }] },
];

export const UI_STYLES = ['default', 'ssc', 'bank', 'railway'];
export const defaultUi = { style: 'ssc', calculator: false };
const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
/** Check and clean an exam definition from the admin form. Returns { error } or { def }. */
export function cleanExam(b, id) {
  const name = String(b.name || '').trim().slice(0, 80); if (!name) return { error: 'Give the exam a name' };
  const timing = b.timing === 'overall' ? 'overall' : 'sectional';
  const raw = Array.isArray(b.sections) ? b.sections : []; if (!raw.length) return { error: 'Add at least one section' }; if (raw.length > 8) return { error: 'An exam can have at most 8 sections' };
  const seen = new Set(); const sections = [];
  for (const s of raw) {
    const key = slug(s.key || s.name).replace(/-/g, '_') ; const sname = String(s.name || '').trim().slice(0, 80);
    if (!key || !sname) return { error: 'Every section needs a name' };
    if (seen.has(key)) return { error: `Section "${sname}" is listed twice` }; seen.add(key);
    const questions = Math.round(num(s.questions, 1, 300, 0)); if (!questions) return { error: `Set the number of questions for ${sname}` };
    const marks = num(s.marks, 0.25, 20, 1); const negative = num(s.negative, 0, 20, 0);
    const o = { key, name: sname, short: String(s.short || sname).trim().slice(0, 16), questions, marks, negative };
    if (timing === 'sectional') { o.minutes = Math.round(num(s.minutes, 1, 300, 0)); if (!o.minutes) return { error: `Set the minutes for ${sname}` }; }
    if (s.qualifying) { o.qualifying = true; o.qualifyingMarks = num(s.qualifyingMarks, 0, 10000, 0); }
    sections.push(o);
  }
  if (sections.every((s) => s.qualifying)) return { error: 'At least one section must count towards the score' };
  const minutes = timing === 'overall' ? Math.round(num(b.minutes, 5, 600, 0)) : 0; if (timing === 'overall' && !minutes) return { error: 'Set the total minutes' };
  const ui = b.interface && typeof b.interface === 'object' ? b.interface : {}; if (ui.style !== undefined && !UI_STYLES.includes(ui.style)) return { error: 'Choose a valid interface style' };
  return { def: { id, name, short: String(b.short || name).trim().slice(0, 24), description: String(b.description || '').trim().slice(0, 300), timing, minutes, sections, interface: { style: ui.style || 'ssc', calculator: !!ui.calculator } } };
}

/** Same shape as config/exam.config.js, so grading, timers and results work unchanged. */
export function toPattern(def) {
  const sections = {}; for (const s of def.sections) sections[s.key] = { name: s.name, short: s.short, questions: s.questions, marksPerQuestion: s.marks, negativeMarks: s.negative, ...(s.qualifying ? { qualifying: true, qualifyingMarks: s.qualifyingMarks } : {}) };
  const segments = def.timing === 'overall' ? [{ id: 'all', sections: def.sections.map((s) => s.key), minutes: def.minutes }] : def.sections.map((s) => ({ id: s.key, sections: [s.key], minutes: s.minutes }));
  return { interface: def.interface || defaultUi, exam: { id: def.id, name: def.name, short: def.short, description: def.description, patternVersion: 'custom', instructionsVersion: 1 }, sections, segments, optionsPerQuestion: examConfig.optionsPerQuestion, difficulties: examConfig.difficulties, difficultyMix: examConfig.difficultyMix, statuses: examConfig.statuses, autosaveMs: examConfig.autosaveMs, lowTimeWarningSeconds: examConfig.lowTimeWarningSeconds };
}
const builtinDef = () => ({ id: BUILTIN_ID, name: examConfig.exam.name, short: 'CGL Tier-II', description: 'The built-in pattern. Edit config/exam.config.js to change it.', builtin: true, timing: 'sectional', minutes: 0, active: 1,
  sections: Object.entries(examConfig.sections).map(([key, c]) => ({ key, name: c.name, short: c.short, questions: c.questions, marks: c.marksPerQuestion, negative: c.negativeMarks, minutes: examConfig.segments.find((g) => g.sections.includes(key))?.minutes, ...(c.qualifying ? { qualifying: true, qualifyingMarks: c.qualifyingMarks } : {}) })) });

export function makeExams(db) {
  let cache = null;
  const load = () => {
    const rows = db.prepare('SELECT * FROM exams ORDER BY created_at').all().map((r) => ({ ...JSON.parse(r.data), id: r.id, active: r.active }));
    const list = [builtinDef(), ...rows]; const extra = {};
    for (const d of rows) for (const s of d.sections) if (!extra[s.key]) extra[s.key] = { name: s.name, short: s.short, questions: s.questions, marksPerQuestion: s.marks, negativeMarks: s.negative };
    setExtraSections(extra); cache = { list, patterns: new Map(list.map((d) => [d.id, d.builtin ? examConfig : toPattern(d)])) };
    return cache;
  };
  const c = () => cache || load();
  return {
    refresh: load, list: () => c().list, get: (id) => c().list.find((d) => d.id === id) || null,
    /** Pattern for a mock's exam. Unknown or removed exams fall back to the built-in one. */
    patternFor: (id) => c().patterns.get(id) || examConfig,
    put(def, active = 1) { const now = Date.now(); const { id, builtin, active: _a, ...rest } = def; db.prepare('INSERT INTO exams(id,name,short,data,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, short=excluded.short, data=excluded.data, active=excluded.active, updated_at=excluded.updated_at').run(id, def.name, def.short, JSON.stringify(rest), active, now, now); load(); },
    remove(id) { db.prepare('DELETE FROM exams WHERE id=?').run(id); load(); },
    newId: (name) => { let base = slug(name) || 'exam'; let id = base; let i = 2; while (id === BUILTIN_ID || c().list.some((d) => d.id === id)) id = `${base}-${i++}`; return id; },
  };
}
