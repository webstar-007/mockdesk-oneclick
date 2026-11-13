// Loads and validates question banks from /content. Shared by the server
// (at start-up) and by `npm run validate`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import examConfig from '../../config/exam.config.js';
import mocks from '../../config/mocks.config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const CONTENT_DIR = path.join(ROOT, 'content');

const TOL = 0.0051;

function numsIn(str) {
  const out = [];
  const re = /(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)|-?\d+(?:\.\d+)?/g;
  let m;
  while ((m = re.exec(String(str).replace(/,/g, '')))) {
    out.push(m[2] ? parseFloat(m[1]) / parseFloat(m[2]) : parseFloat(m[0]));
  }
  return out;
}

/** Validate one section file. Returns {errors:[], warnings:[]} */
/** Figures are inline SVG written by us, but are still checked so a bank file can never smuggle script into a page. */
const SVG_TAGS = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'title', 'desc']);
export function svgProblem(svg) {
  if (typeof svg !== 'string' || !svg.trim().startsWith('<svg') || !svg.trim().endsWith('</svg>')) return 'must be a string starting with <svg and ending with </svg>';
  if (svg.length > 24000) return 'is larger than 24 KB';
  if (/\son\w+\s*=/i.test(svg) || /<\s*script/i.test(svg) || /javascript:/i.test(svg) || /href\s*=/i.test(svg) || /<!/.test(svg) || /\bstyle\s*=/i.test(svg) || /url\(\s*(?!#)/i.test(svg)) return 'contains a disallowed construct (script, event handler, link, style or external url)';
  for (const m of svg.matchAll(/<\/?\s*([a-zA-Z][\w:-]*)/g)) if (!SVG_TAGS.has(m[1].toLowerCase())) return `uses a disallowed tag <${m[1]}>`;
  if (!/viewBox\s*=/.test(svg)) return 'needs a viewBox';
  return null;
}

const IMG_RE = /^\/uploads\/[\w.-]+\.(png|jpe?g|webp|gif)$/i;
/** opts.lenient: admin-authored banks only need the essentials (text, options, answer, explanation).
 *  opts.partial: a section may hold fewer questions than the full paper. */
export function validateSectionFile(data, sectionKey, file = '', opts = {}) {
  const { lenient = false, partial = false } = opts;
  const errors = [];
  const warnings = [];
  const sec = examConfig.sections[sectionKey];
  const tag = (i) => `${file || sectionKey}#${i + 1}`;
  if (!sec) { errors.push(`${file}: unknown section "${sectionKey}"`); return { errors, warnings }; }
  if (data.section !== sectionKey) errors.push(`${file}: "section" must be "${sectionKey}"`);
  const qs = data.questions || [];
  if (partial) { if (qs.length > sec.questions) errors.push(`${file}: at most ${sec.questions} questions allowed, found ${qs.length}`); else if (qs.length < sec.questions) warnings.push(`${file}: ${qs.length} of ${sec.questions} standard questions (partial section, timer is scaled)`); }
  else if (qs.length !== sec.questions) errors.push(`${file}: expected ${sec.questions} questions, found ${qs.length}`);
  const passages = data.passages || {};
  const seen = new Set();
  let unverified = 0;
  const answerDist = [0, 0, 0, 0];
  const diffCount = { easy: 0, moderate: 0, hard: 0 };

  qs.forEach((q, i) => {
    const t = tag(i);
    const need = lenient ? ['topic', 'difficulty', 'text', 'options', 'answer', 'explanation'] : ['topic', 'subtopic', 'difficulty', 'text', 'options', 'answer', 'explanation', 'trap', 'revise', 'wrongReasons'];
    for (const k of need) if (q[k] === undefined || q[k] === null || q[k] === '') errors.push(`${t}: missing "${k}"`);
    if (!Array.isArray(q.options) || q.options.length !== examConfig.optionsPerQuestion) { errors.push(`${t}: need exactly ${examConfig.optionsPerQuestion} options`); return; }
    if (new Set(q.options.map((o, j) => String(o).trim().toLowerCase() + '|' + (q.optionImages?.[j] || ''))).size !== q.options.length) errors.push(`${t}: duplicate options`);
    if (q.options.some((o, j) => !String(o).trim() && !q.optionImages?.[j])) errors.push(`${t}: every option needs text or an image`);
    for (const [k, v] of [['image', q.image], ['solutionImage', q.solutionImage], ...(q.optionImages || []).map((x, j) => [`optionImages[${j}]`, x])]) if (v && !IMG_RE.test(v)) errors.push(`${t}: ${k} is not a valid uploaded image`);
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) { errors.push(`${t}: "answer" must be index 0-3`); return; }
    answerDist[q.answer]++;
    if (!examConfig.difficulties.includes(q.difficulty)) errors.push(`${t}: bad difficulty "${q.difficulty}"`); else diffCount[q.difficulty]++;
    if (lenient) { /* wrong-option reasons are optional for admin-authored questions */ }
    else if (!Array.isArray(q.wrongReasons) || q.wrongReasons.length !== q.options.length) errors.push(`${t}: wrongReasons must have one entry per option (null for the correct one)`);
    else {
      q.wrongReasons.forEach((w, j) => {
        if (j === q.answer && w) errors.push(`${t}: wrongReasons[${j}] must be null for the correct option`);
        if (j !== q.answer && !w) errors.push(`${t}: wrongReasons[${j}] missing`);
      });
    }
    const key = String(q.text).trim().toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key + (q.passageId || ''))) errors.push(`${t}: duplicate question text`);
    seen.add(key + (q.passageId || ''));
    if (q.passageId && !passages[q.passageId]) errors.push(`${t}: passageId "${q.passageId}" not in passages`);
    if (q.figure != null) { const e = svgProblem(q.figure); if (e) errors.push(`${t}: figure ${e}`); }
    if (q.optionFigures != null) {
      if (!Array.isArray(q.optionFigures) || q.optionFigures.length !== 4) errors.push(`${t}: optionFigures must have exactly 4 entries`);
      else q.optionFigures.forEach((f, j) => { const e = svgProblem(f); if (e) errors.push(`${t}: optionFigures[${j}] ${e}`); });
      if (new Set(q.optionFigures || []).size !== (q.optionFigures || []).length) errors.push(`${t}: two option figures are identical`);
    }
    if ((sectionKey === 'maths' || sectionKey === 'reasoning') && (!Array.isArray(q.steps) || q.steps.length < 1)) (lenient ? warnings : errors).push(`${t}: steps[] ${lenient ? 'recommended' : 'required'} for ${sectionKey}`);
    if (q.steps && !Array.isArray(q.steps)) errors.push(`${t}: steps must be an array of strings`);

    // Numeric verification: `check` is a JS expression that independently computes the answer
    if (q.check !== undefined) {
      try {
        const r = new Function('Math', `"use strict"; return (${q.check});`)(Math);
        if (typeof q.value !== 'number') errors.push(`${t}: "value" (number) required with "check"`);
        else if (!(Math.abs(r - q.value) <= TOL + 1e-9 * Math.abs(q.value))) errors.push(`${t}: check evaluates to ${r} but value is ${q.value}`);
        else {
          const hits = q.options.map((o) => numsIn(o).some((n) => Math.abs(n - q.value) <= TOL));
          if (!hits[q.answer]) errors.push(`${t}: correct option "${q.options[q.answer]}" does not contain value ${q.value}`);
          const others = hits.filter((h, j) => h && j !== q.answer).length;
          if (others) errors.push(`${t}: value ${q.value} also appears in a wrong option (ambiguous)`);
        }
      } catch (e) { errors.push(`${t}: check expression failed: ${e.message}`); }
    } else if (sectionKey === 'maths') unverified++;
  });

  if (unverified > Math.ceil(qs.length * 0.2)) warnings.push(`${file}: ${unverified} maths questions have no numeric "check" (limit ~20%)`);
  if (qs.length >= 20 && Math.max(...answerDist) > qs.length * 0.4) warnings.push(`${file}: answer positions skewed ${answerDist.join('/')}`);
  return { errors, warnings, stats: { diffCount, answerDist, unverified } };
}

