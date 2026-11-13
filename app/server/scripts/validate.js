// Usage:
//   node server/scripts/validate.js                  -> validate every mock
//   node server/scripts/validate.js content/mock1/maths.json   -> validate one section file
import fs from 'node:fs';
import path from 'node:path';
import mocks from '../../config/mocks.config.js';
import { validateMock, validateSectionFile } from '../lib/bank.js';

const arg = process.argv[2];
let bad = 0;
if (arg) {
  const data = JSON.parse(fs.readFileSync(arg, 'utf8'));
  const r = validateSectionFile(data, data.section, path.basename(arg));
  r.errors.forEach((e) => console.log('ERROR  ', e));
  r.warnings.forEach((e) => console.log('WARN   ', e));
  console.log(r.errors.length ? `✗ ${r.errors.length} error(s)` : '✓ file valid', r.stats ? JSON.stringify(r.stats) : '');
  process.exit(r.errors.length ? 1 : 0);
}
for (const m of mocks) {
  const r = validateMock(m.id);
  r.errors.forEach((e) => console.log('ERROR  ', e));
  r.warnings.forEach((e) => console.log('WARN   ', e));
  console.log(`${r.errors.length ? '✗' : '✓'} ${m.id}  ${r.total} questions  difficulty ${JSON.stringify(r.diff)}`);
  bad += r.errors.length;
}
process.exit(bad ? 1 : 0);
