import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { spawn } from 'node:child_process'; import { fileURLToPath } from 'node:url';
import { cfg, saveCfg, DATA } from './config.js'; import { authOk, hostOk, ApiError, clamp } from './security.js';
import * as fsx from './filesystem.js'; import * as dl from './downloads.js'; import { startEngine, stopEngine, rpc, engine } from './aria2.js';
const here = path.dirname(fileURLToPath(import.meta.url));
const WEB = [path.join(here, '..', 'frontend'), path.join(here, 'frontend')].find(p => fs.existsSync(p));
if (process.argv.includes('--init')) { console.log(JSON.stringify({ token: cfg.token, port: cfg.port, downloadDir: cfg.downloadDir })); process.exit(0); }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const json = (res, code, obj, h = {}) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', ...h }); res.end(JSON.stringify(obj)); };
const body = req => new Promise((ok, no) => { let b = ''; req.on('data', c => { b += c; if (b.length > 1e5) { req.destroy(); no(new ApiError(413, 'Request too large.')); } }); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch { no(new ApiError(400, 'Invalid request.')); } }); });
const run = (cmd, args) => new Promise((ok, no) => { const c = spawn(cmd, args, { stdio: 'ignore' }); c.on('error', () => no(new ApiError(501, `${cmd} is not available. Run: pkg install termux-tools termux-api`))); c.on('exit', () => ok()); });
async function disk() { try { const s = await fs.promises.statfs(cfg.downloadDir); return { free: s.bavail * s.bsize, total: s.blocks * s.bsize }; } catch { return null; } }
async function api(req, res, url, cors) {
  const m = req.method, p = url.pathname, seg = p.split('/').filter(Boolean); // ['api', ...]
  if (p === '/api/health') return json(res, 200, { ok: true, app: 'hydradl', version: '1.0.0' }, cors);
  if (!authOk(req, url)) return json(res, 401, { error: 'Pairing token is missing or wrong.' }, cors);
  const send = (o = { ok: true }) => json(res, 200, o, cors);
  if (p === '/api/status') return send({ version: '1.0.0', engine: snapshotOnline(), engineError: engine.error, downloadDir: cfg.downloadDir, roots: cfg.roots, disk: await disk(), settings: cfg.settings });
  if (p === '/api/downloads' && m === 'GET') { const s = dl.snapshot; return send({ engine: s.engine, engineError: s.engine ? '' : (s.error || engine.error), items: s.items, stat: { ...s.stat, completed: dl.completedCount(), totalBytes: dl.totalBytes() }, histVer: dl.histVer }); }
  if (p === '/api/downloads' && m === 'POST') { const b = await body(req); return send({ id: await dl.add(b) }); }
  if (p === '/api/downloads/pause-all') { await dl.pauseAll(); return send(); }
  if (p === '/api/downloads/resume-all') { await dl.resumeAll(); return send(); }
  if (seg[1] === 'downloads' && seg[2] && m === 'POST') {
    const id = seg[2], b = await body(req);
    switch (seg[3]) {
      case 'pause': await dl.pause(id); return send(); case 'resume': await dl.resume(id); return send();
      case 'remove': await dl.remove(id, !!b.force); return send(); case 'retry': return send({ id: await dl.retry(id) });
      case 'redownload': return send({ id: await dl.redownload(id) });
      case 'priority': await dl.setPriority(id, b.priority); return send(); case 'move': await dl.move(id, b.dir); return send();
    }
  }
  if (p === '/api/probe' && m === 'POST') { const b = await body(req); return send(await dl.probe(b.url, b.dir)); }
  if (p === '/api/history' && m === 'GET') return send({ items: dl.history(), histVer: dl.histVer });
  if (p === '/api/history' && m === 'DELETE') { dl.clearHistory(); return send(); }
  if (seg[1] === 'history' && seg[2] && m === 'DELETE') { dl.deleteRecord(seg[2]); return send(); }
  if (p === '/api/fs' && m === 'GET') return send(await fsx.list(url.searchParams.get('dir') || cfg.downloadDir));
  if (p === '/api/fs/mkdir' && m === 'POST') { const b = await body(req); return send({ dir: await fsx.mkdir(b.dir, b.name) }); }
  if (p === '/api/fs' && m === 'DELETE') { const b = await body(req); await fsx.remove(b.path); return send(); }
  if (p === '/api/open' && m === 'POST') { const b = await body(req); await run('termux-open', [await fsx.resolveFile(b.path)]); return send(); }
  if (p === '/api/share' && m === 'POST') { const b = await body(req); await run('termux-share', ['-a', 'send', await fsx.resolveFile(b.path)]); return send(); }
  if (p === '/api/file' && m === 'GET') {
    const f = await fsx.resolveFile(url.searchParams.get('path')), s = await fs.promises.stat(f);
    res.writeHead(200, { 'content-length': s.size, 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(f))}` }); return fs.createReadStream(f).pipe(res);
  }
  if (p === '/api/settings' && m === 'PUT') {
    const b = await body(req), s = cfg.settings;
    s.connections = clamp(b.connections, 1, 16, s.connections); s.maxConcurrent = clamp(b.maxConcurrent, 1, 10, s.maxConcurrent);
    s.downloadLimit = clamp(b.downloadLimit, 0, 1e7, s.downloadLimit); s.uploadLimit = clamp(b.uploadLimit, 0, 1e7, s.uploadLimit);
    s.retries = clamp(b.retries, 0, 20, s.retries); s.retryDelay = clamp(b.retryDelay, 0, 300, s.retryDelay); if ('autoResume' in b) s.autoResume = !!b.autoResume;
    if (b.downloadDir) cfg.downloadDir = await fsx.resolveDir(b.downloadDir);
    saveCfg(); await dl.applySettings(); return send({ settings: s, downloadDir: cfg.downloadDir });
  }
  throw new ApiError(404, 'Unknown request.');
}
const snapshotOnline = () => dl.snapshot.engine;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), origin = req.headers.origin;
  const cors = origin && cfg.origins.includes(origin) ? { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS', 'access-control-allow-private-network': 'true', vary: 'Origin' } : {};
  try {
    if (!hostOk(req)) return json(res, 403, { error: 'Bad host.' });
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    if (url.pathname.startsWith('/api/')) return await api(req, res, url, cors);
    if (!WEB) return json(res, 404, { error: 'Frontend not bundled. Use the Vercel app.' });
    let f = path.normalize(path.join(WEB, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname)));
    if (!f.startsWith(WEB + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(WEB, 'index.html');
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': f.endsWith('service-worker.js') ? 'no-cache' : 'public, max-age=300' });
    fs.createReadStream(f).pipe(res);
  } catch (e) {
    const code = e instanceof ApiError ? e.status : 500; if (code === 500) console.error(e);
    if (!res.headersSent) json(res, code, { error: code === 500 ? 'Something went wrong in the bridge.' : e.message }, cors);
  }
});
server.listen(cfg.port, '127.0.0.1', async () => {
  console.log(`HydraDL bridge on http://127.0.0.1:${cfg.port}`);
  await startEngine(); await new Promise(r => setTimeout(r, 1200)); await dl.sync(); await dl.applySettings();
  if (!cfg.settings.autoResume) await rpc('pauseAll').catch(() => {});
});
server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? 'Port already in use. Is HydraDL already running? (./scripts/status.sh)' : e); process.exit(1); });
let bye = false; const shutdown = async () => { if (bye) return; bye = true; dl.flush(); await stopEngine(); server.close(); setTimeout(() => process.exit(0), 800); };
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
