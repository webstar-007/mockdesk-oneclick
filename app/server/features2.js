// v8 student and teacher features: mistake reasons, answer-key corrections (re-scoring + public fix log), teacher notes.
import { buildResult } from './lib/scoring.js';
import { allSections } from './lib/sections.js';

const REASONS = { concept: 'Did not know the concept', silly: 'Silly mistake', time: 'Ran out of time', guess: 'Guessed' };
const L = 'ABCD';

export function makeFeatures2({ db, now, iso, notifier, readResult, dropCaches }) {
  const mockName = (id) => db.prepare('SELECT name FROM mocks WHERE id=?').get(id)?.name || id;

  // ---------- answer-key corrections: re-score everyone, tell the people affected ----------
  /** Call after an admin edits a question. Pass the question data from before and after the edit. */
  function onQuestionEdited({ row, before, after, publicNote, by }) {
    if (!row || row.mock_id === 'pool') return { affected: 0 };
    const keyChanged = Number.isInteger(before?.answer) && Number.isInteger(after?.answer) && before.answer !== after.answer;
    const note = String(publicNote || '').trim().slice(0, 200);
    if (!keyChanged && !note) return { affected: 0 };
    const changes = []; const tNow = now();
    if (keyChanged) {
      const attempts = db.prepare('SELECT id, user_id, status, responses, result, snapshot FROM attempts WHERE mock_id=? AND snapshot IS NOT NULL').all(row.mock_id);
      for (const a of attempts) {
        let snap; try { snap = JSON.parse(a.snapshot); } catch { continue; }
        const q = snap.questions?.find((x) => x.id === row.id); if (!q) continue;
        q.answer = after.answer;
        for (const k of ['explanation', 'steps', 'shortcut', 'trap', 'revise', 'approach', 'wrongReasons']) if (after[k] !== undefined) q[k] = after[k];
        db.prepare('UPDATE attempts SET snapshot=? WHERE id=?').run(JSON.stringify(snap), a.id);
        if (a.status !== 'submitted' || !a.result) continue;
        let old; try { old = JSON.parse(a.result); } catch { continue; }
        const oldQ = old.questions?.find((x) => x.id === row.id);
        const res = buildResult({ attempt: old.attempt, questions: snap.questions, responses: JSON.parse(a.responses || '{}'), sectionsCfg: snap.sectionsCfg || allSections() });
        db.prepare('UPDATE attempts SET result=?, score=?, accuracy=? WHERE id=?').run(JSON.stringify(res), res.summary.score, res.summary.accuracy, a.id);
        const now_ = res.questions.find((x) => x.id === row.id);
        if (oldQ && now_ && oldQ.status !== now_.status) changes.push({ userId: a.user_id, attemptId: a.id, from: old.summary.score, to: res.summary.score, max: res.summary.maxMarks });
      }
      dropCaches();
    }
    const m = db.prepare('SELECT name, status FROM mocks WHERE id=?').get(row.mock_id);
    const num = row.position + 1;
    const summary = keyChanged ? `Answer key corrected from option ${L[before.answer]} to ${L[after.answer]}.${note ? ' ' + note : ''}` : note;
    if (m && m.status === 'published') {
      const id = db.prepare('INSERT INTO question_fixes(question_id,mock_id,mock_name,section,position,kind,summary,affected,created_at,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)').run(row.id, row.mock_id, m.name, row.section, row.position, keyChanged ? 'answer' : 'text', summary, changes.length, tNow, by || 'admin').lastInsertRowid;
      for (const c of changes) {
        const d = c.to - c.from; const word = d > 0 ? `up by ${Math.round(d * 100) / 100}` : `down by ${Math.round(-d * 100) / 100}`;
        notifier.notify(c.userId, { kind: 'fix', title: `We corrected a question in ${m.name}`, body: `Question ${num} had a wrong answer key. Your score is now ${c.to} of ${c.max} (${word}).`, link: `/results/${c.attemptId}`, ref: `fix:${id}:${c.attemptId}`, channels: { email: false }, capped: false }).catch(() => {});
      }
    }
    return { affected: changes.length, keyChanged };
  }

  function mount(api) {
    // public fix log: what was corrected, never the question text
    api.get('/fixes', (req, res) => {
      const rows = db.prepare('SELECT * FROM question_fixes ORDER BY created_at DESC LIMIT 60').all();
      res.json({ fixes: rows.map((x) => ({ id: x.id, at: x.created_at, mockId: x.mock_id, mockName: x.mock_name, section: x.section, number: x.position + 1, kind: x.kind, summary: x.summary, affected: x.affected })) });
    });

    // ---------- why did I lose marks? ----------
    const own = (req) => db.prepare("SELECT id, result FROM attempts WHERE id=? AND user_id=? AND status='submitted'").get(req.params.id, req.user.id);
    api.get('/attempts/:id/errors', (req, res) => {
      if (!own(req)) return res.status(404).json({ error: 'Attempt not found' });
      res.json({ reasons: Object.fromEntries(db.prepare('SELECT question_id, reason FROM error_tags WHERE attempt_id=? AND user_id=?').all(req.params.id, req.user.id).map((x) => [x.question_id, x.reason])), options: REASONS });
    });
    api.put('/attempts/:id/errors/:qid', (req, res) => {
      const a = own(req); if (!a) return res.status(404).json({ error: 'Attempt not found' });
      const q = readResult(a).questions.find((x) => x.id === req.params.qid); if (!q) return res.status(404).json({ error: 'Question not found in that test' });
      if (q.status === 'correct') return res.status(400).json({ error: 'Only questions you got wrong or skipped can be tagged' });
      const reason = String(req.body?.reason || '');
      if (!reason) { db.prepare('DELETE FROM error_tags WHERE attempt_id=? AND question_id=? AND user_id=?').run(a.id, q.id, req.user.id); return res.json({ ok: true }); }
      if (!REASONS[reason]) return res.status(400).json({ error: 'Choose one of the listed reasons' });
      db.prepare('INSERT INTO error_tags(attempt_id,question_id,user_id,reason,at) VALUES (?,?,?,?,?) ON CONFLICT(attempt_id,question_id) DO UPDATE SET reason=excluded.reason, at=excluded.at').run(a.id, q.id, req.user.id, reason, now());
      res.json({ ok: true });
    });
    api.get('/errors/summary', (req, res) => {
      const tags = db.prepare('SELECT attempt_id, question_id, reason FROM error_tags WHERE user_id=?').all(req.user.id);
      const byAttempt = new Map(); for (const t of tags) (byAttempt.get(t.attempt_id) || byAttempt.set(t.attempt_id, new Map()).get(t.attempt_id)).set(t.question_id, t.reason);
      const acc = Object.fromEntries(Object.keys(REASONS).map((k) => [k, { key: k, label: REASONS[k], count: 0, marks: 0, sections: {} }]));
      let mistakes = 0;
      for (const a of db.prepare("SELECT id, result FROM attempts WHERE user_id=? AND status='submitted' AND mock_id!='practice' ORDER BY submitted_at DESC LIMIT 40").all(req.user.id)) {
        const tg = byAttempt.get(a.id); for (const q of readResult(a).questions) {
          if (q.qualifying || q.status === 'correct') continue; mistakes++;
          const r = tg?.get(q.id); if (!r || !acc[r]) continue;
          acc[r].count++; acc[r].marks += q.status === 'incorrect' ? q.negativeMarks + q.marks : q.marks; acc[r].sections[q.section] = (acc[r].sections[q.section] || 0) + 1;
        }
      }
      const tagged = Object.values(acc).reduce((p, x) => p + x.count, 0);
      res.json({ tagged, mistakes, reasons: Object.values(acc).map((x) => ({ ...x, marks: Math.round(x.marks * 10) / 10, pct: tagged ? Math.round((x.count / tagged) * 100) : 0 })).sort((a, b) => b.count - a.count) });
    });
  }

  // ---------- teacher notes on a student's result ----------
  function mountTeacher(api) {
    const guard = (req, res, next) => (req.user?.role === 'teacher' ? next() : res.status(403).json({ error: 'Teacher access only' }));
    const teaches = (tid, sid) => !!db.prepare('SELECT 1 FROM batch_teachers bt JOIN batch_members bm ON bm.batch_id=bt.batch_id JOIN batches b ON b.id=bt.batch_id WHERE bt.user_id=? AND bm.user_id=? AND b.archived=0').get(tid, sid);
    const out = (x) => ({ id: x.id, attemptId: x.attempt_id, teacher: x.teacher_name, note: x.note, at: x.created_at });
    api.get('/teacher/students/:uid/notes', guard, (req, res) => {
      const sid = Number(req.params.uid); if (!teaches(req.user.id, sid)) return res.status(404).json({ error: 'That student is not in your batches' });
      res.json({ notes: db.prepare('SELECT * FROM teacher_notes WHERE student_id=? ORDER BY created_at DESC LIMIT 100').all(sid).map((x) => ({ ...out(x), mine: x.teacher_id === req.user.id })) });
    });
    api.post('/teacher/students/:uid/notes', guard, (req, res) => {
      const sid = Number(req.params.uid); if (!teaches(req.user.id, sid)) return res.status(404).json({ error: 'That student is not in your batches' });
      const a = db.prepare("SELECT id, mock_id FROM attempts WHERE id=? AND user_id=? AND status='submitted'").get(String(req.body?.attemptId || ''), sid); if (!a) return res.status(404).json({ error: 'Choose one of this student\'s finished tests' });
      const note = String(req.body?.note || '').trim().slice(0, 600); if (note.length < 2) return res.status(400).json({ error: 'Write a note first' });
      if (db.prepare('SELECT COUNT(*) c FROM teacher_notes WHERE attempt_id=? AND teacher_id=?').get(a.id, req.user.id).c >= 5) return res.status(400).json({ error: 'You can leave up to 5 notes on one test' });
      const id = db.prepare('INSERT INTO teacher_notes(attempt_id,student_id,teacher_id,teacher_name,note,created_at) VALUES (?,?,?,?,?,?)').run(a.id, sid, req.user.id, req.user.name, note, now()).lastInsertRowid;
      notifier.notify(sid, { kind: 'teacher_note', title: `${req.user.name} left a note on your ${mockName(a.mock_id)} result`, body: note.slice(0, 140), link: `/results/${a.id}`, ref: `tnote:${id}`, channels: { email: false }, capped: false }).catch(() => {});
      res.status(201).json({ note: out(db.prepare('SELECT * FROM teacher_notes WHERE id=?').get(id)) });
    });
    api.delete('/teacher/notes/:id', guard, (req, res) => {
      const r = db.prepare('DELETE FROM teacher_notes WHERE id=? AND teacher_id=?').run(Number(req.params.id), req.user.id); if (!r.changes) return res.status(404).json({ error: 'Note not found' });
      res.json({ ok: true });
    });
  }
  const notesFor = (attemptId) => db.prepare('SELECT * FROM teacher_notes WHERE attempt_id=? ORDER BY created_at').all(attemptId).map((x) => ({ id: x.id, teacher: x.teacher_name, note: x.note, at: x.created_at }));
  return { onQuestionEdited, mount, mountTeacher, notesFor, REASONS };
}
