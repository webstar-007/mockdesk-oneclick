export const STATUS_ORDER = ['answered', 'notAnswered', 'notVisited', 'marked', 'answeredMarked'];
export function statusOf(r) {
  const answered = r && r.selected != null, marked = r && r.marked, visited = r && r.visited;
  if (!visited && !answered) return 'notVisited';
  if (answered && marked) return 'answeredMarked';
  if (marked) return 'marked';
  if (answered) return 'answered';
  return 'notAnswered';
}
export function Legend({ counts, labels }) {
  return (
    <ul className="legend-list">
      {STATUS_ORDER.map((k) => (
        <li key={k}><span className={`pal-chip s-${k}`} aria-hidden="true">{counts ? counts[k] : ''}</span><span>{labels[k]}</span></li>
      ))}
    </ul>
  );
}
export default function Palette({ questions, responses, currentId, onJump, labels }) {
  const counts = Object.fromEntries(STATUS_ORDER.map((k) => [k, 0]));
  const items = questions.map((q, i) => { const s = statusOf(responses[q.id]); counts[s]++; return { q, i, s }; });
  return (
    <div className="palette">
      <Legend counts={counts} labels={labels} />
      <div className="pal-grid" role="group" aria-label="Question palette">
        {items.map(({ q, i, s }) => (
          <button key={q.id} className={`pal-btn s-${s} ${q.id === currentId ? 'cur' : ''}`} onClick={() => onJump(q.id)}
            aria-label={`Question ${i + 1}, ${labels[s]}`} aria-current={q.id === currentId ? 'true' : undefined}>{i + 1}</button>
        ))}
      </div>
    </div>
  );
}
