import fs from 'node:fs'; import path from 'node:path'; import { cfg } from './config.js'; import { ApiError } from './security.js';
const P = fs.promises;
const inside = (p, roots) => roots.some(r => p === r || p.startsWith(r + path.sep));
async function realRoots() {
  const out = [];
  for (const r of cfg.roots) { try { await P.mkdir(r, { recursive: true }); out.push(await P.realpath(r)); } catch {} }
  return out;
}
const lexRoots = () => cfg.roots.map(r => path.resolve(r));
// Resolve a directory the caller is allowed to use (creates it when missing).
export async function resolveDir(d, create = true) {
  const abs = path.resolve(String(d || cfg.downloadDir));
  if (!inside(abs, lexRoots())) throw new ApiError(403, 'That folder is outside the permitted download folders.');
  try { if (create) await P.mkdir(abs, { recursive: true }); } catch (e) { throw fsErr(e); }
  let real; try { real = await P.realpath(abs); } catch (e) { throw fsErr(e); }
  if (!inside(real, await realRoots())) throw new ApiError(403, 'That folder is outside the permitted download folders.');
  return real;
}
export async function resolveFile(f) {
  const abs = path.resolve(String(f || ''));
  let real; try { real = await P.realpath(abs); } catch (e) { throw fsErr(e); }
  if (!inside(real, await realRoots())) throw new ApiError(403, 'That file is outside the permitted download folders.');
  return real;
}
export function fsErr(e) {
  if (e instanceof ApiError) return e;
  if (e.code === 'ENOENT') return new ApiError(404, 'That file or folder no longer exists.');
  if (e.code === 'EACCES' || e.code === 'EPERM') return new ApiError(403, 'Permission denied. Run "termux-setup-storage" and allow storage access.');
  if (e.code === 'ENOSPC') return new ApiError(507, 'Not enough storage space.');
  return new ApiError(500, 'File system error.');
}
export async function list(dir) {
  const d = await resolveDir(dir, false); const roots = await realRoots();
  let names; try { names = await P.readdir(d); } catch (e) { throw fsErr(e); }
  const entries = [];
  for (const name of names) {
    if (name.startsWith('.') || name.endsWith('.aria2')) continue;
    try { const s = await P.stat(path.join(d, name));
      entries.push({ name, isDir: s.isDirectory(), size: s.isDirectory() ? 0 : s.size, mtime: s.mtimeMs, ext: path.extname(name).slice(1).toLowerCase() });
    } catch {}
  }
  return { dir: d, parent: roots.includes(d) ? null : path.dirname(d), roots, entries };
}
export async function mkdir(dir, name) {
  if (!name || /[\/\\]/.test(name) || name.startsWith('.') || name.length > 100) throw new ApiError(400, 'Invalid folder name.');
  const d = await resolveDir(path.join(await resolveDir(dir, false), name)); return d;
}
export async function remove(file) {
  const f = await resolveFile(file);
  try { const s = await P.stat(f); if (s.isDirectory()) throw new ApiError(400, 'Only files can be deleted here.'); await P.unlink(f); }
  catch (e) { throw fsErr(e); }
}
export const exists = async p => P.access(p).then(() => true, () => false);
