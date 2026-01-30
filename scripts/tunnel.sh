#!/bin/bash
# ClawNet Cloudflare Tunnel Script
# Starts a quick tunnel and updates .env with the URL

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env"
LOG_FILE="$PROJECT_DIR/.tunnel.log"
PID_FILE="$PROJECT_DIR/.tunnel.pid"

# Kill existing tunnel if running
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
        echo "Killing existing tunnel (PID $OLD_PID)..."
        kill "$OLD_PID" 2>/dev/null
        sleep 1
    fi
    rm -f "$PID_FILE"
fi

echo "Starting Cloudflare tunnel..."

# Start cloudflared in background, capture output
cloudflared tunnel --url http://localhost:3000 > "$LOG_FILE" 2>&1 &
TUNNEL_PID=$!
echo $TUNNEL_PID > "$PID_FILE"

echo "Tunnel started (PID $TUNNEL_PID), waiting for URL..."

# Wait for URL to appear in logs (max 30 seconds)
for i in {1..30}; do
    TUNNEL_URL=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' "$LOG_FILE" 2>/dev/null | head -1)
    if [ -n "$TUNNEL_URL" ]; then
        break
    fi
    sleep 1
done

if [ -z "$TUNNEL_URL" ]; then
    echo "ERROR: Could not get tunnel URL after 30 seconds"
    cat "$LOG_FILE"
    exit 1
fi

echo "Tunnel URL: $TUNNEL_URL"

# Update .env file
if grep -q "^TUNNEL_URL=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^TUNNEL_URL=.*|TUNNEL_URL=$TUNNEL_URL|" "$ENV_FILE"
else
    echo "" >> "$ENV_FILE"
    echo "# Cloudflare Tunnel (auto-generated)" >> "$ENV_FILE"
    echo "TUNNEL_URL=$TUNNEL_URL" >> "$ENV_FILE"
fi

echo "Updated $ENV_FILE with TUNNEL_URL"
echo "Tunnel running in background (PID $TUNNEL_PID)"
echo "Logs: $LOG_FILE"
