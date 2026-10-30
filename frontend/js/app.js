import { ic, extBadge } from './icons.js'; import * as api from './api.js'; import * as db from './db.js';
const $ = s => document.querySelector(s), esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bytes = n => { if (!n) return '0 B'; const u = ['B', 'KB', 'MB', 'GB', 'TB'], i = Math.min(4, Math.floor(Math.log(n) / Math.log(1024))); return (n / 1024 ** i).toFixed(i ? 1 : 0) + ' ' + u[i]; };
const eta = s => s == null ? '--' : s < 60 ? s + 's' : s < 3600 ? Math.floor(s / 60) + 'm ' + s % 60 + 's' : Math.floor(s / 3600) + 'h ' + Math.floor(s % 3600 / 60) + 'm';
const when = t => t ? new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '--';
const dur = ms => ms == null ? '--' : eta(Math.round(ms / 1000));
const LBL = { downloading: 'Downloading', waiting: 'Waiting', paused: 'Paused', completed: 'Completed', failed: 'Failed', removed: 'Removed' };
const st = { view: 'home', items: [], stat: {}, engine: 'unknown', msg: '', hist: [], sel: new Set(), selMode: false, filter: 'all', hq: '', hs: 'all', hsort: 'date', fs: null, fq: '', fsort: 'name', cfg: null, ver: -1, first: true };
document.documentElement.dataset.theme = api.conf.theme;
const NAV = [['home', 'Home', 'home'], ['downloads', 'Downloads', 'download'], ['history', 'History', 'history'], ['files', 'Files', 'folder'], ['settings', 'Settings', 'settings']];
$('#bottom').innerHTML = NAV.map(([k, l, i]) => `<button data-nav="${k}">${ic(i)}<span>${l}</span></button>`).join('');
$('#side').innerHTML = `<div class="brand"><img src="icons/icon.svg" alt="">HydraDL</div>` + NAV.map(([k, l, i]) => `<button class="nav" data-nav="${k}">${ic(i)}<span>${l}</span></button>`).join('');
$('#fab').innerHTML = ic('plus') + '<span>New Download</span>';
const toast = (m, ms = 3200) => { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, ms); };
const sheet = html => { const m = $('#modal'); m.innerHTML = `<div class="sheet">${html}</div>`; m.hidden = false; };
const closeSheet = () => { $('#modal').hidden = true; $('#modal').innerHTML = ''; };
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeSheet(); });
const ask = (msg, ok = 'Delete') => new Promise(res => { sheet(`<h3>Are you sure?</h3><p class="muted">${esc(msg)}</p><div class="row gap" style="justify-content:flex-end"><button class="btn" data-c="0">Cancel</button><button class="btn pri" data-c="1">${ok}</button></div>`); $('#modal').onclick = e => { const b = e.target.closest('[data-c]'); if (b || e.target.id === 'modal') { $('#modal').onclick = null; closeSheet(); res(b?.dataset.c === '1'); } }; });
const guard = async fn => { try { return await fn(); } catch (e) { toast(e.message); if (e.code === 'auth') { st.engine = 'auth'; render(); } } };

// ---------- data ----------
async function loadHistory() {
  st.hist = await db.all(); try { const r = await api.get('/api/history'); const old = new Set(st.hist.filter(h => h.status === 'completed').map(h => h.id));
    await db.putAll(r.items); const m = new Map(st.hist.map(h => [h.id, h])); r.items.forEach(h => m.set(h.id, h)); st.hist = [...m.values()];
    if (!st.first && api.conf.notify && Notification.permission === 'granted') r.items.filter(h => h.status === 'completed' && !old.has(h.id)).forEach(h => new Notification('Download complete', { body: h.filename, icon: 'icons/icon-192.png' }));
  } catch {} st.first = false;
}
let timer; async function poll() {
  clearTimeout(timer);
  try { const d = await api.get('/api/downloads'); st.engine = d.engine ? 'online' : 'engine-down'; st.msg = d.engineError || ''; st.items = d.items; st.stat = d.stat;
    if (d.histVer !== st.ver) { st.ver = d.histVer; await loadHistory(); if (st.view === 'history') render(); }
  } catch (e) { st.engine = e.code === 'auth' ? 'auth' : 'offline'; st.msg = e.message; }
  live(); timer = setTimeout(poll, document.hidden ? 10000 : ['home', 'downloads'].includes(st.view) ? 1500 : 4000);
}
document.addEventListener('visibilitychange', () => !document.hidden && poll());

