import { useEffect, useRef } from 'react';
export default function Modal({ title, children, actions, onClose, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.querySelector('button')?.focus();
    const key = (e) => { if (e.key === 'Escape') onClose?.(); if (e.key === 'Tab') { const f = ref.current?.querySelectorAll('button,[href],input,select,textarea'); if (!f?.length) return; const a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } } };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <h2>{title}</h2><div className="modal-body">{children}</div><div className="modal-actions">{actions}</div>
      </div>
    </div>
  );
}
