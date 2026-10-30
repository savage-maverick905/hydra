#!/data/data/com.termux/files/usr/bin/bash
cd "$(dirname "$0")/.."
D="${HYDRA_HOME:-$HOME/.hydradl}"; mkdir -p "$D"
if [ -f "$D/bridge.pid" ] && kill -0 "$(cat "$D/bridge.pid")" 2>/dev/null; then echo "Already running."; else
  command -v termux-wake-lock >/dev/null && termux-wake-lock
  nohup node server.js >> "$D/bridge.log" 2>&1 &
  echo $! > "$D/bridge.pid"; sleep 2; echo "Started."
fi
INFO=$(node server.js --init)
TOKEN=$(echo "$INFO" | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).token))')
PORT=$(echo "$INFO" | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).port))')
echo; echo "Open this link in Chrome to pair (local mode, works offline-first):"
echo "  http://127.0.0.1:$PORT/#token=$TOKEN"
