# Troubleshooting
- **aria2c is not installed**: `pkg install aria2`, then stop.sh and start.sh.
- **Not paired**: re-run start.sh and open the printed link, or paste the token in Settings > Engine.
- **Bridge offline**: Termux was killed. Open it, run start.sh, fix battery settings (README).
- **Permission denied**: run `termux-setup-storage` and allow access. Folders must be under `~/storage/downloads`.
- **Server rejects multi-connection**: tap Retry; retry uses a single connection.
- **Open/Share does nothing**: `pkg install termux-tools termux-api` and install the Termux:API app.
- **Port in use**: run stop.sh.
- **Vercel mode can't connect**: use Local mode.
- **Reset token**: delete `token` from `~/.hydradl/config.json`, run start.sh, re-pair.
