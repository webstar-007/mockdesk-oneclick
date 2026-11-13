export class ApiError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}
async function req(method, url, body) {
  let res;
  try {
    res = await fetch('/api' + url, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  } catch { throw new ApiError('Network problem. Check your connection.', 0, 'NETWORK'); }
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data?.code);
  return data;
}
async function upload(file) {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new ApiError('Choose a PNG, JPG, WebP or GIF image', 0);
  if (file.size > 4 * 1024 * 1024) throw new ApiError('Image is larger than 4 MB', 0);
  const res = await fetch('/api/admin/upload', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': file.type }, body: file });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'Upload failed', res.status);
  return data.url;
}
export const api = {
  del: (u, b) => req('DELETE', u, b), upload,
  get: (u) => req('GET', u), post: (u, b) => req('POST', u, b ?? {}), put: (u, b) => req('PUT', u, b), patch: (u, b) => req('PATCH', u, b),
};
