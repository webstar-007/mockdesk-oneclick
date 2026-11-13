import { useCallback, useEffect, useState } from 'react';
const KEY = 'mockdesk-theme';
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const system = () => (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
export const currentTheme = () => document.documentElement.dataset.theme || read() || system();
const apply = (t) => { document.documentElement.dataset.theme = t; };
/** Light/dark theme. A saved choice wins; otherwise the device setting is followed. */
export function useTheme() {
  const [theme, setT] = useState(currentTheme);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const on = () => { if (!read()) { const t = system(); apply(t); setT(t); } };
    mq?.addEventListener?.('change', on); return () => mq?.removeEventListener?.('change', on);
  }, []);
  const toggle = useCallback(() => {
    const t = currentTheme() === 'dark' ? 'light' : 'dark';
    apply(t); setT(t); try { localStorage.setItem(KEY, t); } catch { /* storage blocked */ }
  }, []);
  /** choice: 'light' | 'dark' | 'system' */
  const choose = useCallback((c) => {
    if (c === 'system') { try { localStorage.removeItem(KEY); } catch { /* storage blocked */ } const t = system(); apply(t); setT(t); return; }
    apply(c); setT(c); try { localStorage.setItem(KEY, c); } catch { /* storage blocked */ }
  }, []);
  return [theme, toggle, choose];
}

export const savedChoice = () => read() || 'system';
