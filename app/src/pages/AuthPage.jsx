import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { useAuth } from '../lib/auth.jsx';

const isPhone = (v) => /^[\d\s+\-()]+$/.test(v.trim());

function CodeBoxes({ value, onChange, inputRef }) {
  return (
    <div className="otp" onClick={() => inputRef.current?.focus()}>
      <input ref={inputRef} className="otp-real" inputMode="numeric" autoComplete="one-time-code" maxLength={6} aria-label="6-digit code" value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))} />
      {[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className={`otp-cell${value.length === i ? ' cur' : ''}${value[i] ? ' on' : ''}`} aria-hidden="true">{value[i] || ''}</span>)}
    </div>
  );
}

export default function AuthPage({ mode }) {
  const { user, login, register, otpRequest, otpVerify } = useAuth();
  const nav = useNavigate(); const loc = useLocation();
  const reg = mode === 'register';
  const [method, setMethod] = useState('otp'); // otp | password
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [show, setShow] = useState(false);
  const [ident, setIdent] = useState(''); const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState(null); const [exists, setExists] = useState(true); const [newName, setNewName] = useState(''); const [wait, setWait] = useState(0); const codeRef = useRef(null); const nameRef = useRef(null);
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(t); }, [wait]);
  useEffect(() => { if (sentTo) (exists ? codeRef : nameRef).current?.focus(); }, [sentTo, exists]);
  useEffect(() => { setErr(''); setF({ name: '', email: '', password: '' }); setShow(false); setSentTo(null); setCode(''); setWait(0); }, [mode]);
  if (user) return <Navigate to={loc.state?.from || '/'} replace />;

  const channel = ident.trim() && isPhone(ident) ? 'sms' : 'email';
  const otpMode = !reg && method === 'otp';
  const reset = () => { setErr(''); setExists(true); setSentTo(null); setCode(''); setWait(0); };
  const sendCode = async (e) => {
    e?.preventDefault(); setErr(''); setBusy(true);
    try { const r = await otpRequest(channel, ident); setSentTo(r.to); setExists(r.exists !== false); setWait(r.resendIn || 30); setCode(''); }
    catch (x) { setErr(x.message); if (x.status === 429 && /wait (\d+)/.test(x.message)) { setSentTo(sentTo || ident); setWait(Number(/wait (\d+)/.exec(x.message)[1])); } }
    finally { setBusy(false); }
  };
  const verifyCode = async (e) => {
    e?.preventDefault(); if (code.length !== 6 || busy) return; if (!exists && !newName.trim()) { setErr('Enter your name to create your account, or use Sign up.'); nameRef.current?.focus(); return; } setErr(''); setBusy(true);
    try { const r = await otpVerify(channel, ident, code, newName.trim()); nav(r.isNew ? '/profile?welcome=1' : (loc.state?.from || '/'), { replace: true }); }
    catch (x) { setErr(x.message); setCode(''); if (x.code === 'EXPIRED' || x.code === 'LOCKED') setWait(0); setBusy(false); }
  };
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { if (reg) await register(f.name, f.email, f.password); else await login(f.email, f.password); nav(loc.state?.from || '/', { replace: true }); }
    catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  useEffect(() => { if (code.length === 6 && sentTo && otpMode && (exists || newName.trim())) verifyCode(); }, [code]); // eslint-disable-line

  return (
    <div className="auth">
      <div className="auth-bg" aria-hidden="true"><i className="o1" /><i className="o2" /><i className="o3" /></div>
      <header className="auth-top"><ThemeToggle labelled /></header>

      <main className="auth-main">
        <Link to="/" className="auth-brand"><span className="brand-mark" aria-hidden="true">✓</span><span>MockDesk</span></Link>
        <div className="auth-card">
          <nav className="auth-switch-tabs" aria-label="Account">
            <Link to="/login" className={!reg ? 'on' : ''} aria-current={!reg ? 'page' : undefined}>Sign in</Link>
            <Link to="/register" className={reg ? 'on' : ''} aria-current={reg ? 'page' : undefined}>Create account</Link>
          </nav>
          <h1>{reg ? 'Start practising today' : 'Welcome back'}</h1>
          <p className="auth-sub">{reg ? 'Create a free account and take your first mock in minutes.' : 'Pick up your preparation right where you left off.'}</p>

          {!reg && (
            <div className="auth-tabs" role="tablist" aria-label="Sign-in method">
              {[['otp', 'One-time code'], ['password', 'Password']].map(([k, l]) => (
                <button type="button" role="tab" aria-selected={method === k} key={k} className={method === k ? 'on' : ''} onClick={() => { setMethod(k); reset(); }}>{l}</button>
              ))}
            </div>
          )}

          {err && <div className="alert" role="alert">{err}{!reg && /No account found/.test(err) && <> <Link to="/register">Sign up →</Link></>}</div>}

          {otpMode ? (
            <form onSubmit={sentTo ? verifyCode : sendCode} noValidate>
              <label>Mobile number or email
                <span className={`fld${channel === 'sms' && ident.trim() ? ' phone' : ''}`}>
                  {channel === 'sms' && ident.trim() && <b aria-hidden="true">+91</b>}
                  <input autoFocus type="text" inputMode={channel === 'sms' && ident.trim() ? 'numeric' : 'email'} autoComplete="username" autoCapitalize="none" spellCheck="false" value={ident} onChange={(e) => setIdent(e.target.value)} placeholder="98765 43210 or you@example.com" disabled={!!sentTo} />
                </span>
              </label>
              {sentTo ? (
                <>
                  <div className="auth-sent" role="status">Code sent to <b>{sentTo}</b> <button type="button" className="linklike" onClick={reset}>Change</button></div>
                  {!exists && (
                    <div className="auth-new" role="status">
                      <p><b>New here?</b> There is no account for this yet. Enter your name to create one, or <Link to="/register">sign up</Link> instead.</p>
                      <label>Your full name<input ref={nameRef} autoComplete="name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Your name" maxLength={80} /></label>
                    </div>
                  )}
                  <CodeBoxes value={code} onChange={setCode} inputRef={codeRef} />
                  <button className="auth-submit" disabled={busy || code.length !== 6}>{busy ? 'Verifying…' : exists ? 'Verify and continue' : 'Verify and create account'}</button>
                  <p className="alt">{wait > 0 ? <span>Resend code in {wait}s</span> : <button type="button" className="linklike" onClick={sendCode} disabled={busy}>Resend code</button>}</p>
                </>
              ) : (
                <>
                  <button className="auth-submit" disabled={busy || !ident.trim()}>{busy ? 'Sending…' : 'Send code'}</button>
                  <p className="alt">New here? You’ll be asked for your name, or <Link to="/register">sign up</Link> directly.</p>
                </>
              )}
            </form>
          ) : (
            <form onSubmit={submit} noValidate>
              {reg && <label>Full name<input autoFocus autoComplete="name" value={f.name} onChange={set('name')} placeholder="Your name" required /></label>}
              <label>Email<input autoFocus={!reg} type="email" autoComplete="email" value={f.email} onChange={set('email')} placeholder="you@example.com" required /></label>
              <label>Password
                <span className="pw"><input type={show ? 'text' : 'password'} autoComplete={reg ? 'new-password' : 'current-password'} value={f.password} onChange={set('password')} placeholder={reg ? 'At least 8 characters' : 'Your password'} required minLength={8} /><button type="button" className="pw-toggle" onClick={() => setShow(!show)} aria-pressed={show}>{show ? 'Hide' : 'Show'}</button></span>
              </label>
              <button className="auth-submit" disabled={busy}>{busy ? 'Please wait…' : reg ? 'Create account' : 'Sign in'}</button>
              {reg && <p className="alt">Prefer no password? <Link to="/login">Sign in with a one-time code</Link></p>}
            </form>
          )}
        </div>
        <ul className="auth-trust" aria-label="What you get">
          <li>5 full-length mocks</li><li>750 questions</li><li>Solutions for every question</li>
        </ul>
      </main>
    </div>
  );
}
