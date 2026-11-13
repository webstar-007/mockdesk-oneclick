// In-memory log of recent server problems for the admin System page. Cleared when the server restarts
// (the full history is in the service log: journalctl -u mockdesk).
const MAX = 100;
const items = [];
export const startedAt = Date.now();
export function recordError(source, message) {
  items.unshift({ at: Date.now(), source: String(source).slice(0, 40), message: String(message || '').slice(0, 300) });
  if (items.length > MAX) items.length = MAX;
}
export const recentErrors = () => items.slice();
export const clearErrors = () => { items.length = 0; };
