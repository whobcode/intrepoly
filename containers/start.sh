#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-444}"
WRANGLER_CMD=(npx wrangler dev --local --host 0.0.0.0 --port "$PORT")

echo "[start] launching wrangler dev on :$PORT"
"${WRANGLER_CMD[@]}" &
WRANGLER_PID=$!

# Wait for dev port
echo "[start] waiting for worker to be reachable..."
for i in {1..60}; do
  if curl -fsS "http://127.0.0.1:${PORT}/auth/whoami" >/dev/null 2>&1; then
    echo "[start] worker is up"
    break
  fi
  sleep 1
done

CFD_ARGS=(tunnel --no-autoupdate --metrics localhost:0)

if [[ -n "${TUNNEL_TOKEN:-}" ]]; then
  echo "[start] starting cloudflared with token"
  exec cloudflared "${CFD_ARGS[@]}" run --token "$TUNNEL_TOKEN"
else
  # When using named tunnel, require config and credentials
  CFG="${CLOUDFLARED_CONFIG:-/etc/cloudflared/config.yml}"
  CREDS="${TUNNEL_CRED_FILE:-/secrets/credentials.json}"
  if [[ ! -f "$CFG" ]]; then
    echo "[start] cloudflared config not found at $CFG" >&2
    echo "Provide CFM named tunnel config via mount or set TUNNEL_TOKEN." >&2
    kill "$WRANGLER_PID" || true
    exit 2
  fi
  if grep -q 'credentials-file:' "$CFG" && [[ ! -f "$CREDS" ]]; then
    echo "[start] expected credentials file at $CREDS, but not found" >&2
    kill "$WRANGLER_PID" || true
    exit 3
  fi
  echo "[start] starting cloudflared with named tunnel (config: $CFG)"
  exec cloudflared "${CFD_ARGS[@]}" --config "$CFG" run
fi

