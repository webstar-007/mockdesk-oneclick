import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import Modal from './Modal.jsx';

const W = 1080; const H = 1350;
function wrap(ctx, text, x, y, maxW, lh) {
  const words = text.split(' '); let line = ''; let yy = y;
  for (const w of words) { const t = line ? `${line} ${w}` : w; if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, yy); line = w; yy += lh; } else line = t; }
  ctx.fillText(line, x, yy); return yy;
}
/** Draw the picture. Everything is drawn in the browser, so sharing costs the server nothing. */
function draw(canvas, { score, max, pct, accuracy, mock, name, rankText, url, code }) {
  const ctx = canvas.getContext('2d'); canvas.width = W; canvas.height = H;
  const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#0f2b3d'); g.addColorStop(1, '#14506a'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,.06)'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(W - 80, 120 + i * 40, 260 - i * 38, 0, Math.PI * 2); ctx.fill(); }
  const font = '"Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
  ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#fff';
  ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.roundRect(72, 72, 72, 72, 18); ctx.fill(); ctx.fillStyle = '#0f2b3d'; ctx.font = `800 48px ${font}`; ctx.textAlign = 'center'; ctx.fillText('✓', 108, 126);
  ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = `700 46px ${font}`; ctx.fillText('MockDesk', 164, 124);
  ctx.font = `500 40px ${font}`; ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillText(name ? `${name} scored` : 'I scored', 72, 330);
  ctx.fillStyle = '#fff'; ctx.font = `800 250px ${font}`; const sc = String(score); ctx.fillText(sc, 72, 570);
  const sw = ctx.measureText(sc).width; ctx.font = `600 100px ${font}`; ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillText(`/${max}`, 72 + sw + 14, 570);
  ctx.fillStyle = '#fff'; ctx.font = `600 54px ${font}`; wrap(ctx, `on ${mock}`, 72, 660, W - 144, 66);
  const chips = [`${pct}% score`, `${accuracy}% accuracy`]; if (rankText) chips.push(rankText);
  let cx = 72; ctx.font = `600 38px ${font}`;
  for (const c of chips) { const w = ctx.measureText(c).width + 56; ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.beginPath(); ctx.roundRect(cx, 800, w, 76, 38); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(c, cx + 28, 850); cx += w + 18; }
  ctx.fillStyle = '#ffd166'; ctx.font = `700 52px ${font}`; wrap(ctx, 'Think you can beat it?', 72, 1000, W - 144, 62);
  ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = `500 38px ${font}`; ctx.fillText('Free SSC CGL Tier-II mocks with the real exam screen.', 72, 1062, W - 144);
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(72, 1120, W - 144, 150, 28); ctx.fill();
  ctx.fillStyle = '#0f2b3d'; ctx.font = `700 44px ${font}`; let u = url.replace(/^https?:\/\//, ''); while (ctx.measureText(u).width > W - 220 && u.length > 8) u = u.slice(0, -2); ctx.fillText(u === url.replace(/^https?:\/\//, '') ? u : `${u}…`, 108, 1192);
  if (code) { ctx.fillStyle = '#4b6577'; ctx.font = `500 32px ${font}`; ctx.fillText(`Use code ${code} when you sign up`, 108, 1242); }
}
export default function ShareCard({ d, firstName, onClose }) {
  const s = d.summary; const [ref, setRef] = useState(null); const [showName, setShowName] = useState(false); const [img, setImg] = useState(''); const [note, setNote] = useState('');
  const canvas = useRef(null);
  useEffect(() => { api.get('/referral').then(setRef).catch(() => setRef({})); }, []);
  const mock = d.attempt.mockName.replace('CGL Tier-II ', '');
  const url = useMemo(() => ref?.link || window.location.origin, [ref]);
  const topPct = d.community?.unlocked ? Math.max(1, Math.round(100 - d.community.percentile)) : null;
  const rankText = topPct && topPct <= 50 ? `Top ${topPct}%` : '';
  const text = `I scored ${s.score}/${s.maxMarks} on ${mock} on MockDesk. Can you beat it? ${url}`;
  useEffect(() => {
    if (!ref) return; const c = canvas.current || document.createElement('canvas');
    draw(c, { score: s.score, max: s.maxMarks, pct: s.percentage, accuracy: s.accuracy, mock, name: showName ? firstName : '', rankText, url, code: ref.code }); setImg(c.toDataURL('image/png'));
  }, [ref, showName]); // eslint-disable-line
  const blob = () => new Promise((res) => canvas.current.toBlob(res, 'image/png'));
  const share = async () => {
    setNote('');
    try {
      const b = await blob(); const file = new File([b], 'my-mockdesk-score.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
      if (navigator.share) { await navigator.share({ text }); setNote('Your browser cannot attach the picture. Download it and add it to your story or chat.'); return; }
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener'); setNote('Opened WhatsApp with your message. Download the picture to attach it.');
    } catch (e) { if (e?.name !== 'AbortError') setNote('Could not open sharing. Use Download instead.'); }
  };
  const download = async () => { const b = await blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'my-mockdesk-score.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  const copy = async () => { try { await navigator.clipboard.writeText(text); setNote('Message copied.'); } catch { setNote('Could not copy. Select and copy the message below.'); } };
  return (
    <Modal title="Share your score" onClose={onClose} actions={<button className="btn btn-ghost" onClick={onClose}>Close</button>}>
      <div className="sc-wrap">
        <canvas ref={canvas} className="sc-canvas" aria-hidden="true" />
        {img ? <img className="sc-img" src={img} alt={`Score card: ${s.score} out of ${s.maxMarks} on ${mock}`} /> : <p className="muted" role="status">Drawing your card…</p>}
        <label className="check"><input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} /><span>Show my first name ({firstName})</span></label>
        <div className="sc-actions"><button className="btn btn-primary" onClick={share} disabled={!img}>Share</button><button className="btn btn-ghost" onClick={download} disabled={!img}>Download picture</button><a className="btn btn-ghost" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a><button className="btn btn-ghost" onClick={copy}>Copy message</button></div>
        {note && <p className="small muted" role="status">{note}</p>}
        <p className="small muted">The picture is made on your phone. It shows your score only, never your email or phone number. For Instagram, download it and add it to a story.</p>
      </div>
    </Modal>
  );
}
