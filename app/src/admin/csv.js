/** Tiny CSV reader (quotes, commas and line breaks inside quotes) and the question mapping used by bulk import. */
export function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false; const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((x) => x.trim())) rows.push(row); row = []; } else cell += c;
  }
  row.push(cell); if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}
export const TEMPLATE_HEAD = ['section', 'difficulty', 'topic', 'subtopic', 'tags', 'question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct', 'explanation', 'steps', 'shortcut', 'trap', 'revise', 'passage'];
export const TEMPLATE = [TEMPLATE_HEAD, ['maths', 'easy', 'Arithmetic', 'Multiplication', 'basic;speed', 'What is 12 × 12?', '124', '144', '154', '164', 'B', '12 × 12 = 144.', 'Write 12 × 10 = 120|Add 12 × 2 = 24|Total 144', '', '', 'Tables up to 20', '']];
export const toCsvText = (rows) => '﻿' + rows.map((r) => r.map((c) => (/[",\n\r]/.test(c) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(',')).join('\r\n');
export function rowsToQuestions(rows, sectionKeys) {
  const head = rows[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, '_')); const at = (r, ...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return (r[i] || '').trim(); } return ''; };
  return rows.slice(1).map((r) => {
    const secRaw = at(r, 'section').toLowerCase(); const section = sectionKeys.find((k) => k === secRaw) || sectionKeys.find((k) => k.startsWith(secRaw)) || secRaw;
    const c = at(r, 'correct', 'answer').toUpperCase(); const n = /^[A-D]$/.test(c) ? 'ABCD'.indexOf(c) : Number(c) - 1; const answer = Number.isInteger(n) ? n : -1;
    return { section, difficulty: at(r, 'difficulty').toLowerCase() || 'moderate', topic: at(r, 'topic'), subtopic: at(r, 'subtopic'), tags: at(r, 'tags').split(/[;|]/).map((x) => x.trim()).filter(Boolean), text: at(r, 'question', 'text'), options: ['option_a', 'option_b', 'option_c', 'option_d'].map((k) => at(r, k)), answer, explanation: at(r, 'explanation'), steps: at(r, 'steps').split('|').map((x) => x.trim()).filter(Boolean), shortcut: at(r, 'shortcut'), trap: at(r, 'trap'), revise: at(r, 'revise'), passage: at(r, 'passage') };
  });
}
