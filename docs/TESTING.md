# Test status

**Verified in a Linux sandbox (Node 22):**
- Syntax of all backend and frontend JS.
- Bridge starts, binds 127.0.0.1, serves the PWA.
- /api/health is open; other routes return 401 without the token; a wrong Host header is rejected.
- Folders outside permitted roots (/etc, ../..) are rejected; file:// URLs are rejected.
- Directory listing and disk space work; a clear error appears when aria2c is missing.

**NOT verified (no aria2c, internet or Android device in the sandbox):**
- Real downloads, pause/resume, queue, retry, crash recovery, aria2 startup.
- PWA install, offline mode, the UI on a real phone.
- termux-open and termux-share, Android storage permissions.
- Boot start and wake-lock behaviour.
- Vercel deployment and Vercel-to-localhost mode.