/** Load a mock from content/<id>/*.json. Returns {sections:{key:data}} */
export function loadMockRaw(mockId) {
  const dir = path.join(CONTENT_DIR, mockId);
  const out = {};
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    out[data.section] = data;
  }
  return out;
}

/** Build the flat, ordered question list for a mock (ids assigned here). */
export function buildMock(mockId) {
  const raw = loadMockRaw(mockId);
  const questions = [];
  for (const sectionKey of Object.keys(examConfig.sections)) {
    const data = raw[sectionKey];
    if (!data) continue;
    const sec = examConfig.sections[sectionKey];
    data.questions.forEach((q, i) => {
      const { passageId, ...rest } = q;
      questions.push({
        ...rest,
        id: `${mockId}-${sectionKey}-${String(i + 1).padStart(2, '0')}`,
        section: sectionKey,
        index: i,
        marks: q.marks ?? sec.marksPerQuestion,
        negativeMarks: q.negativeMarks ?? sec.negativeMarks,
        passage: passageId ? data.passages[passageId] : null,
        passageId: passageId || null,
      });
    });
  }
  return questions;
}

/** Validate a mock held in the database. questions: [{section, ...fields}] in order. */
export function validateDbMock(meta, questions) {
  const errors = [], warnings = [], diff = { easy: 0, moderate: 0, hard: 0 }; let total = 0;
  const lenient = meta.source !== 'file', partial = lenient;
  for (const key of Object.keys(examConfig.sections)) {
    const qs = questions.filter((q) => q.section === key);
    if (!qs.length) { if (!lenient) errors.push(`${meta.id}: missing ${key} questions`); continue; }
    const passages = {}; for (const q of qs) if (q.passageId && q.passage) passages[q.passageId] = q.passage;
    const r = validateSectionFile({ section: key, questions: qs, passages }, key, `${meta.name} · ${examConfig.sections[key].short}`, { lenient, partial });
    errors.push(...r.errors); warnings.push(...r.warnings);
    if (r.stats) for (const d in r.stats.diffCount) { diff[d] += r.stats.diffCount[d]; total += r.stats.diffCount[d]; }
  }
  if (!questions.length) errors.push('The mock has no questions yet');
  const seen = new Map();
  for (const q of questions) { const k = q.text.trim().toLowerCase().replace(/\s+/g, ' ') + '|' + (q.passageId || ''); if (seen.has(k)) errors.push(`Duplicate question text: ${seen.get(k)} and ${q.id}`); seen.set(k, q.id); }
  return { errors, warnings, diff, total };
}

