# HydraDL

Multi-headed download manager for Android. **aria2c** (in Termux) downloads, a tiny **Node.js bridge** controls it, a **PWA** is the interface. No accounts, no cloud, nothing to `npm install`.

## How the app connects

A Vercel HTTPS page talking to a phone-local server hits mixed-content, CORS and Private Network Access rules. HydraDL has two modes:

| Mode | How | Status |
|---|---|---|
| **Local mode (recommended)** | The bridge serves the PWA at `http://127.0.0.1:6810`. Same origin, no CORS. Chrome treats 127.0.0.1 as secure, so install and offline work. | Designed to work, not yet tested on a device |
| **Vercel mode (optional)** | Deploy `frontend/` to Vercel, add your Vercel URL to `origins` in `~/.hydradl/config.json`, set Bridge URL to `http://127.0.0.1:6810`. The bridge sends CORS plus `Access-Control-Allow-Private-Network`. | Untested. Chrome's loopback rules change; if it fails, use Local mode. |

The bridge binds to 127.0.0.1 only, needs a random token on every API call, rejects unknown Host headers, and only touches files inside permitted folders.

## Setup on a new phone

1. Install **Termux** from F-Droid (https://f-droid.org/packages/com.termux/), not the Play Store. Optional: Termux:API and Termux:Boot from F-Droid.
2. Copy `HydraDL.zip` to your phone's Downloads, then in Termux:
```
termux-setup-storage
pkg install -y unzip
unzip -o ~/storage/downloads/HydraDL.zip -d ~
cd ~/hydradl && bash backend/scripts/install.sh
```
3. Start it: `cd ~/hydradl && ./backend/scripts/start.sh`
4. It prints `http://127.0.0.1:6810/#token=...`. Open that link in Chrome. Paired.
5. Chrome menu, Add to Home screen.

Stop: `./backend/scripts/stop.sh`. Status: `./backend/scripts/status.sh`. Logs in `~/.hydradl/`.

## Background downloads (honest version)

aria2c keeps going with the app closed or screen off, as long as Android does not kill Termux. So:
- `start.sh` takes a wake lock (also tap "Acquire wakelock" in Termux's notification).
- Settings > Apps > Termux > Battery: Unrestricted.
- Don't swipe Termux out of recents. Xiaomi, Huawei and Samsung can be aggressive (dontkillmyapp.com).
- Start on boot: install Termux:Boot and open it once; install.sh already created the boot script.
- If aria2 dies the bridge restarts it and restores the queue from the saved session.

## GitHub + Vercel (optional)
```
cd hydradl && git init && git add . && git commit -m "HydraDL"
git branch -M main && git remote add origin https://github.com/YOU/hydradl.git && git push -u origin main
```
Vercel: New Project, import repo, Framework "Other", no build command (vercel.json outputs `frontend`), Deploy.

See `docs/` for architecture, troubleshooting and the test status.
