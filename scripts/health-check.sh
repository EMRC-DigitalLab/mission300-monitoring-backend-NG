#!/usr/bin/env bash
# Polls the API's /health endpoint until it responds 200, or fails after a timeout.
# Usage: scripts/health-check.sh https://api.m300.example.com/health

set -euo pipefail

URL="${1:?Usage: health-check.sh <url>}"
MAX_ATTEMPTS=30
SLEEP_SECONDS=5

echo "Checking $URL ..."

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  # curl's own -w already prints "000" for http_code when it can't connect
  # at all (DNS failure, connection refused, timeout) - it still exits
  # non-zero in that case though, so the `|| status="000"` here exists only
  # to stop `set -e` aborting the retry loop, not to supply a fallback
  # value. Putting it inside the command substitution (`|| echo "000"`)
  # meant BOTH curl's own "000" and the fallback "000" landed in the same
  # captured string, showing up as the confusing "000000" in the logs.
  status=$(curl -s -o /dev/null -w "%{http_code}" "$URL") || status="000"

  if [ "$status" = "200" ]; then
    echo "Healthy (attempt $attempt/$MAX_ATTEMPTS, HTTP $status)"
    exit 0
  fi

  echo "Not ready yet (attempt $attempt/$MAX_ATTEMPTS, HTTP $status). Retrying in ${SLEEP_SECONDS}s..."
  sleep "$SLEEP_SECONDS"
done

echo "Health check failed after $MAX_ATTEMPTS attempts: $URL"
exit 1
