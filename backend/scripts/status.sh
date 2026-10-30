#!/data/data/com.termux/files/usr/bin/bash
cd "$(dirname "$0")/.."
PORT=$(node server.js --init | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).port))')
curl -s "http://127.0.0.1:$PORT/api/health" && echo || echo "Bridge is not running."
