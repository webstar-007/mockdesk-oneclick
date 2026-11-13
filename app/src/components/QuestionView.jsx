import Rich from './Rich.jsx';
export function DataTable({ table }) {
  if (!table) return null;
  return (
    <div className="tbl-wrap"><table className="dtable">
      {table.caption && <caption>{table.caption}</caption>}
      <thead><tr>{table.headers.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
      <tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => (j === 0 ? <th scope="row" key={j}>{c}</th> : <td key={j}>{c}</td>))}</tr>)}</tbody>
    </table></div>
  );
}
export function Passage({ text, label = 'Passage' }) {
  if (!text) return null;
  return (
    <details className="passage" open>
      <summary>{label}</summary>
      <div className="passage-body">{String(text).split(/\n{2,}|\n/).map((p, i) => <p key={i}><Rich text={p} /></p>)}</div>
    </details>
  );
}
/** Question figures are inline SVG from our own question banks (validated server-side). They use currentColor so they follow dark mode. */
export function Figure({ svg, label, className = 'fig' }) {
  if (!svg) return null;
  return <div className={className} role="img" aria-label={label || 'Figure'} dangerouslySetInnerHTML={{ __html: svg }} />;
}
/** Shared by exam and review. */
export default function QuestionView({ q, number, children, extraMeta }) {
  const hasPassage = !!q.passage;
  return (
    <article className={`qview ${hasPassage ? 'has-passage' : ''}`}>
      {hasPassage && <div className="qv-passage"><Passage text={q.passage} label={q.section === 'english' ? 'Passage / Context' : 'Directions & Information'} /></div>}
      <div className="qv-main">
        <div className="qmeta">
          <span className="qnum">Question {number}</span>
          <span className="qmarks" title="Marks for correct / negative marks for wrong">+{q.marks} · −{q.negativeMarks}</span>
          {extraMeta}
        </div>
        <DataTable table={q.table} />
        <p className="qtext"><Rich text={q.text} /></p>
        <Figure svg={q.figure} label="Question figure" />
        {q.image && <img className="qimg" src={q.image} alt="Illustration for the question" loading="lazy" />}
        {children}
      </div>
    </article>
  );
}
