import { spawn } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path';
import { cfg, DATA } from './config.js';
const session = path.join(DATA, 'aria2.session'), conf = path.join(DATA, 'aria2.conf'), logf = path.join(DATA, 'aria2.log');
export const engine = { child: null, error: '', stopping: false, restarts: 0 };
export async function rpc(method, params = []) {
  let r;
  try {
    r = await fetch(`http://127.0.0.1:${cfg.rpcPort}/jsonrpc`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'h', method: 'aria2.' + method, params: ['token:' + cfg.rpcSecret, ...params] }), signal: AbortSignal.timeout(6000) });
  } catch { throw Object.assign(new Error('Download engine is not responding.'), { engineDown: true }); }
  const j = await r.json().catch(() => ({}));
  if (j.error) throw Object.assign(new Error(j.error.message), { rpc: true });
  return j.result;
}
export async function alive() { try { await rpc('getVersion'); return true; } catch { return false; } }
export async function startEngine() {
  if (await alive()) return; // already running (e.g. after a bridge restart)
  if (!fs.existsSync(session)) fs.writeFileSync(session, '');
  const s = cfg.settings;
  // Secret lives in a 0600 config file so it never shows up in `ps`.
  fs.writeFileSync(conf, [
    'enable-rpc=true', `rpc-listen-port=${cfg.rpcPort}`, 'rpc-listen-all=false', 'rpc-allow-origin-all=false', `rpc-secret=${cfg.rpcSecret}`,
    `save-session=${session}`, `input-file=${session}`, 'save-session-interval=15', 'auto-save-interval=15',
    'continue=true', 'auto-file-renaming=true', 'allow-overwrite=false', 'file-allocation=none', 'disk-cache=16M',
    `max-concurrent-downloads=${s.maxConcurrent}`, `max-connection-per-server=${s.connections}`, `split=${s.connections}`, 'min-split-size=1M',
    `max-tries=${s.retries}`, `retry-wait=${s.retryDelay}`, 'check-certificate=true', `dir=${cfg.downloadDir}`,
    'console-log-level=warn', `log=${logf}`, 'summary-interval=0', 'disable-ipv6=false'
  ].join('\n') + '\n', { mode: 0o600 });
  fs.mkdirSync(cfg.downloadDir, { recursive: true });
  const child = spawn('aria2c', [`--conf-path=${conf}`], { stdio: 'ignore' });
  engine.child = child; engine.error = '';
  child.on('error', e => { engine.error = e.code === 'ENOENT' ? 'aria2c is not installed. Run: pkg install aria2' : 'aria2c failed to start.'; engine.child = null; engine.fatal = e.code === 'ENOENT'; });
  child.on('exit', code => {
    engine.child = null;
    if (engine.stopping || engine.fatal) return;
    engine.error = `Download engine stopped (code ${code}). Restarting...`;
    setTimeout(() => startEngine().catch(() => {}), Math.min(30000, 2000 * ++engine.restarts));
  });
}
export async function stopEngine() {
  engine.stopping = true;
  try { await rpc('shutdown'); } catch { engine.child?.kill('SIGTERM'); }
}
