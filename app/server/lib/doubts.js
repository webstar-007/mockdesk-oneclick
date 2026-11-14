// Free "doubt helper": answers from the question's own saved explanation, steps, shortcut, trap and notes.
// It never calls an outside service, so it costs nothing to run. It only talks about ONE question.
const L = 'ABCD';
const has = (m, words) => words.some((w) => m.includes(w));

export const DOUBT_CHIPS = [
  ['explain', 'Explain the solution'],
  ['mine', 'Why was my answer wrong?'],
  ['shortcut', 'Is there a faster way?'],
  ['steps', 'Show the steps'],
  ['trap', 'What is the common mistake?'],
  ['revise', 'What should I revise?'],
];

/** Work out what the student is asking from a short message. Returns { intent, idx? }. */
export function detectIntent(raw) {
  const m = ` ${String(raw || '').toLowerCase().replace(/[^a-z0-9?'’ ]/g, ' ').replace(/\s+/g, ' ')} `;
  const opt = m.match(/\boption\s*([a-d])\b/) || m.match(/\b([a-d])\s*(?:is|was)?\s*(?:wrong|incorrect|not)\b/) || m.match(/\bwhy\s*(?:not)?\s*\(?([a-d])\)?\s*\?*\s*$/);
  if (opt) return { intent: 'option', idx: L.indexOf(opt[1].toUpperCase()) };
  if (has(m, [' my answer', ' i chose', ' i selected', ' i marked', ' i picked', 'why wrong', 'why was i wrong', 'my mistake', 'what did i do wrong', 'why incorrect', 'why is mine', 'what went wrong', 'where did i go wrong'])) return { intent: 'mine' };
  if (has(m, ['shortcut', 'faster', 'quicker', 'quick way', 'trick', 'short way', 'save time', 'speed up', 'easier way', 'easy way'])) return { intent: 'shortcut' };
  if (has(m, [' step', 'working', 'calculat', 'workings', 'derive', 'derivation'])) return { intent: 'steps' };
  if (has(m, ['trap', 'common mistake', 'careful', 'pitfall', 'mistake'])) return { intent: 'trap' };
  if (has(m, ['revise', 'concept', 'formula', 'study', 'learn', 'prerequisite', 'basics', 'rule'])) return { intent: 'revise' };
  if (has(m, ['approach', 'similar', 'strategy', 'pattern', 'next time', 'other questions', 'identify'])) return { intent: 'approach' };
  if (has(m, [' time ', 'slow', 'too long', ' speed', 'how long'])) return { intent: 'time' };
  if (has(m, ['explain', 'solution', 'solve', 'answer', 'correct', 'understand', 'clarify', 'doubt', ' help', 'confus', "don't get", 'dont get', 'not clear', 'unclear', 'this question', 'this one'])) return { intent: 'explain' };
  if (has(m, [' thanks', 'thank you', ' ok ', ' okay ', ' got it', ' hi ', ' hello ', ' hey '])) return { intent: 'thanks' };
  return { intent: 'scope' };
}

const optText = (q, i) => (i != null && q.options?.[i] ? `${L[i]}. ${q.options[i]}` : '');

/** Build the reply for one question. `q` is a question from a stored result (it already holds the answer and notes). */
export function answerDoubt(q, message) {
  const { intent, idx } = detectIntent(message);
  const sel = q.selected; const ok = q.correct;
  const correctLine = `The correct answer is option ${optText(q, ok)}.`;
  let r;
  switch (intent) {
    case 'explain':
      r = [{ title: 'The solution', text: `${correctLine} ${q.explanation || 'There is no written explanation for this question yet.'}`.trim(), steps: q.steps?.length ? q.steps : undefined }];
      break;
    case 'steps':
      r = q.steps?.length ? [{ title: 'Step by step', text: correctLine, steps: q.steps }] : [{ title: 'The solution', text: `This question has no separate steps. ${q.explanation || correctLine}` }];
      break;
    case 'mine':
      if (q.status === 'correct') r = [{ title: 'Your answer', text: `You chose option ${optText(q, sel)}, and that is correct. If you were not sure, read the explanation once so it is not a lucky guess next time.` }];
      else if (q.status === 'unattempted') r = [{ title: 'You skipped this one', text: `${correctLine} Skipping costs nothing. ${q.shortcut ? `A faster way: ${q.shortcut}` : q.approach || ''}`.trim() }];
      else r = [{ title: 'Why your answer was wrong', text: `You chose option ${optText(q, sel)}. ${q.whyWrong || q.wrongReasons?.[sel] || 'That option does not satisfy the conditions in the question.'}` }, { title: 'What is right', text: `${correctLine} ${q.trap ? `Watch out for this: ${q.trap}` : ''}`.trim() }];
      break;
    case 'option':
      if (idx === ok) r = [{ title: `Option ${L[idx]}`, text: `Option ${optText(q, idx)} is the correct answer. ${q.explanation || ''}`.trim() }];
      else r = [{ title: `Option ${L[idx]}`, text: q.wrongReasons?.[idx] ? `Option ${optText(q, idx)} is not correct. ${q.wrongReasons[idx]}` : `Option ${optText(q, idx)} is not correct. ${correctLine} See the explanation for why.` }];
      break;
    case 'shortcut':
      r = [{ title: 'A faster way', text: q.shortcut || `There is no separate shortcut saved for this question. ${q.approach ? `Approach: ${q.approach}` : 'The steps in the explanation are the quickest route I have.'}` }];
      break;
    case 'trap':
      r = [{ title: 'Common mistake', text: q.trap || 'No common mistake is saved for this question. Re-read the question once for words like "not", "except" and "approximately".' }];
      break;
    case 'revise':
      r = [{ title: 'Concept to revise', text: q.revise || `This question is from ${q.topic}${q.subtopic ? ` (${q.subtopic})` : ''}. Revise that topic's basics, then try a few similar questions.` }];
      break;
    case 'approach':
      r = [{ title: 'Approach for similar questions', text: q.approach || `For ${q.topic} questions, read what is asked first, list what is given, then pick the method. The explanation shows one way.` }];
      break;
    case 'time': {
      const t = q.timeSec || 0;
      let line = `You spent ${t} seconds on this question.`;
      if (q.status !== 'correct' && t >= 90) line += ' That is long for one question. In the exam, mark it and come back if you are not close after about 90 seconds.';
      else if (q.status === 'incorrect' && t < 30) line += ' You answered quickly and got it wrong, so slow down a little and check the options.';
      r = [{ title: 'Your time', text: line }];
      break;
    }
    case 'thanks':
      r = [{ title: 'Glad to help', text: 'Pick any question you found tricky and ask away.' }];
      break;
    default:
      r = [{ title: 'I can only help with this question', text: 'Ask about its solution, your answer, a faster way, the steps, the common mistake or what to revise. Use one of the buttons below.' }];
  }
  const rest = DOUBT_CHIPS.filter(([k]) => k !== intent).slice(0, 3).map(([k, l]) => ({ intent: k, label: l }));
  return { intent, replies: r, chips: rest };
}
