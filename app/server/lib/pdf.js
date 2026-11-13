// Builds the downloadable PDF report for a finished mock (summary, analysis, solutions).
// Text is real (selectable) and diagrams are vector. Fonts are bundled in server/assets/fonts.
import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';
import path from 'node:path';
import fs from 'node:fs';
import { UPLOAD_DIR } from '../admin.js';
import { fileURLToPath } from 'node:url';
import { analyse } from '../../src/lib/analysis.js';

const FONTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets/fonts');
const C = { brand: '#2547b8', ink: '#111827', mut: '#5b6577', line: '#d9deea', soft: '#eef2ff', good: '#157347', goodBg: '#e3f5ea', bad: '#b42318', badBg: '#fde8e6', warn: '#a15c07', warnBg: '#fff3dc', grey: '#f3f5fa' };
const M = 40; // page margin
const fmtTime = (s) => { s = Math.round(s || 0); const m = Math.floor(s / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : m ? `${m}m ${s % 60}s` : `${s}s`; };
const fmtDate = (iso) => { try { return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }); } catch { return ''; } };
const L = ['A', 'B', 'C', 'D'];
const clean = (t) => String(t ?? '').replace(/ /g, ' ');

export function buildReportPdf({ user, result, config, compare, community, scope = 'mistakes' }) {
  const doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true, info: { Title: `${result.attempt.mockName} - result and analysis`, Author: 'MockDesk' } });
  doc.registerFont('R', path.join(FONTS, 'DejaVuSans.ttf')); doc.registerFont('B', path.join(FONTS, 'DejaVuSans-Bold.ttf')); doc.registerFont('I', path.join(FONTS, 'DejaVuSans-Oblique.ttf'));
  const W = doc.page.width - M * 2; const bottom = () => doc.page.height - M - 14;
  const d = result; const s = d.summary; const a = analyse(d, config);
  const need = (h) => { if (doc.y + h > bottom()) doc.addPage(); };
  const gap = (n = 10) => { doc.y += n; };
  const text = (t, o = {}) => { doc.font(o.font || 'R').fontSize(o.size || 9.5).fillColor(o.color || C.ink).text(clean(t), o.x ?? M, o.y ?? doc.y, { width: o.width ?? W, lineGap: o.lineGap ?? 2, align: o.align, continued: false }); };
  const h2 = (t) => { need(60); gap(8); doc.rect(M, doc.y + 1, 4, 15).fill(C.brand); text(t, { font: 'B', size: 13, x: M + 12, width: W - 12 }); gap(6); };
  const box = (x, y, w, h, fill, stroke) => { doc.roundedRect(x, y, w, h, 6).fillAndStroke(fill, stroke || fill); };

  // ---------- header band ----------
  doc.rect(0, 0, doc.page.width, 92).fill(C.brand);
  doc.font('B').fontSize(11).fillColor('#cfe0ff').text('MOCKDESK', M, 22);
  doc.font('B').fontSize(20).fillColor('#ffffff').text(d.attempt.mockName, M, 38, { width: W });
  doc.font('R').fontSize(9.5).fillColor('#dbe6ff').text(`${user.name} · ${fmtDate(d.attempt.submittedAt)} · Result and analysis`, M, 66, { width: W });
  doc.y = 108;

  // ---------- score hero ----------
  const heroY = doc.y; box(M, heroY, W, 74, C.soft, C.soft);
  doc.font('B').fontSize(30).fillColor(C.brand).text(`${s.score}`, M + 16, heroY + 14, { continued: true }).font('R').fontSize(14).fillColor(C.mut).text(` / ${s.maxMarks}`);
  doc.font('R').fontSize(9.5).fillColor(C.mut).text(`${s.percentage}% of marks · ${s.accuracy}% accuracy`, M + 16, heroY + 52);
  const chips = []; if (s.qualified !== null) chips.push([s.qualified ? 'Computer: qualified' : 'Computer: not qualified', s.qualified ? C.good : C.bad, s.qualified ? C.goodBg : C.badBg]);
  if (community?.unlocked) chips.push([`Rank ${community.rank} of ${community.users} · ${community.percentile} percentile`, C.brand, '#ffffff']);
  if (d.attempt.autoSubmitted) chips.push(['Auto-submitted at timer end', C.warn, C.warnBg]);
  let cy = heroY + 14; for (const [t, fg, bg] of chips) { const w = doc.font('B').fontSize(9).widthOfString(t) + 18; box(M + W - w - 14, cy, w, 20, bg, fg); doc.font('B').fontSize(9).fillColor(fg).text(t, M + W - w - 14, cy + 5.5, { width: w, align: 'center' }); cy += 26; }
  doc.y = heroY + 86;

  // ---------- six numbers ----------
  const nums = [['Correct', s.correct, C.good], ['Wrong', s.incorrect, C.bad], ['Skipped', s.unattempted, C.mut], ['Accuracy', `${s.accuracy}%`, C.brand], ['Time taken', fmtTime(s.timeTakenSec), C.ink], ['Avg per question', `${Math.round(s.avgTimePerQuestionSec)}s`, C.ink]];
  const bw = (W - 5 * 8) / 6, ny = doc.y; nums.forEach(([k, v, col], i) => { const x = M + i * (bw + 8); box(x, ny, bw, 46, '#ffffff', C.line); doc.font('B').fontSize(15).fillColor(col).text(String(v), x, ny + 8, { width: bw, align: 'center' }); doc.font('R').fontSize(7.5).fillColor(C.mut).text(k, x, ny + 30, { width: bw, align: 'center' }); });
  doc.y = ny + 58;

  // ---------- marks breakdown ----------
  h2('Where your marks went');
  const rowsB = [['Marks earned', `+${a.scored.filter((q) => q.status === 'correct').reduce((x, q) => x + q.marks, 0)}`, C.good], ['Lost to negative marking', `−${a.penalty}`, C.bad], ['Marks on skipped questions', `${a.skippedMarks}`, C.mut], ['Net score', `${a.net}`, C.brand]];
  const bw2 = (W - 3 * 8) / 4, by = doc.y; rowsB.forEach(([k, v, col], i) => { const x = M + i * (bw2 + 8); box(x, by, bw2, 44, C.grey, C.grey); doc.font('B').fontSize(14).fillColor(col).text(v, x + 10, by + 7); doc.font('R').fontSize(8).fillColor(C.mut).text(k, x + 10, by + 28, { width: bw2 - 14 }); });
  doc.y = by + 52;
  text(`Without negative marking (${a.wrong.length} wrong answers) your net score would have been ${a.net + a.penalty}.`, { color: C.mut, size: 8.5 });

  // ---------- table helper ----------
  const table = (cols, rows, opts = {}) => {
    const widths = cols.map((c) => c.w * W); const rh = opts.rh || 20;
    const head = () => { need(rh * 2); const y = doc.y; doc.rect(M, y, W, rh).fill(C.soft); let x = M; cols.forEach((c, i) => { doc.font('B').fontSize(8).fillColor(C.brand).text(c.h, x + 6, y + 6, { width: widths[i] - 12, align: c.a || 'left' }); x += widths[i]; }); doc.y = y + rh; };
    head();
    rows.forEach((r, ri) => {
      if (doc.y + rh > bottom()) { doc.addPage(); head(); }
      const y = doc.y; if (ri % 2) doc.rect(M, y, W, rh).fill('#fafbfe');
      let x = M; r.forEach((cell, i) => { const col = typeof cell === 'object' && cell ? cell.c : C.ink; const v = typeof cell === 'object' && cell ? cell.v : cell; doc.font(i === 0 || (cell && cell.b) ? 'B' : 'R').fontSize(8.5).fillColor(col || C.ink).text(clean(v), x + 6, y + 6, { width: widths[i] - 12, align: cols[i].a || 'left', lineBreak: false, ellipsis: true }); x += widths[i]; });
      doc.moveTo(M, y + rh).lineTo(M + W, y + rh).lineWidth(0.5).strokeColor(C.line).stroke(); doc.y = y + rh;
    });
  };

  // ---------- sections ----------
  h2('Section-wise performance');
  table([{ h: 'Section', w: 0.25 }, { h: 'Correct', w: 0.1, a: 'right' }, { h: 'Wrong', w: 0.1, a: 'right' }, { h: 'Skipped', w: 0.1, a: 'right' }, { h: 'Marks', w: 0.15, a: 'right' }, { h: 'Accuracy', w: 0.12, a: 'right' }, { h: 'Time used', w: 0.18, a: 'right' }],
    d.sections.map((x) => { const p = a.pace.find((q) => q.key === x.key); return [x.short, x.correct, { v: x.incorrect, c: x.incorrect ? C.bad : C.ink }, x.unattempted, { v: `${x.score}/${x.maxMarks}`, b: true }, `${x.accuracy}%`, `${fmtTime(x.timeSec)}${p?.allowed ? ' / ' + fmtTime(p.allowed) : ''}`]; }));
  for (const q of d.qualifying || []) { gap(6); text(`${q.short} (qualifying only): ${q.score}/${q.maxMarks}, needs ${q.qualifyingMarks}. ${q.qualified ? 'Qualified.' : 'Not qualified.'} Not added to the total.`, { font: 'B', size: 9, color: q.qualified ? C.good : C.bad }); }

  // ---------- difficulty ----------
  h2('Accuracy by difficulty');
  table([{ h: 'Difficulty', w: 0.3 }, { h: 'Questions', w: 0.2, a: 'right' }, { h: 'Correct', w: 0.2, a: 'right' }, { h: 'Wrong', w: 0.15, a: 'right' }, { h: 'Skipped', w: 0.15, a: 'right' }],
    a.diff.map((x) => [x.key[0].toUpperCase() + x.key.slice(1), x.total, x.correct, x.wrong, x.total - x.correct - x.wrong]));

  // ---------- previous attempt ----------
  const pv = compare?.previousSameMock || compare?.previous;
  if (pv) { h2(compare.previousSameMock ? 'Versus your previous attempt of this mock' : 'Versus your previous mock'); const dl = s.score - pv.score; text(`Score ${s.score} against ${pv.score} (${dl >= 0 ? '+' : '−'}${Math.abs(dl)} marks). Accuracy ${s.accuracy}% against ${pv.accuracy}%. Time ${fmtTime(s.timeTakenSec)} against ${fmtTime(pv.timeTakenSec)}.`, { size: 9.5 }); }

  // ---------- topics ----------
  h2('Topic-wise accuracy (weakest first)');
  table([{ h: 'Topic', w: 0.42 }, { h: 'Section', w: 0.16 }, { h: 'Correct', w: 0.14, a: 'right' }, { h: 'Total', w: 0.12, a: 'right' }, { h: 'Accuracy', w: 0.16, a: 'right' }],
    a.topics.slice(0, 16).map((t) => [t.topic, d.sections.find((x) => x.key === t.section)?.short || t.section, t.correct, t.total, { v: `${t.accuracy}%`, c: t.accuracy < 40 ? C.bad : t.accuracy >= 75 ? C.good : C.ink, b: true }]), { rh: 18 });

  // ---------- fixes ----------
  if (a.fixes.length) {
    h2('Three things to fix first');
    a.fixes.forEach((f, i) => { const h = doc.heightOfString(f.body, { width: W - 36 }) + 26; need(h + 6); const y = doc.y; box(M, y, W, h, C.warnBg, '#f1d9a8'); doc.font('B').fontSize(10).fillColor(C.warn).text(`${i + 1}. ${f.title}`, M + 12, y + 7, { width: W - 24 }); doc.font('R').fontSize(9).fillColor(C.ink).text(f.body, M + 12, y + 21, { width: W - 24 }); doc.y = y + h + 6; });
  }

  // ---------- question review ----------
  const list = (scope === 'all' ? d.questions.filter((q) => !q.qualifying).concat(d.questions.filter((q) => q.qualifying)) : d.questions.filter((q) => q.status !== 'correct' && !q.qualifying));
  doc.addPage();
  h2(scope === 'all' ? `Solutions for all ${list.length} questions` : `Solutions for your ${list.length} mistakes and skipped questions`);
  if (!list.length) text('No mistakes to review. Perfect paper!', { color: C.good, font: 'B' });
  const seenPassage = new Set(); let lastSec = '';
  const secNo = {}; for (const q of d.questions) secNo[q.id] = q.index + 1;

  for (const q of list) {
    const secName = (d.sections.concat(d.qualifying || [])).find((x) => x.key === q.section)?.short || q.section;
    // header
    need(110);
    const y0 = doc.y; const st = q.status === 'correct' ? [C.good, C.goodBg, 'Correct'] : q.status === 'incorrect' ? [C.bad, C.badBg, 'Wrong'] : [C.mut, C.grey, 'Skipped'];
    box(M, y0, W, 22, st[1], st[1]); doc.font('B').fontSize(9.5).fillColor(st[0]).text(`${secName} · Q${secNo[q.id]} · ${st[2]}`, M + 10, y0 + 6.5, { continued: true }).font('R').fillColor(C.mut).text(`   ${q.topic} · ${q.difficulty} · ${q.timeSec}s · ${q.marksAwarded >= 0 ? '+' : '−'}${Math.abs(q.marksAwarded)}`);
    doc.y = y0 + 28;
    if (q.passage) { const key = q.passage.slice(0, 60); if (!seenPassage.has(key)) { seenPassage.add(key); const ph = Math.min(doc.heightOfString(q.passage, { width: W - 20 }) + 14, 240); need(Math.min(ph, 120)); const py = doc.y; doc.font('I').fontSize(8.5).fillColor(C.mut).text(`Passage: ${q.passage}`, M + 10, py + 5, { width: W - 20, lineGap: 1.5 }); doc.y += 6; } else text('(Passage as shown on the earlier question.)', { size: 8, color: C.mut, font: 'I' }); }
    text(q.text, { size: 10, font: 'B', lineGap: 2.5 });
    if (q.table?.headers) { gap(2); const cols = q.table.headers.length; const cw = Math.min(W / cols, 80); const ty = doc.y; need((q.table.rows.length + 1) * 16 + 6); const t0 = doc.y; [q.table.headers, ...q.table.rows].forEach((row, ri) => { const ry = t0 + ri * 16; row.forEach((c, ci) => { doc.rect(M + ci * cw, ry, cw, 16).lineWidth(0.5).strokeColor(C.line).stroke(); doc.font(ri ? 'R' : 'B').fontSize(8).fillColor(C.ink).text(clean(c), M + ci * cw + 3, ry + 4, { width: cw - 6, lineBreak: false }); }); doc.y = ry + 16; }); void ty; gap(4); }
    if (q.figure) { try { const fw = Math.min(260, W); const hh = fw * ((m) => (m ? m[2] / m[1] : 0.6))(q.figure.match(/viewBox="[\d.\-]+ [\d.\-]+ ([\d.]+) ([\d.]+)"/)); need(hh + 8); const fy = doc.y + 2; SVGtoPDF(doc, q.figure, M + 4, fy, { width: fw, height: hh, preserveAspectRatio: 'xMinYMin meet' }); doc.y = fy + hh + 6; } catch { text('[Figure: see the Review page]', { size: 8.5, color: C.mut, font: 'I' }); } }
    if (q.image) { try { const f = path.join(UPLOAD_DIR, path.basename(q.image)); if (fs.existsSync(f)) { need(190); const iy = doc.y + 2; doc.image(f, M + 4, iy, { fit: [300, 180] }); doc.y = iy + 186; } } catch { text('[Image: see the Review page]', { size: 8.5, color: C.mut, font: 'I' }); } }
    gap(3);
    q.options.forEach((o, i) => {
      const isC = i === q.correct, isMine = i === q.selected; const hasFig = !!q.optionFigures?.[i]; const label = hasFig ? `${L[i]}.` : `${L[i]}.  ${o}`; const hh = hasFig ? 60 : Math.max(doc.heightOfString(clean(label), { width: W - 40 }) + 8, 18);
      need(hh + 4); const oy = doc.y;
      if (isC) box(M + 4, oy, W - 8, hh, C.goodBg, C.good); else if (isMine) box(M + 4, oy, W - 8, hh, C.badBg, C.bad);
      doc.font(isC || isMine ? 'B' : 'R').fontSize(9.5).fillColor(isC ? C.good : isMine ? C.bad : C.ink).text(clean(label), M + 12, oy + 4, { width: W - 90 });
      if (isC || isMine) doc.font('B').fontSize(8).text(isC && isMine ? 'Your answer · Correct' : isC ? 'Correct answer' : 'Your answer', M + W - 110, oy + 5.5, { width: 100, align: 'right' });
      if (q.optionFigures?.[i]) { try { SVGtoPDF(doc, q.optionFigures[i], M + 44, oy + 4, { width: 80, height: 52, preserveAspectRatio: 'xMinYMin meet' }); doc.y = oy + hh + 3; } catch { doc.y = oy + hh + 3; } } else doc.y = oy + hh + 3;
    });
    gap(3);
    const block = (title, body, col = C.brand) => { if (!body) return; need(Math.min(doc.heightOfString(clean(body), { width: W - 14 }) + 22, 140)); text(title, { font: 'B', size: 8.5, color: col }); text(body, { size: 9, lineGap: 2 }); gap(3); };
    block('Why the right answer is right', q.explanation);
    if (q.steps?.length) { need(40); text('Steps', { font: 'B', size: 8.5, color: C.brand }); q.steps.forEach((t, i) => text(`${i + 1}. ${t}`, { size: 9, x: M + 8, width: W - 8 })); gap(3); }
    if (q.shortcut) block('Shortcut', q.shortcut);
    if (q.status === 'incorrect' && q.whyWrong) block(`Why option ${L[q.selected]} fails`, q.whyWrong, C.bad);
    block('Common mistake', q.trap, C.warn); block('Revise', q.revise);
    doc.moveTo(M, doc.y + 2).lineTo(M + W, doc.y + 2).lineWidth(0.5).strokeColor(C.line).stroke(); gap(12);
  }

  // ---------- footer on every page ----------
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i); const fy = doc.page.height - 30; doc.page.margins.bottom = 0;
    doc.font('R').fontSize(7.5).fillColor(C.mut).text(`MockDesk · ${d.attempt.mockName} · ${user.name}`, M, fy, { width: W / 2, lineBreak: false }).text(`Page ${i + 1} of ${range.count}`, M + W / 2, fy, { width: W / 2, align: 'right', lineBreak: false });
  }
  return doc;
}
