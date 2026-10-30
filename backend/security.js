import crypto from 'node:crypto'; import { cfg } from './config.js';
export class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
let fails = []; // timestamps of recent auth failures
export function authOk(req, url) {
  const now = Date.now(); fails = fails.filter(t => now - t < 60000);
  if (fails.length >= 20) throw new ApiError(429, 'Too many failed attempts. Wait a minute and try again.');
  const h = req.headers.authorization || '';
  let t = h.startsWith('Bearer ') ? h.slice(7) : (url.pathname === '/api/file' ? url.searchParams.get('token') || '' : '');
  const a = Buffer.from(t), b = Buffer.from(cfg.token);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) fails.push(now);
  return ok;
}
export function hostOk(req) { // blocks DNS-rebinding style requests
  const h = (req.headers.host || '').toLowerCase();
  return [`127.0.0.1:${cfg.port}`, `localhost:${cfg.port}`].includes(h);
}
export function validateUrl(u) {
  let x; try { x = new URL(String(u).trim()); } catch { throw new ApiError(400, 'That does not look like a valid link.'); }
  if (!['http:', 'https:'].includes(x.protocol)) throw new ApiError(400, 'Only http:// and https:// links are supported.');
  return x.href;
}
export function safeName(n) {
  n = String(n ?? '').replace(/[\x00-\x1f]/g, '').trim();
  if (!n || n.length > 200 || /[\/\\]/.test(n) || n === '.' || n === '..' || n.startsWith('.'))
    throw new ApiError(400, 'That filename is not allowed. Avoid slashes and leading dots.');
  return n;
}
export const clamp = (v, lo, hi, d) => { v = Math.round(Number(v)); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
