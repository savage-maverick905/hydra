const K = 'hydradl.conf';
export const conf = Object.assign({ bridge: '', token: '', theme: 'dark', notify: false, name: 'default' }, JSON.parse(localStorage.getItem(K) || '{}'));
export const save = () => localStorage.setItem(K, JSON.stringify(conf));
export const isLocal = ['127.0.0.1', 'localhost'].includes(location.hostname);
export const base = () => (conf.bridge || (isLocal ? '' : 'http://127.0.0.1:6810')).replace(/\/$/, '');
// Pairing link support: /#token=XXX or /#token=XXX&bridge=http://127.0.0.1:6810
(() => { const h = new URLSearchParams(location.hash.slice(1)); if (h.get('token')) { conf.token = h.get('token'); if (h.get('bridge')) conf.bridge = h.get('bridge'); save(); history.replaceState(null, '', location.pathname); } })();
export class ApiErr extends Error { constructor(m, code) { super(m); this.code = code; } }
export async function call(path, method = 'GET', body) {
  let r;
  try { r = await fetch(base() + path, { method, headers: { authorization: 'Bearer ' + conf.token, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' }); }
  catch { throw new ApiErr('Cannot reach the HydraDL bridge. Is it running in Termux?', 'offline'); }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) throw new ApiErr(j.error || 'Not paired.', 'auth');
  if (!r.ok) throw new ApiErr(j.error || 'Request failed.', r.status);
  return j;
}
export const get = p => call(p), post = (p, b = {}) => call(p, 'POST', b), put = (p, b) => call(p, 'PUT', b), del = (p, b) => call(p, 'DELETE', b);
export async function health() { try { const r = await fetch(base() + '/api/health', { cache: 'no-store' }); return r.ok; } catch { return false; } }
