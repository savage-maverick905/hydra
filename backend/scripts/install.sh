#!/data/data/com.termux/files/usr/bin/bash
set -e
cd "$(dirname "$0")/.."
echo "== HydraDL install =="
pkg update -y && pkg install -y nodejs aria2 termux-api termux-tools curl
[ -d "$HOME/storage" ] || { echo "Allow storage access in the popup..."; termux-setup-storage; sleep 5; }
chmod +x scripts/*.sh
mkdir -p "$HOME/.termux/boot"
cat > "$HOME/.termux/boot/hydradl" <<B
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock
$(pwd)/scripts/start.sh
B
chmod +x "$HOME/.termux/boot/hydradl"
node server.js --init > /dev/null
echo; echo "Done. Start it with:  ./backend/scripts/start.sh   (from the HydraDL folder)"
