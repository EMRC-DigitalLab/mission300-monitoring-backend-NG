#!/usr/bin/env bash
# Dumps one environment's Postgres database to a compressed, timestamped
# file on the VPS, and prunes local copies older than RETENTION_DAYS.
#
# Runs ON THE VPS (via the db-backup.yml GitHub Actions workflow, which
# scp's this script over and runs it via SSH - see that workflow for the
# off-VPS copy this local dump then gets pulled into as an artifact).
#
# Reads POSTGRES_USER/POSTGRES_DB from the same env file docker compose
# already uses for that environment (/opt/m300-backend/<env>/.env), so
# there's no separate copy of the credentials to keep in sync, and dumps
# via `docker exec` straight from the running container - no network
# access to Postgres is needed beyond what's already local to the VPS.
#
# Usage: db-backup.sh <staging|production>

set -euo pipefail

ENVIRONMENT="${1:?Usage: db-backup.sh <staging|production>}"

if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
  echo "Unknown environment: $ENVIRONMENT (expected staging or production)" >&2
  exit 1
fi

ENV_FILE="/opt/m300-backend/$ENVIRONMENT/.env"
CONTAINER="m300-backend-$ENVIRONMENT-postgres-1"
API_CONTAINER="m300-backend-$ENVIRONMENT-api-1"
# /opt/backups/ on this shared VPS is root-owned (used by another project's
# own backup job) - m300_user has no write access there. /opt/m300-backend/
# is m300_user's own directory (same one the deploy already writes into),
# so backups live under it instead.
BACKUP_DIR="/opt/m300-backend/backups/$ENVIRONMENT"
RETENTION_DAYS=14
DATE=$(date +"%Y-%m-%d_%H-%M")

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file not found: $ENV_FILE" >&2
  exit 1
fi

POSTGRES_USER=$(grep -E '^POSTGRES_USER=' "$ENV_FILE" | cut -d= -f2-)
POSTGRES_DB=$(grep -E '^POSTGRES_DB=' "$ENV_FILE" | cut -d= -f2-)

if [[ -z "$POSTGRES_USER" || -z "$POSTGRES_DB" ]]; then
  echo "Could not read POSTGRES_USER/POSTGRES_DB from $ENV_FILE" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

OUT_FILE="$BACKUP_DIR/${POSTGRES_DB}_${DATE}.sql.gz"
FILES_OUT_FILE="$BACKUP_DIR/api-storage_${DATE}.tar.gz"
echo "Backing up $ENVIRONMENT ($POSTGRES_DB) from $CONTAINER..."
docker exec "$CONTAINER" pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$OUT_FILE"
gzip -t "$OUT_FILE"
echo "Backing up uploaded evidence from $API_CONTAINER..."
docker cp "$API_CONTAINER:/app/storage/." - | gzip > "$FILES_OUT_FILE"
gzip -t "$FILES_OUT_FILE"
echo "Backup written: $OUT_FILE ($(du -h "$OUT_FILE" | cut -f1))"
echo "Evidence backup written: $FILES_OUT_FILE ($(du -h "$FILES_OUT_FILE" | cut -f1))"

# Also written under a fixed name so the calling workflow (running on the
# GitHub Actions runner, not this VPS) can scp it back with a predictable
# path - $GITHUB_OUTPUT only exists on the runner's own filesystem, not
# here, so there's no way to hand a dynamic, timestamped filename back to
# that step directly from this remote script.
cp "$OUT_FILE" "$BACKUP_DIR/latest.sql.gz"
cp "$FILES_OUT_FILE" "$BACKUP_DIR/latest-files.tar.gz"

find "$BACKUP_DIR" -name "*.sql.gz" ! -name "latest.sql.gz" -mtime "+$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name "*.tar.gz" ! -name "latest-files.tar.gz" -mtime "+$RETENTION_DAYS" -delete
echo "Backup complete for $ENVIRONMENT."
