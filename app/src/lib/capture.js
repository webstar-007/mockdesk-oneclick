// Invite links look like /?ref=ABC123 (friend invite) or /?batch=XYZ789 (coaching batch). Keep the code until the person signs up or in.
const read = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const write = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* storage blocked */ } };
export function captureInvite() {
  try {
    const q = new URLSearchParams(window.location.search);
    const ref = (q.get('ref') || '').trim().toUpperCase().slice(0, 12); const batch = (q.get('batch') || '').trim().toUpperCase().slice(0, 12);
    if (ref) write('mockdesk-ref', ref); if (batch) write('mockdesk-batch', batch);
    if (ref || batch) { q.delete('ref'); q.delete('batch'); const s = q.toString(); window.history.replaceState(null, '', window.location.pathname + (s ? `?${s}` : '') + window.location.hash); }
  } catch { /* ignore */ }
}
export const pendingRef = () => read('mockdesk-ref');
export const clearRef = () => write('mockdesk-ref', '');
export const pendingBatch = () => read('mockdesk-batch');
export const clearBatch = () => write('mockdesk-batch', '');
