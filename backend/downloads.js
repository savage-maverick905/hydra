import fs from 'node:fs'; import path from 'node:path';
import { rpc, engine } from './aria2.js'; import { cfg, DATA } from './config.js';
import { safeName, validateUrl, clamp, ApiError } from './security.js'; import { resolveDir, resolveFile, exists } from './filesystem.js';
const recFile = path.join(DATA, 'records.json');
let records = {}; try { records = JSON.parse(fs.readFileSync(recFile, 'utf8')); } catch {}
let dirty = false; export let histVer = 1;
const touch = () => { dirty = true; histVer++; };
export function flush() { if (!dirty) return; fs.writeFileSync(recFile + '.tmp', JSON.stringify(records)); fs.renameSync(recFile + '.tmp', recFile); dirty = false; }
setInterval(flush, 3000).unref();
const KEYS = ['gid', 'status', 'totalLength', 'completedLength', 'downloadSpeed', 'files', 'errorCode', 'errorMessage', 'dir'];
const STATUS = { active: 'downloading', waiting: 'waiting', paused: 'paused', complete: 'completed', error: 'failed', removed: 'removed' };
const UA = 'Mozilla/5.0 (Linux; Android 14) HydraDL/1.0';
const ERR = { 1: 'Download failed for an unknown reason.', 2: 'The server took too long to respond.', 3: 'File not found on the server (404).', 5: 'Download was too slow and was stopped.', 6: 'Network problem. Check your internet connection.', 7: 'Download was interrupted.', 8: 'This server does not support resuming.', 9: 'Not enough storage space.', 10: 'Not enough storage space.', 11: 'Another download uses the same file.', 12: 'Another download uses the same file.', 13: 'A file with this name already exists.', 15: 'Could not open the file for writing.', 16: 'Could not open the file for writing.', 17: 'Could not write the file. Check storage permission.', 19: 'Could not find that server (DNS error).', 22: 'The server rejected the request. Retry with a single connection.', 24: 'The server requires a login.', 25: 'Download could not be parsed.', 28: 'Invalid download options.' };
export let snapshot = { engine: false, items: [], stat: {} };
const toDto = t => {
  const p = t.files?.[0]?.path || '', r = records[t.gid] || {};
  const size = +t.totalLength, done = +t.completedLength, speed = +t.downloadSpeed;
  return { id: t.gid, filename: path.basename(p) || r.filename || 'download', url: r.url || t.files?.[0]?.uris?.[0]?.uri || '', dir: t.dir, path: p, size, done, speed,
    eta: speed > 0 && size > done ? Math.ceil((size - done) / speed) : null, progress: size ? done / size * 100 : 0,
    status: STATUS[t.status] || t.status, error: t.status === 'error' ? (ERR[t.errorCode] || t.errorMessage || ERR[1]) : null,
    priority: r.priority || 'normal', connections: r.connections, started: r.started };
};
export async function sync() {
  try {
    const [a, w, s, g] = await Promise.all([rpc('tellActive', [KEYS]), rpc('tellWaiting', [0, 1000, KEYS]), rpc('tellStopped', [0, 300, KEYS]), rpc('getGlobalStat')]);
    const live = [];
    for (const t of [...a, ...w, ...s]) {
      const d = toDto(t), r = records[d.id] || (records[d.id] = { id: d.id, url: d.url, started: Date.now(), connections: cfg.settings.connections, priority: 'normal' });
      const was = r.status;
      Object.assign(r, { filename: d.filename, dir: d.dir, path: d.path, size: d.size || r.size || 0, status: d.status, error: d.error || undefined });
      if (was !== d.status) touch();
      if (['completed', 'failed', 'removed'].includes(d.status)) {
        if (!r.completed) { r.completed = Date.now(); touch(); }
        if (d.status !== 'failed') { await rpc('removeDownloadResult', [d.id]).catch(() => {}); continue; }
      }
      live.push(d);
    }
    snapshot = { engine: true, items: live, stat: { active: +g.numActive, waiting: +g.numWaiting, speed: +g.downloadSpeed } };
  } catch (e) { snapshot = { engine: false, items: snapshot.items, stat: snapshot.stat, error: engine.error || e.message }; }
}
setInterval(sync, 2000).unref();
export const history = () => Object.values(records).filter(r => r.status && !['downloading', 'waiting', 'paused'].includes(r.status))
  .map(r => ({ ...r, duration: r.completed && r.started ? r.completed - r.started : null })).sort((a, b) => (b.completed || 0) - (a.completed || 0));
