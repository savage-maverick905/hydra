#!/data/data/com.termux/files/usr/bin/bash
D="${HYDRA_HOME:-$HOME/.hydradl}"
[ -f "$D/bridge.pid" ] && kill "$(cat "$D/bridge.pid")" 2>/dev/null && rm -f "$D/bridge.pid" && echo "Stopped." || echo "Not running."
command -v termux-wake-unlock >/dev/null && termux-wake-unlock
