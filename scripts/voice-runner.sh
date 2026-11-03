#!/usr/bin/env bash
# Starts the live voice for addyfresh.netlify.app: Kokoro bridge + public tunnel.
# Usage:  ./scripts/voice-runner.sh
# Then copy the https://....trycloudflare.com line into Netlify:
#   Site settings -> Environment variables -> LOCAL_VOICE_TUNNEL_URL
# Keep this Terminal window open during the demo. Ctrl-C stops everything.
set -euo pipefail

VOICE_DIR="${VOICE_DIR:-$HOME/Downloads/voices_addyfresh}"
PORT="${VOICE_BRIDGE_PORT:-8788}"
LOG="${TMPDIR:-/tmp}/addyfresh-voice.log"
TUNNEL_LOG="${TMPDIR:-/tmp}/addyfresh-tunnel.log"

if [ ! -d "$VOICE_DIR" ]; then
  echo "Voice runner not found at $VOICE_DIR" >&2
  echo "Set VOICE_DIR=/path/to/the/voice/folder and run again." >&2
  exit 1
fi

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared is not installed. Install it once with:  brew install cloudflared" >&2
  exit 1
fi

if [ ! -x "$HOME/AI/runtimes/kokoro-lab/venv/bin/python" ]; then
  echo "Kokoro runtime missing at ~/AI/runtimes/kokoro-lab" >&2
  echo "Set KOKORO_DIR to its location, or reinstall it, then run again." >&2
  exit 1
fi

cleanup() {
  [ -n "${BRIDGE_PID:-}" ] && kill "$BRIDGE_PID" 2>/dev/null || true
  [ -n "${TUNNEL_PID:-}" ] && kill "$TUNNEL_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting the voice bridge on :$PORT ..."
( cd "$VOICE_DIR" && node scripts/voice-bridge.mjs ) >"$LOG" 2>&1 &
BRIDGE_PID=$!

for _ in $(seq 1 30); do
  curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && break
  sleep 0.5
done
if ! curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
  echo "The bridge did not come up. Last lines of $LOG:" >&2
  tail -5 "$LOG" >&2
  exit 1
fi
echo "Bridge is healthy: $(curl -fsS "http://127.0.0.1:$PORT/health")"

echo "Opening a public tunnel ..."
cloudflared tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate >"$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

URL=""
for _ in $(seq 1 40); do
  URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -1 || true)
  [ -n "$URL" ] && break
  sleep 0.5
done

if [ -z "$URL" ]; then
  echo "Could not read the tunnel URL. Last lines:" >&2
  tail -10 "$TUNNEL_LOG" >&2
  exit 1
fi

echo
echo "=================================================================="
echo " Public voice URL:  $URL"
echo
echo " Set this in Netlify (Site settings -> Environment variables):"
echo "   LOCAL_VOICE_TUNNEL_URL = $URL"
echo
echo " Check it works:"
echo "   curl -s $URL/health"
echo "=================================================================="
echo
echo "Leave this window open. Ctrl-C stops the bridge and the tunnel."
wait "$TUNNEL_PID"
