let dbp; const open = () => dbp ||= new Promise((ok, no) => { const r = indexedDB.open('hydradl', 1); r.onupgradeneeded = () => r.result.createObjectStore('history', { keyPath: 'id' }); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
const tx = async (mode, fn) => { const d = await open(); return new Promise((ok, no) => { const t = d.transaction('history', mode), s = t.objectStore('history'); const r = fn(s); t.oncomplete = () => ok(r?.result); t.onerror = () => no(t.error); }); };
export const all = () => tx('readonly', s => s.getAll()).then(x => x || []).catch(() => []);
export const putAll = items => tx('readwrite', s => { items.forEach(i => s.put(i)); }).catch(() => {});
export const clear = () => tx('readwrite', s => s.clear()).catch(() => {});
export const del = id => tx('readwrite', s => s.delete(id)).catch(() => {});
