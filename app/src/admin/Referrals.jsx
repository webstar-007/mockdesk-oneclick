import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Badge, Empty, Err, Loading, PageHead, Stat, ago, toast, useLoad } from './ui.jsx';

export default function Referrals() {
  const { data, err, loading, reload } = useLoad('/admin/referrals');
  if (loading && !data) return <Loading />;
  const set = async (b) => { try { await api.put('/admin/referrals/settings', { ...data.settings, ...b }); toast('Saved'); reload(); } catch (e) { toast(e.message, 'bad'); } };
  const s = data?.settings; const st = data?.stats;
  return (
    <>
      <PageHead title="Referrals" sub="Students invite friends. When the friend finishes a first mock, both unlock a reward mock early." />
      <Err>{err}</Err>
      {data && (<>
        <div className="ad-grid g4" style={{ marginBottom: 14 }}><Stat label="Friends joined" value={st.joined} icon="🤝" /><Stat label="Finished a first mock" value={st.qualified} sub={st.joined ? `${Math.round((st.qualified / st.joined) * 100)}% of joined` : ''} icon="✔" /><Stat label="Rewards unlocked" value={st.rewards} icon="🎁" /><Stat label="Students who invited" value={st.referrers} icon="📣" /></div>
        <div className="ad-grid g2">
          <section className="card"><h3>Settings</h3>
            <label className="check"><input type="checkbox" checked={s.enabled} onChange={(e) => set({ enabled: e.target.checked })} /><span>Referrals are on<small className="muted" style={{ display: 'block' }}>Turning them off hides invite cards and ignores new codes. Rewards already given stay.</small></span></label>
            <label className="ad-field" style={{ marginTop: 10 }}>Friends needed for each reward<select value={s.friendsNeeded} onChange={(e) => set({ friendsNeeded: Number(e.target.value) })}>{[1, 2, 3, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select><small>The friend always gets a reward after their first mock. The inviter gets one for every this many friends.</small></label>
            <h3 style={{ marginTop: 16 }}>Reward mocks</h3>
            {!data.rewardMocks.length ? <p className="small muted">No mock is set as a reward yet. Open a mock in <Link to="/admin/mocks">Mocks</Link> and tick “Referral reward” to lock it until its release date. Students can open it early by inviting a friend.</p> : <ul className="inv-rw">{data.rewardMocks.map((m) => <li key={m.id}><span><Link to={`/admin/mocks/${m.id}`}>{m.name}</Link>{m.status !== 'published' && <small className="muted"> · {m.status}, publish it so it can be unlocked</small>}</span><b>{m.unlocked} unlocked</b></li>)}</ul>}
          </section>
          <section className="card"><h3>Top inviters</h3>
            {!data.top.length ? <Empty>No invites yet.</Empty> : <div className="tbl-wrap"><table className="dtable"><thead><tr><th>Student</th><th>Joined</th><th>Finished</th></tr></thead><tbody>{data.top.map((u) => <tr key={u.id}><td><Link to={`/admin/users/${u.id}`}>{u.name}</Link></td><td>{u.joined}</td><td>{u.qualified || 0}</td></tr>)}</tbody></table></div>}
          </section>
        </div>
        <section className="card" style={{ marginTop: 14 }}><h3>Recent invites</h3>
          {!data.recent.length ? <Empty>Nothing yet. Invite cards appear on every student’s profile.</Empty> : <div className="tbl-wrap"><table className="dtable"><thead><tr><th>Invited by</th><th>Friend</th><th>Status</th><th>When</th></tr></thead><tbody>{data.recent.map((r) => <tr key={r.id}><td>{r.referrer}</td><td>{r.friend}</td><td><Badge tone={r.status === 'qualified' ? 'good' : 'mute'}>{r.status === 'qualified' ? 'finished a mock' : 'joined'}</Badge></td><td>{ago(r.created_at)}</td></tr>)}</tbody></table></div>}
        </section></>)}
    </>
  );
}
