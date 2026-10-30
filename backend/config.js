import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import crypto from 'node:crypto';
export const HOME = os.homedir();
export const DATA = process.env.HYDRA_HOME || path.join(HOME, '.hydradl');
fs.mkdirSync(DATA, { recursive: true, mode: 0o700 });
const file = path.join(DATA, 'config.json');
const sharedDl = path.join(HOME, 'storage', 'downloads');
const base = fs.existsSync(sharedDl) ? sharedDl : path.join(HOME, 'Downloads');
const defaults = {
  port: 6810, rpcPort: 6800,
  token: crypto.randomBytes(24).toString('base64url'),
  rpcSecret: crypto.randomBytes(24).toString('base64url'),
  downloadDir: path.join(base, 'HydraDL'),
  roots: [base],
  origins: [],   // extra allowed web origins, e.g. your Vercel URL
  settings: { connections: 4, maxConcurrent: 3, downloadLimit: 0, uploadLimit: 0, retries: 5, retryDelay: 5, autoResume: true }
};
let loaded = {}; try { loaded = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
export const cfg = { ...defaults, ...loaded, settings: { ...defaults.settings, ...(loaded.settings || {}) } };
export function saveCfg() {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}
if (!fs.existsSync(file)) saveCfg();
