import { useTheme } from '../lib/theme.js';
/** Default: compact switch for the header. `labelled`: clear Light / Dark pill for the sign-in page. */
export default function ThemeToggle({ className = '', labelled = false }) {
  const [theme, toggle, choose] = useTheme(); const dark = theme === 'dark';
  if (labelled) {
    return (
      <div className={`theme-seg ${className}`} role="group" aria-label="Colour theme">
        <button type="button" className={!dark ? 'on' : ''} aria-pressed={!dark} onClick={() => choose('light')}><span aria-hidden="true">☀</span> Light</button>
        <button type="button" className={dark ? 'on dk' : ''} aria-pressed={dark} onClick={() => choose('dark')}><span aria-hidden="true">☾</span> Dark</button>
      </div>
    );
  }
  return (
    <button type="button" className={`theme-toggle ${className}`} onClick={toggle} role="switch" aria-checked={dark} aria-label="Dark mode" title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
      <span className="tt-track" aria-hidden="true"><span className="tt-knob">{dark ? '☾' : '☀'}</span></span>
    </button>
  );
}
