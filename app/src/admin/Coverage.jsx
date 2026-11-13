import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Err, Loading, PageHead, Stat, useLoad } from './ui.jsx';

function Mix({ e, m, h }) {
  const t = e + m + h || 1;
  return <span className="cov-mix" title={`Easy ${e} · Moderate ${m} · Hard ${h}`}><i className="e" style={{ width: `${(e / t) * 100}%` }} /><i className="m" style={{ width: `${(m / t) * 100}%` }} /><i className="h" style={{ width: `${(h / t) * 100}%` }} /></span>;
}
export default function Coverage() {
  const { data: d, err, loading } = useLoad('/admin/coverage'); const [gaps, setGaps] = useState(false);
  if (loading) return <Loading />; if (err) return <Err>{err}</Err>;
  const thin = d.sections.reduce((a, s) => a + s.topics.filter((t) => t.gap === 'thin').length, 0);
  const inMocks = d.sections.reduce((a, s) => a + s.inMocks, 0); const bank = d.sections.reduce((a, s) => a + s.bank, 0);
  const max = Math.max(1, ...d.sections.flatMap((s) => s.topics.map((t) => t.total)));
  return (
    <>
      <PageHead title="Syllabus coverage" sub="How many questions each topic has, in mocks and in the question bank. Use it to see what to write next.">
        <label className="ad-chk"><input type="checkbox" checked={gaps} onChange={(e) => setGaps(e.target.checked)} /> Show only gaps</label>
        <Link className="btn btn-primary" to="/admin/mocks">Build a mock from the bank</Link>
      </PageHead>
      <div className="ad-grid g4">
        <Stat icon="🗂" label="Mocks counted" value={d.mockCount} sub="Drafts and published" />
        <Stat icon="❓" label="Questions in mocks" value={inMocks} />
        <Stat icon="📦" label="Waiting in the bank" value={bank} sub="Not in any mock yet" />
        <Stat icon="⚠" tone={thin ? 'warn' : 'good'} label="Thin topics" value={thin} sub="In at most 1 mock, none in the bank" />
      </div>
      {d.sections.map((s) => {
        const rows = gaps ? s.topics.filter((t) => t.gap) : s.topics;
        return (
          <section className="card" key={s.key} style={{ marginTop: 14 }}>
            <div className="ad-sec-head"><h3 style={{ margin: 0 }}>{s.name}</h3><span className="small muted">{s.inMocks} in mocks · {s.bank} in bank · {s.perMock} per mock</span><Mix e={s.easy} m={s.moderate} h={s.hard} /></div>
            {!rows.length ? <p className="muted small">No gaps in this section.</p> : <div style={{ overflowX: 'auto' }}><table className="ad-table cov"><thead><tr><th>Topic</th><th className="num">In mocks</th><th className="num">In bank</th><th>Difficulty</th><th className="num">Used in</th><th /></tr></thead>
              <tbody>{rows.map((t) => (
                <tr key={t.topic}>
                  <td><b>{t.topic}</b></td>
                  <td className="num cov-cell" style={{ '--h': Math.min(1, t.mocks / max) }}>{t.mocks}</td>
                  <td className="num cov-cell bank" style={{ '--h': Math.min(1, t.bank / max) }}>{t.bank}</td>
                  <td><Mix e={t.easy} m={t.moderate} h={t.hard} /></td>
                  <td className="num">{t.usedIn} {t.usedIn === 1 ? 'mock' : 'mocks'}</td>
                  <td>{t.gap === 'thin' ? <Badge tone="bad">Thin</Badge> : t.gap === 'low' ? <Badge tone="warn">Low</Badge> : <Badge tone="good">OK</Badge>}</td>
                </tr>))}</tbody></table></div>}
          </section>
        );
      })}
      <p className="small muted" style={{ marginTop: 12 }}>Thin: appears in one mock or fewer and none are waiting in the bank. Low: none in the bank and not in every mock. Archived mocks are not counted. Difficulty bar: green easy, amber moderate, red hard.</p>
    </>
  );
}
