#!/usr/bin/env node
// Prints the question-bank progress table. `node scripts/status.mjs --write` also refreshes the table inside README.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { default: exam } = await import(pathToFileURL(path.join(ROOT, 'config/exam.config.js')).href);
const { default: mocks } = await import(pathToFileURL(path.join(ROOT, 'config/mocks.config.js')).href);
const { validateMock } = await import(pathToFileURL(path.join(ROOT, 'server/lib/bank.js')).href);
const keys = Object.keys(exam.sections);
const rows = [`| Mock | ${keys.map((k) => exam.sections[k].short).join(' | ')} | Status |`, `|---|${keys.map(() => '---').join('|')}|---|`];
for (const m of mocks) {
  const cells = keys.map((k) => { const f = path.join(ROOT, 'content', m.id, `${k}.json`); if (!fs.existsSync(f)) return 'missing'; const n = JSON.parse(fs.readFileSync(f, 'utf8')).questions.length; return `${n}/${exam.sections[k].questions}`; });
  rows.push(`| ${m.name} (${m.difficulty}) | ${cells.join(' | ')} | ${validateMock(m.id).errors.length ? 'in progress' : 'complete, live'} |`);
}
const table = rows.join('\n');
console.log(table);
if (process.argv.includes('--write')) {
  const f = path.join(ROOT, 'README.md'); let s = fs.readFileSync(f, 'utf8');
  const a = '<!-- STATUS:START -->', b = '<!-- STATUS:END -->';
  s = s.replace(new RegExp(`${a}[\\s\\S]*?${b}`), `${a}\n${table}\n${b}`); fs.writeFileSync(f, s); console.log('\nREADME.md updated');
}
