#!/usr/bin/env bash
# Polls the API's /health endpoint until it responds 200, or fails after a timeout.
# Usage: scripts/health-check.sh https://api.m300.example.com/health

set -euo pipefail

URL="${1:?Usage: health-check.sh <url>}"
MAX_ATTEMPTS=30
SLEEP_SECONDS=5

echo "Checking $URL ..."

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  status=$(curl -s -o /dev/null -w "%{http_code}" "$URL" || echo "000")

  if [ "$status" = "200" ]; then
    echo "Healthy (attempt $attempt/$MAX_ATTEMPTS, HTTP $status)"
    exit 0
  fi

  echo "Not ready yet (attempt $attempt/$MAX_ATTEMPTS, HTTP $status). Retrying in ${SLEEP_SECONDS}s..."
  sleep "$SLEEP_SECONDS"
done

echo "Health check failed after $MAX_ATTEMPTS attempts: $URL"
exit 1
