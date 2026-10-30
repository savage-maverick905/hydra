# Architecture
PWA (vanilla ES modules, IndexedDB, service worker) <-HTTP + Bearer token-> Node bridge on 127.0.0.1:6810 <-JSON-RPC on 127.0.0.1:6800 (secret in a 0600 conf)-> aria2c.
- The bridge polls aria2 every 2s and records every download in `~/.hydradl/records.json`, so history survives browser data clearing; the PWA restores IndexedDB from it.
- Queue, priority and reordering use aria2's native queue; the session is saved with `--save-session`.
- No shell strings: only `spawn()` with argument arrays. URLs, filenames and paths are validated; file operations use `realpath` checked against permitted roots.
- The service worker never caches `/api/*`.