// ---------- views ----------
const engineBadge = () => { const m = { online: 'Engine connected', 'engine-down': 'Engine stopped', offline: 'Bridge offline', auth: 'Not paired', unknown: 'Connecting' }; return `<span class="badge ${st.engine}"><i class="dot"></i>${m[st.engine]}</span>`; };
const banner = () => st.engine === 'online' || st.engine === 'unknown' ? '' : `<div class="card warn">${esc(st.engine === 'auth' ? 'This app is not paired with your Termux bridge yet.' : st.msg || 'The download engine is not available.')} <button class="btn sm" data-act="setup" style="margin-top:8px">${st.engine === 'auth' ? 'Pair now' : 'How to fix'}</button></div>`;
function card(it) {
  const p = Math.min(100, it.progress).toFixed(0), sel = st.sel.has(it.id), busy = it.status === 'downloading';
  const btns = (busy ? `<button class="ib" data-act="pause" data-id="${it.id}" aria-label="Pause">${ic('pause')}</button>` : it.status === 'failed' ? `<button class="ib" data-act="retry" data-id="${it.id}" aria-label="Retry">${ic('retry')}</button>` : `<button class="ib" data-act="resume" data-id="${it.id}" aria-label="Resume">${ic('play')}</button>`)
    + `<button class="ib" data-act="info" data-id="${it.id}" aria-label="Details">${ic('info')}</button><button class="ib" data-act="cancel" data-id="${it.id}" aria-label="Cancel">${ic('x')}</button>`;
  return `<div class="card ${it.status}" ${st.selMode ? `data-act="toggle" data-id="${it.id}"` : ''}><div class="row">${st.selMode ? `<div class="ib ${sel ? 'on' : ''}">${ic(sel ? 'check' : 'select')}</div>` : ''}${extBadge(it.filename)}<div class="grow"><div class="name">${esc(it.filename)}</div><div class="muted sm">${LBL[it.status] || it.status}${it.priority === 'high' ? ' - High priority' : it.priority === 'low' ? ' - Low priority' : ''}</div></div>${st.selMode ? '' : btns}</div>
  <div class="bar"><i style="width:${p}%"></i></div><div class="row sm muted" style="justify-content:space-between"><span>${bytes(it.done)} / ${it.size ? bytes(it.size) : 'unknown size'} (${it.size ? p + '%' : '--'})</span><span>${busy ? bytes(it.speed) + '/s - ' + eta(it.eta) : ''}</span></div>
  <div class="path" style="margin-top:4px">${esc(it.dir)}</div>${it.error ? `<div class="err">${esc(it.error)}</div>` : ''}</div>`;
}
const recent = h => `<div class="card"><div class="row">${extBadge(h.filename || 'x')}<div class="grow"><div class="name">${esc(h.filename)}</div><div class="muted sm">${LBL[h.status]} - ${h.size ? bytes(h.size) + ' - ' : ''}${when(h.completed)}</div></div></div></div>`;
let stor={t:0,v:'--'};
async function homeStorage() { if (Date.now() - stor.t < 30000) return stor.v; try { const s = await api.get('/api/status'); stor = { t: Date.now(), v: s.disk ? `${bytes(s.disk.free)} free of ${bytes(s.disk.total)}` : '--' }; return stor.v; } catch { return '--'; } }
const V = {
  home: () => { const act = st.items.filter(i => i.status === 'downloading'), s = st.stat;
    return `<div class="row" style="justify-content:space-between"><h1>HydraDL</h1>${engineBadge()}</div>${banner()}
    <div class="grid"><div class="card stat"><b>${s.active ?? 0}</b><span>Active</span></div><div class="card stat"><b>${s.waiting ?? 0}</b><span>Queued</span></div>
    <div class="card stat"><b>${bytes(s.speed || 0)}/s</b><span>Overall speed</span></div><div class="card stat"><b>${s.completed ?? st.hist.filter(h => h.status === 'completed').length}</b><span>Completed</span></div>
    <div class="card stat"><b>${bytes(s.totalBytes ?? 0)}</b><span>Total downloaded</span></div><div class="card stat"><b id="stor" style="font-size:15px">...</b><span>Storage</span></div></div>
    <h2>Active downloads</h2>${act.map(card).join('') || '<div class="empty">Nothing downloading right now.</div>'}
    <h2>Recent</h2>${st.hist.slice(0, 5).map(recent).join('') || '<div class="empty">No downloads yet. Tap New Download to start.</div>'}`; },
  downloads: () => { const F = { all: () => true, active: i => i.status === 'downloading', queued: i => i.status === 'waiting', paused: i => i.status === 'paused', failed: i => i.status === 'failed' };
    const list = st.items.filter(F[st.filter]);
    return `<div class="row" style="justify-content:space-between"><h1>Downloads</h1><div class="row"><button class="ib ${st.selMode ? 'on' : ''}" data-act="selmode" aria-label="Select">${ic('select')}</button><button class="ib" data-act="pauseall" aria-label="Pause all">${ic('pause')}</button><button class="ib" data-act="resumeall" aria-label="Resume all">${ic('play')}</button></div></div>${banner()}
    <div class="chips">${Object.keys(F).map(k => `<button class="chip ${st.filter === k ? 'on' : ''}" data-act="filter" data-id="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
    ${st.selMode ? `<div class="card row gap wrap"><span class="grow sm">${st.sel.size} selected</span><button class="btn sm" data-act="bulk" data-id="pause">Pause</button><button class="btn sm" data-act="bulk" data-id="resume">Resume</button><button class="btn sm dan" data-act="bulk" data-id="cancel">Cancel</button></div>` : ''}
    ${list.map(card).join('') || '<div class="empty">No downloads here.</div>'}`; },
  history: () => `<div class="row" style="justify-content:space-between"><h1>History</h1><button class="btn sm dan" data-act="clearhist">Clear</button></div>
    <input type="text" id="hq" placeholder="Search history" value="${esc(st.hq)}"><div class="row gap" style="margin:10px 0"><select id="hs"><option value="all">All statuses</option><option value="completed">Completed</option><option value="failed">Failed</option><option value="removed">Removed</option></select><select id="hsort"><option value="date">Newest first</option><option value="size">Largest first</option></select></div><div id="hlist"></div>`,
  files: () => `<h1>Files</h1>${banner()}<input type="text" id="fq" placeholder="Search files" value="${esc(st.fq)}"><div class="row gap" style="margin:10px 0"><select id="fsort"><option value="name">Name</option><option value="date">Date</option><option value="size">Size</option></select></div><div id="flist" class="muted">Loading...</div>`,
  settings: () => settingsView()
};
function histList() {
  let l = st.hist.filter(h => (st.hs === 'all' || h.status === st.hs) && (h.filename || '').toLowerCase().includes(st.hq.toLowerCase()));
  l.sort(st.hsort === 'size' ? (a, b) => (b.size || 0) - (a.size || 0) : (a, b) => (b.completed || 0) - (a.completed || 0));
  $('#hlist').innerHTML = l.map(h => `<div class="card"><div class="row">${extBadge(h.filename || 'x')}<div class="grow"><div class="name">${esc(h.filename)}</div><div class="muted sm">${LBL[h.status]} - ${h.size ? bytes(h.size) : '--'} - ${dur(h.duration)}</div></div></div>
  <div class="path" style="margin:6px 0">${esc(h.dir || '')}<br>${when(h.started)} to ${when(h.completed)}</div>${h.error ? `<div class="err">${esc(h.error)}</div>` : ''}
  <div class="row gap wrap">${h.status === 'completed' ? `<button class="btn sm" data-act="openf" data-p="${esc(h.path)}">${ic('open', 16)}Open</button>` : ''}<button class="btn sm" data-act="redl" data-id="${h.id}">${ic('retry', 16)}Re-download</button><button class="btn sm" data-act="copyurl" data-u="${esc(h.url)}">${ic('copy', 16)}URL</button><button class="btn sm dan" data-act="delrec" data-id="${h.id}">${ic('trash', 16)}</button></div></div>`).join('') || '<div class="empty">Nothing here.</div>';
}
async function loadFiles(dir) {
  try { st.fs = await api.get('/api/fs' + (dir ? '?dir=' + encodeURIComponent(dir) : '')); } catch (e) { $('#flist') && ($('#flist').innerHTML = `<div class="empty">${esc(e.message)}</div>`); return; }
  fileList();
}
function fileList() {
  const f = st.fs, el = $('#flist'); if (!f || !el) return;
  const q = st.fq.toLowerCase(), by = { name: (a, b) => a.name.localeCompare(b.name), date: (a, b) => b.mtime - a.mtime, size: (a, b) => b.size - a.size };
  const es = f.entries.filter(e => e.name.toLowerCase().includes(q)).sort((a, b) => (b.isDir - a.isDir) || by[st.fsort](a, b));
  el.innerHTML = `<div class="row gap" style="margin-bottom:10px">${f.parent ? `<button class="ib" data-act="cd" data-p="${esc(f.parent)}" aria-label="Up">${ic('back')}</button>` : ''}<span class="path grow">${esc(f.dir)}</span></div>` +
    (es.map(e => { const p = esc(f.dir + '/' + e.name); return `<div class="card"><div class="row" ${e.isDir ? `data-act="cd" data-p="${p}"` : ''}>${e.isDir ? `<div class="ext">${ic('folder')}</div>` : extBadge(e.name)}<div class="grow"><div class="name">${esc(e.name)}</div><div class="muted sm">${e.isDir ? 'Folder' : bytes(e.size)} - ${when(e.mtime)}</div></div></div>
    ${e.isDir ? '' : `<div class="row gap wrap" style="margin-top:8px"><button class="btn sm" data-act="openf" data-p="${p}">${ic('open', 16)}Open</button><button class="btn sm" data-act="sharef" data-p="${p}">${ic('share', 16)}Share</button><button class="btn sm" data-act="copyp" data-p="${p}">${ic('copy', 16)}Path</button><button class="btn sm dan" data-act="delf" data-p="${p}">${ic('trash', 16)}</button></div>`}</div>`; }).join('') || '<div class="empty">This folder is empty.</div>');
}
function settingsView() {
  const s = st.cfg?.settings, n = (k, l, u = '') => `<div class="set"><span>${l}${u ? `<br><span class="muted sm">${u}</span>` : ''}</span><input type="number" data-set="${k}" value="${s?.[k] ?? ''}" ${s ? '' : 'disabled'}></div>`;
  return `<h1>Settings</h1>${banner()}
  <h2>General</h2><div class="card"><div class="set"><span>Theme</span><select id="theme"><option value="dark">Dark</option><option value="amoled">Pure black</option></select></div>
  <div class="set"><span>Notifications<br><span class="muted sm">When a download completes</span></span><button class="sw ${api.conf.notify ? 'on' : ''}" data-act="notify" aria-label="Notifications"></button></div>
  <div class="set"><span>Default folder<br><span class="path">${esc(st.cfg?.downloadDir || '--')}</span></span><button class="btn sm" data-act="pickdef">Change</button></div></div>
  <h2>Downloads</h2><div class="card">${n('connections', 'Connections per download', '1 to 16. Some servers only allow 1.')}${n('maxConcurrent', 'Max simultaneous downloads')}${n('downloadLimit', 'Download speed limit', 'KB/s, 0 = unlimited')}${n('uploadLimit', 'Upload speed limit', 'KB/s, 0 = unlimited')}${n('retries', 'Retry attempts')}${n('retryDelay', 'Retry delay', 'seconds')}
  <div class="set"><span>Auto-resume on restart</span><button class="sw ${s?.autoResume ? 'on' : ''}" data-act="autoresume" aria-label="Auto resume"></button></div></div>
  <h2>Engine</h2><div class="card"><div class="row" style="justify-content:space-between">${engineBadge()}<span class="row gap"><button class="btn sm" data-act="test">Test</button><button class="btn sm" data-act="reconnect">Reconnect</button></span></div>
  <label>Local bridge URL${api.isLocal ? ' (leave empty: this app is served by the bridge)' : ''}</label><input type="url" id="bridge" value="${esc(api.conf.bridge)}" placeholder="http://127.0.0.1:6810"><label>API token</label><input type="password" id="token" value="${esc(api.conf.token)}" placeholder="Paste the token from Termux"><button class="btn pri" data-act="savecon" style="margin-top:12px">Save and connect</button><button class="btn" data-act="setup" style="margin:12px 0 0 8px">Setup help</button></div>
  <h2>Storage</h2><div class="card"><div class="set"><span>Downloaded in total</span><span>${bytes(st.stat.totalBytes || 0)}</span></div><div class="set"><span>History records</span><span>${st.hist.length}</span></div><div class="set"><span>Clear history</span><button class="btn sm dan" data-act="clearhist">Clear</button></div><p class="muted sm">History is saved in this browser and also in the Termux bridge. Clearing browser data will not lose it; the app restores it from the bridge.</p></div>
  <h2>About</h2><div class="card"><div class="kv"><span>HydraDL</span><span>v1.0.0</span></div><div class="kv"><span>Engine</span><span>aria2c (via Termux)</span></div><button class="btn" id="install" data-act="install" style="margin-top:10px" hidden>Install app</button></div>`;
}
function render() {
  document.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('on', b.dataset.nav === st.view));
  $('#main').innerHTML = V[st.view](); const m = $('#main');
  if (st.view === 'history') { m.querySelector('#hs').value = st.hs; m.querySelector('#hsort').value = st.hsort; histList(); }
  if (st.view === 'files') { m.querySelector('#fsort').value = st.fsort; st.fs ? fileList() : loadFiles(); }
  if (st.view === 'settings') { m.querySelector('#theme').value = api.conf.theme; if (!st.cfg) loadCfg(); if (deferred) m.querySelector('#install').hidden = false; }
  if (st.view === 'home') homeStorage().then(t => { const e = $('#stor'); if (e) e.textContent = t; });
}
const live = () => { if (['home', 'downloads'].includes(st.view) && $('#modal').hidden) render(); };
async function loadCfg() { try { const s = await api.get('/api/status'); st.cfg = s; if (st.view === 'settings') render(); } catch {} }
const nav = v => { st.view = v; st.fs = null; render(); window.scrollTo(0, 0); };

// ---------- new download ----------
const nd = { url: '', name: '', size: 0, dir: '', conns: 4, prio: 'normal', info: null, msg: '' };
function newDlSheet() {
  sheet(`<h3>New download</h3><label>Download URL</label><div class="field"><input type="url" id="nurl" placeholder="https://..." value="${esc(nd.url)}" inputmode="url"><button class="btn" data-act="paste" aria-label="Paste">${ic('clip')}</button></div>
  <div id="ninfo" class="muted sm" style="margin-top:6px">${esc(nd.msg)}</div><label>File name</label><input type="text" id="nname" value="${esc(nd.name)}" placeholder="Detected automatically">
  <label>Save to</label><div class="field"><input type="text" id="ndir" value="${esc(nd.dir)}" readonly><button class="btn" data-act="pickdir">${ic('folder')}</button></div>
  <div class="row gap"><div class="grow"><label>Connections</label><select id="nconn">${[1, 2, 4, 8, 16].map(c => `<option ${c == nd.conns ? 'selected' : ''}>${c}</option>`).join('')}</select></div><div class="grow"><label>Priority</label><select id="nprio">${['normal', 'high', 'low'].map(p => `<option ${p == nd.prio ? 'selected' : ''}>${p}</option>`).join('')}</select></div></div>
  <div class="row gap" style="margin-top:18px;justify-content:flex-end"><button class="btn" data-act="close">Cancel</button><button class="btn pri" data-act="review">Review</button></div>`);
}
async function openNew() {
  if (!nd.dir) { try { nd.dir = (st.cfg || await api.get('/api/status')).downloadDir; nd.conns = st.cfg?.settings.connections || 4; } catch {} }
  newDlSheet(); if (nd.url) probe();
}
let pt; const probe = async () => {
  const u = $('#nurl')?.value.trim(); nd.url = u || ''; const i = $('#ninfo'); if (!u || !i) return;
  i.textContent = 'Checking link...'; try { const r = await api.post('/api/probe', { url: u, dir: nd.dir }); if (!$('#ninfo')) return; nd.info = r; nd.size = r.size; if (!$('#nname').value || $('#nname').dataset.auto) { $('#nname').value = r.filename; $('#nname').dataset.auto = 1; }
    i.innerHTML = `${r.size ? bytes(r.size) : 'Size unknown'} - ${r.acceptRanges ? 'multi-connection supported' : 'this server may only allow one connection'}${r.exists ? '<br><span style="color:var(--hi)">A file with this name exists; a numbered copy will be saved.</span>' : ''}`;
  } catch (e) { if ($('#ninfo')) $('#ninfo').innerHTML = `<span class="err">${esc(e.message)}</span>`; }
};
const grab = () => { nd.url = $('#nurl').value.trim(); nd.name = $('#nname').value.trim(); nd.conns = +$('#nconn').value; nd.prio = $('#nprio').value; };
function review() {
  grab(); if (!/^https?:\/\//i.test(nd.url)) return toast('Enter a valid http:// or https:// link.');
  sheet(`<h3>Confirm download</h3><div class="kv"><span>File</span><span>${esc(nd.name || 'auto')}</span></div><div class="kv"><span>Size</span><span>${nd.size ? bytes(nd.size) : 'unknown'}</span></div><div class="kv"><span>Folder</span><span>${esc(nd.dir)}</span></div><div class="kv"><span>Connections</span><span>${nd.conns}</span></div><div class="kv"><span>Priority</span><span>${nd.prio}</span></div><div class="kv"><span>URL</span><span>${esc(nd.url)}</span></div>
  <div class="row gap" style="margin-top:18px;justify-content:flex-end"><button class="btn" data-act="newdl">Back</button><button class="btn pri" data-act="start">${ic('download', 16)}Start</button></div>`);
}
async function pickDir(done) {
  let cur = nd.dir; const show = async d => { let f; try { f = await api.get('/api/fs?dir=' + encodeURIComponent(d)); } catch (e) { return toast(e.message); } cur = f.dir;
    sheet(`<h3>Choose folder</h3><div class="path" style="margin:6px 0 10px">${esc(f.dir)}</div><div class="row gap wrap" style="margin-bottom:10px">${f.parent ? `<button class="btn sm" data-d="${esc(f.parent)}">${ic('back', 16)}Up</button>` : ''}<button class="btn sm" data-new="1">${ic('plus', 16)}New folder</button></div>
    ${f.entries.filter(e => e.isDir).map(e => `<div class="card" data-d="${esc(f.dir + '/' + e.name)}"><div class="row">${ic('folder')}<span class="name">${esc(e.name)}</span></div></div>`).join('') || '<div class="empty">No subfolders.</div>'}
    <div class="row gap" style="margin-top:12px;justify-content:flex-end"><button class="btn" data-x="1">Cancel</button><button class="btn pri" data-ok="1">Use this folder</button></div>`);
    $('#modal').onclick = async e => { const t = e.target.closest('[data-d],[data-new],[data-x],[data-ok]'); if (!t) return; if (t.dataset.d) show(t.dataset.d); else if (t.dataset.new) { const n = prompt('Folder name'); if (n) { try { const r = await api.post('/api/fs/mkdir', { dir: cur, name: n }); show(r.dir); } catch (er) { toast(er.message); } } } else { $('#modal').onclick = null; done(t.dataset.ok ? cur : null); } };
  }; show(cur || st.cfg?.downloadDir);
}

// ---------- details / setup ----------
function info(id) {
  const it = st.items.find(i => i.id === id); if (!it) return;
  sheet(`<h3>${esc(it.filename)}</h3>${[['Status', LBL[it.status]], ['Size', it.size ? bytes(it.size) : 'unknown'], ['Downloaded', bytes(it.done)], ['Speed', bytes(it.speed) + '/s'], ['Remaining', eta(it.eta)], ['Folder', it.dir], ['URL', it.url]].map(([k, v]) => `<div class="kv"><span>${k}</span><span>${esc(v)}</span></div>`).join('')}
  <label>Priority</label><select id="prio">${['high', 'normal', 'low'].map(p => `<option ${p == it.priority ? 'selected' : ''}>${p}</option>`).join('')}</select>
  <div class="row gap wrap" style="margin-top:14px"><button class="btn sm" data-act="mv" data-id="${id}" data-d="up">${ic('up', 16)}Move up</button><button class="btn sm" data-act="mv" data-id="${id}" data-d="down">${ic('down', 16)}Move down</button><button class="btn sm" data-act="copyurl" data-u="${esc(it.url)}">${ic('copy', 16)}Copy URL</button><button class="btn sm pri" data-act="setprio" data-id="${id}">Save priority</button><button class="btn sm" data-act="close">Close</button></div>`);
}
function setup() {
  sheet(`<h3>Connect to Termux</h3><p class="muted">HydraDL downloads with aria2 inside Termux. After installing the bridge, run <b>./backend/scripts/start.sh</b>. It prints a pairing link like <b>http://127.0.0.1:6810/#token=...</b>. Open that link in Chrome, or paste the token below.</p>
  <label>API token</label><input type="password" id="ptoken" value="${esc(api.conf.token)}">${api.isLocal ? '' : `<label>Bridge URL</label><input type="url" id="pbridge" value="${esc(api.conf.bridge || 'http://127.0.0.1:6810')}">`}
  <div class="row gap" style="margin-top:16px;justify-content:flex-end"><button class="btn" data-act="close">Close</button><button class="btn pri" data-act="pair">Connect</button></div>`);
}

// ---------- events ----------
let deferred; window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; const b = $('#install'); if (b) b.hidden = false; });
const post = (p, b) => guard(() => api.post(p, b)).then(r => { poll(); return r; });
document.addEventListener('click', async e => {
  const nv = e.target.closest('[data-nav]'); if (nv) return nav(nv.dataset.nav);
  const t = e.target.closest('[data-act]'); if (!t) return; const a = t.dataset.act, id = t.dataset.id, p = t.dataset.p;
  switch (a) {
    case 'close': closeSheet(); break; case 'setup': setup(); break; case 'newdl': newDlSheet(); break;
    case 'paste': try { $('#nurl').value = await navigator.clipboard.readText(); $('#nname').value = ''; probe(); } catch { toast('Clipboard blocked. Long-press the field and paste.'); } break;
    case 'pickdir': grab(); pickDir(d => { if (d) nd.dir = d; newDlSheet(); if (nd.url) probe(); }); break;
    case 'pickdef': pickDir(async d => { closeSheet(); if (d) { await guard(() => api.put('/api/settings', { downloadDir: d })); st.cfg = null; nd.dir = ''; render(); } }); break;
    case 'review': review(); break;
    case 'start': { const r = await guard(() => api.post('/api/downloads', { url: nd.url, filename: nd.name || undefined, dir: nd.dir, connections: nd.conns, priority: nd.prio })); if (r) { closeSheet(); Object.assign(nd, { url: '', name: '', size: 0, msg: '' }); toast('Download started'); nav('downloads'); poll(); } break; }
    case 'pause': case 'resume': case 'retry': await post(`/api/downloads/${id}/${a}`); break;
    case 'cancel': if (await ask('Cancel this download and delete the partial file?', 'Cancel download')) await post(`/api/downloads/${id}/remove`, { force: true }); break;
    case 'info': info(id); break;
    case 'mv': await post(`/api/downloads/${id}/move`, { dir: t.dataset.d }); break;
    case 'setprio': await post(`/api/downloads/${id}/priority`, { priority: $('#prio').value }); closeSheet(); break;
    case 'filter': st.filter = id; render(); break;
    case 'selmode': st.selMode = !st.selMode; st.sel.clear(); render(); break;
    case 'toggle': st.sel.has(id) ? st.sel.delete(id) : st.sel.add(id); render(); break;
    case 'bulk': { const ids = [...st.sel]; if (!ids.length) break; if (id === 'cancel' && !await ask(`Cancel ${ids.length} download(s)?`, 'Cancel downloads')) break;
      for (const i of ids) await guard(() => api.post(`/api/downloads/${i}/${id === 'cancel' ? 'remove' : id}`, id === 'cancel' ? { force: true } : {})); st.sel.clear(); st.selMode = false; poll(); break; }
    case 'pauseall': await post('/api/downloads/pause-all'); break; case 'resumeall': await post('/api/downloads/resume-all'); break;
    case 'clearhist': if (await ask('Remove all history records? Downloaded files are kept.', 'Clear')) { await guard(() => api.del('/api/history')); await db.clear(); st.hist = []; render(); } break;
    case 'delrec': await guard(() => api.del('/api/history/' + id)); await db.del(id); st.hist = st.hist.filter(h => h.id !== id); histList(); break;
    case 'redl': if (await post(`/api/downloads/${id}/redownload`)) { toast('Download started'); } break;
    case 'copyurl': navigator.clipboard?.writeText(t.dataset.u).then(() => toast('URL copied'), () => toast('Could not copy.')); break;
    case 'copyp': navigator.clipboard?.writeText(p).then(() => toast('Path copied'), () => toast('Could not copy.')); break;
    case 'openf': await guard(() => api.post('/api/open', { path: p })); break; case 'sharef': await guard(() => api.post('/api/share', { path: p })); break;
    case 'delf': if (await ask('Delete this file permanently?')) { await guard(() => api.del('/api/fs', { path: p })); loadFiles(st.fs?.dir); } break;
    case 'cd': st.fs = null; loadFiles(p); break;
    case 'notify': if (!api.conf.notify && 'Notification' in window) { const r = await Notification.requestPermission(); api.conf.notify = r === 'granted'; } else api.conf.notify = false; api.save(); render(); break;
    case 'autoresume': await guard(() => api.put('/api/settings', { autoResume: !st.cfg.settings.autoResume })); await loadCfg(); break;
    case 'test': { const ok = await guard(() => api.get('/api/status')); if (ok) toast(ok.engine ? 'Connected. Engine is running.' : 'Bridge reachable, but aria2 is not running: ' + (ok.engineError || '')); break; }
    case 'reconnect': poll(); toast('Reconnecting...'); break;
    case 'savecon': api.conf.bridge = $('#bridge').value.trim(); api.conf.token = $('#token').value.trim(); api.save(); st.cfg = null; await poll(); render(); break;
    case 'pair': { api.conf.token = $('#ptoken').value.trim(); if ($('#pbridge')) api.conf.bridge = $('#pbridge').value.trim(); api.save(); closeSheet(); await poll(); toast(st.engine === 'online' ? 'Paired.' : st.msg || 'Could not connect.'); break; }
    case 'install': deferred?.prompt(); break;
  }
});
document.addEventListener('input', e => { const i = e.target;
  if (i.id === 'nurl') { clearTimeout(pt); pt = setTimeout(probe, 700); } if (i.id === 'nname') delete i.dataset.auto;
  if (i.id === 'hq') { st.hq = i.value; histList(); } if (i.id === 'fq') { st.fq = i.value; fileList(); } });
document.addEventListener('change', async e => { const i = e.target;
  if (i.id === 'hs') { st.hs = i.value; histList(); } if (i.id === 'hsort') { st.hsort = i.value; histList(); } if (i.id === 'fsort') { st.fsort = i.value; fileList(); }
  if (i.id === 'theme') { api.conf.theme = i.value; api.save(); document.documentElement.dataset.theme = i.value; }
  if (i.dataset.set) { const r = await guard(() => api.put('/api/settings', { [i.dataset.set]: +i.value })); if (r) { st.cfg.settings = r.settings; toast('Saved'); } } });
$('#fab').addEventListener('click', openNew);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => {});
(async () => { st.hist = await db.all(); if (!api.conf.token) st.engine = 'auth'; render(); poll(); if (!api.conf.token) setup(); })();