export const totalBytes = () => Object.values(records).filter(r => r.status === 'completed').reduce((n, r) => n + (r.size || 0), 0);
export const completedCount = () => Object.values(records).filter(r => r.status === 'completed').length;
export async function add({ url, filename, dir, connections, priority }) {
  url = validateUrl(url); const s = cfg.settings;
  const d = await resolveDir(dir || cfg.downloadDir), c = clamp(connections, 1, 16, s.connections);
  const opt = { dir: d, 'max-connection-per-server': String(c), split: String(c), 'min-split-size': '1M', 'max-tries': String(s.retries), 'retry-wait': String(s.retryDelay),
    continue: 'true', 'auto-file-renaming': 'true', 'allow-overwrite': 'false', 'user-agent': UA };
  if (filename) opt.out = safeName(filename);
  const params = [[url], opt]; if (priority === 'high') params.push(0);
  const gid = await rpc('addUri', params).catch(e => { throw e.engineDown ? new ApiError(503, 'Download engine is not running.') : new ApiError(400, e.message); });
  records[gid] = { id: gid, url, filename: opt.out || '', dir: d, started: Date.now(), connections: c, priority: priority || 'normal', status: 'waiting' }; touch();
  sync(); return gid;
}
const find = id => { const i = snapshot.items.find(x => x.id === id); return i; };
async function safe(fn) { try { return await fn(); } catch (e) { if (e.engineDown) throw new ApiError(503, 'Download engine is not running.'); throw new ApiError(400, e.message); } }
export const pause = id => safe(() => rpc('forcePause', [id])).then(sync);
export const resume = id => safe(() => rpc('unpause', [id])).then(sync);
export const pauseAll = () => safe(() => rpc('forcePauseAll')).then(sync);
export const resumeAll = () => safe(() => rpc('unpauseAll')).then(sync);
export async function remove(id, force) {
  const it = find(id);
  if (it && ['downloading', 'waiting', 'paused'].includes(it.status)) await safe(() => rpc(force ? 'forceRemove' : 'remove', [id]));
  await rpc('removeDownloadResult', [id]).catch(() => {});
  // delete the partial file + control file, only if inside permitted folders
  if (it?.path && it.status !== 'completed') for (const f of [it.path, it.path + '.aria2']) { try { await fs.promises.unlink(await resolveFile(f)); } catch {} }
  const r = records[id]; if (r) { r.status = 'removed'; r.completed = r.completed || Date.now(); touch(); }
  await sync();
}
export async function retry(id) { // falls back to ONE connection: fixes servers that reject segmented requests
  const r = records[id]; if (!r) throw new ApiError(404, 'Unknown download.');
  await rpc('removeDownloadResult', [id]).catch(() => {}); delete records[id]; touch();
  return add({ url: r.url, filename: r.filename, dir: r.dir, connections: 1, priority: r.priority });
}
export async function redownload(id) { const r = records[id]; if (!r) throw new ApiError(404, 'Unknown download.'); return add({ url: r.url, dir: r.dir, connections: r.connections, priority: r.priority }); }
export async function setPriority(id, p) {
  if (!['high', 'normal', 'low'].includes(p)) throw new ApiError(400, 'Invalid priority.');
  if (records[id]) { records[id].priority = p; touch(); }
  if (p === 'high') await safe(() => rpc('changePosition', [id, 0, 'POS_SET'])); if (p === 'low') await safe(() => rpc('changePosition', [id, 0, 'POS_END']));
  await sync();
}
export async function move(id, dir) { await safe(() => rpc('changePosition', [id, dir === 'up' ? -1 : 1, 'POS_CUR'])); await sync(); }
export function clearHistory() { for (const [k, r] of Object.entries(records)) if (!['downloading', 'waiting', 'paused'].includes(r.status) && !find(k)) delete records[k]; touch(); flush(); }
export function deleteRecord(id) { if (!find(id)) { delete records[id]; touch(); } }
export async function applySettings() {
  const s = cfg.settings;
  await rpc('changeGlobalOption', [{ 'max-concurrent-downloads': String(s.maxConcurrent), 'max-overall-download-limit': s.downloadLimit ? s.downloadLimit + 'K' : '0', 'max-overall-upload-limit': s.uploadLimit ? s.uploadLimit + 'K' : '0' }]).catch(() => {});
}
export async function probe(url, dir) {
  url = validateUrl(url); let res;
  try { res = await fetch(url, { method: 'HEAD', redirect: 'follow', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(8000) }); if (!res.ok) throw 0; }
  catch { try { res = await fetch(url, { headers: { 'user-agent': UA, range: 'bytes=0-0' }, redirect: 'follow', signal: AbortSignal.timeout(8000) }); res.body?.cancel(); }
    catch { throw new ApiError(502, 'Could not reach that server. Check the link and your connection.'); } }
  if (res.status >= 400) throw new ApiError(502, `The server answered with an error (${res.status}).`);
  const h = res.headers, cd = h.get('content-disposition') || '';
  let name = (cd.match(/filename\*\s*=\s*UTF-8''([^;]+)/i) || [])[1]; if (name) try { name = decodeURIComponent(name); } catch {}
  name ||= (cd.match(/filename\s*=\s*"?([^";]+)"?/i) || [])[1];
  name ||= decodeURIComponent(new URL(res.url).pathname.split('/').pop() || '') || 'download';
  name = name.replace(/[\/\\\x00-\x1f]/g, '_').replace(/^\.+/, '').slice(0, 200) || 'download';
  const range = h.get('content-range'), size = range ? +range.split('/')[1] : +h.get('content-length') || 0;
  let taken = false; try { taken = await exists(path.join(await resolveDir(dir || cfg.downloadDir), name)); } catch {}
  return { filename: name, size, acceptRanges: res.status === 206 || /bytes/i.test(h.get('accept-ranges') || ''), finalUrl: res.url, exists: taken };
}
