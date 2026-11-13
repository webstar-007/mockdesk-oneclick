// Dependency-free SVG charts. Colour is never the only carrier of meaning: values are labelled.
import { tip } from './Tip.jsx';
const W = 560;
export function BarChart({ data, max = 100, unit = '%', height = 18, label = 'Bar chart' }) {
  return (
    <div className="hbars" role="img" aria-label={label}>
      {data.map((d) => (
        <div className="hbar" key={d.label} tabIndex={0} {...tip({ t: label, v: `${d.label}: ${Number.isInteger(d.value) ? d.value : d.value.toFixed(1)}${unit}`, tone: d.tone === 'good' ? 'good' : d.tone === 'weak' ? 'bad' : 'brand', rows: [['Scale', `0 – ${max}${unit}`], ['Share of scale', `${Math.round((d.value / max) * 100)}%`]] })}>
          <span className="hbar-label">{d.label}</span>
          <span className="hbar-track"><span className={`hbar-fill ${d.tone || ''}`} style={{ width: `${Math.max(0, Math.min(100, (d.value / max) * 100))}%`, height }} /></span>
          <span className="hbar-val">{Number.isInteger(d.value) ? d.value : d.value.toFixed(1)}{unit}</span>
        </div>
      ))}
    </div>
  );
}
/** points: [{x:label, a:number, b?:number}]  — a = score %, b = accuracy % */
export function TrendChart({ points, aName = 'Score %', bName = 'Accuracy %' }) {
  const H = 220, L = 38, R = 14, T = 14, B = 34;
  const n = points.length;
  const x = (i) => (n === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (n - 1));
  const y = (v) => T + (1 - Math.max(0, Math.min(100, v)) / 100) * (H - T - B);
  const line = (k) => points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ');
  return (
    <figure className="trend">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${aName} and ${bName} across your attempts`}>
        {[0, 25, 50, 75, 100].map((g) => (<g key={g}><line x1={L} x2={W - R} y1={y(g)} y2={y(g)} className="grid" /><text x={L - 6} y={y(g) + 4} textAnchor="end" className="axis">{g}</text></g>))}
        <path d={line('a')} className="ln-a" fill="none" />
        {points[0]?.b != null && <path d={line('b')} className="ln-b" fill="none" />}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.a)} r="4.5" className="pt-a" tabIndex={0} {...tip({ t: p.x, v: `${aName}: ${p.a}`, rows: p.b != null ? [[bName, p.b]] : [] })} />
            {p.b != null && <rect x={x(i) - 4} y={y(p.b) - 4} width="8" height="8" className="pt-b" tabIndex={0} {...tip({ t: p.x, v: `${bName}: ${p.b}`, tone: 'good', rows: [[aName, p.a]] })} />}
            <text x={x(i)} y={H - 12} textAnchor="middle" className="axis">{p.x}</text>
          </g>
        ))}
      </svg>
      <figcaption className="legend"><span><i className="sw sw-a" />{aName}</span>{points[0]?.b != null && <span><i className="sw sw-b" />{bName}</span>}</figcaption>
    </figure>
  );
}
export function ScoreBars({ items }) { // [{label, value, max}]
  const H = 200, L = 34, B = 30, T = 14, gap = 10; const bw = Math.min(54, (W - L - 10) / items.length - gap);
  const max = Math.max(...items.map((i) => i.max), 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="scorebars" role="img" aria-label="Score by mock test">
      {[0, 0.5, 1].map((g) => (<g key={g}><line x1={L} x2={W} y1={T + (1 - g) * (H - T - B)} y2={T + (1 - g) * (H - T - B)} className="grid" /><text x={L - 5} y={T + (1 - g) * (H - T - B) + 4} textAnchor="end" className="axis">{Math.round(g * max)}</text></g>))}
      {items.map((it, i) => {
        const cx = L + 16 + i * ((W - L - 10) / items.length); const h = (Math.max(0, it.value) / max) * (H - T - B);
        return (<g key={it.label}><rect x={cx} y={H - B - h} width={bw} height={h} rx="3" className={`bar ${it.tone || ''}`} tabIndex={0} {...tip({ t: it.label, v: `${it.value} / ${it.max}`, rows: [['Percent', `${Math.round((it.value / it.max) * 100)}%`]] })} /><text x={cx + bw / 2} y={H - B - h - 5} textAnchor="middle" className="axis strong">{it.value}</text><text x={cx + bw / 2} y={H - 10} textAnchor="middle" className="axis">{it.label}</text></g>);
      })}
    </svg>
  );
}