export function validateMock(mockId) {
  const meta = mocks.find((m) => m.id === mockId);
  const raw = loadMockRaw(mockId);
  const errors = [];
  const warnings = [];
  const diff = { easy: 0, moderate: 0, hard: 0 };
  let total = 0;
  for (const key of Object.keys(examConfig.sections)) {
    if (!raw[key]) { errors.push(`${mockId}: missing ${key}.json`); continue; }
    const r = validateSectionFile(raw[key], key, `${mockId}/${key}.json`);
    errors.push(...r.errors); warnings.push(...r.warnings);
    if (r.stats) for (const d in r.stats.diffCount) { diff[d] += r.stats.diffCount[d]; total += r.stats.diffCount[d]; }
  }
  if (meta && total) {
    const want = examConfig.difficultyMix[meta.difficulty];
    for (const d of examConfig.difficulties) {
      const got = diff[d] / total;
      if (Math.abs(got - want[d]) > 0.12) warnings.push(`${mockId}: ${d} share ${(got * 100).toFixed(0)}% vs target ${(want[d] * 100).toFixed(0)}%`);
    }
  }
  // cross-section duplicate check
  const seen = new Map();
  for (const q of buildMock(mockId)) {
    const k = q.text.trim().toLowerCase().replace(/\s+/g, ' ') + '|' + (q.passageId || '');
    if (seen.has(k)) errors.push(`${mockId}: duplicate text between ${seen.get(k)} and ${q.id}`);
    seen.set(k, q.id);
  }
  return { errors, warnings, diff, total };
}
