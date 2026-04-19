#!/usr/bin/env bash
# LFA Reader database restore script.
#
# Usage:
#   restore.sh <snapshot-path | tier/timestamp>
#   restore.sh backend-change/20260419-021229
#   restore.sh /home/ubuntu/backups/lfa-reader/pre-restore/20260419-013949
#
# Behavior:
#   1. Verifies that the snapshot exists and contains lfa_reader.db
#   2. Creates a pre-restore database snapshot as a rollback safety net
#   3. Stops uvicorn to avoid file-handle conflicts
#   4. Replaces lfa_reader.db
#   5. Restores uploads/ only when the snapshot contains a legacy uploads.tar.gz
#   6. Prints the manual restart command

set -euo pipefail

REPO_ROOT="/home/ubuntu/lfa-reader"
BACKUP_ROOT="/home/ubuntu/backups/lfa-reader"
DB_DEST="$REPO_ROOT/apps/backend/lfa_reader.db"
UPLOADS_DEST="$REPO_ROOT/apps/backend/uploads"

list_snapshots() {
  if [[ ! -d "$BACKUP_ROOT" ]]; then
    return
  fi

  find "$BACKUP_ROOT" -mindepth 2 -maxdepth 2 -type d | sort | while read -r path; do
    echo "  ${path#"$BACKUP_ROOT"/}" >&2
  done
}

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <snapshot-path | tier/timestamp>" >&2
  echo "Available snapshots:" >&2
  list_snapshots
  exit 2
fi

ARG="$1"
if [[ -d "$ARG" ]]; then
  SNAPSHOT="$ARG"
elif [[ -d "$BACKUP_ROOT/$ARG" ]]; then
  SNAPSHOT="$BACKUP_ROOT/$ARG"
else
  echo "Snapshot not found: $ARG" >&2
  exit 1
fi

if [[ ! -f "$SNAPSHOT/lfa_reader.db" ]]; then
  echo "Snapshot is missing lfa_reader.db: $SNAPSHOT" >&2
  exit 1
fi

echo "[restore] source: $SNAPSHOT"
[[ -f "$SNAPSHOT/metadata.json" ]] && cat "$SNAPSHOT/metadata.json"

echo "[restore] snapshotting current state to pre-restore/ ..."
"$REPO_ROOT/scripts/backup.sh" pre-restore

if pgrep -f "venv/bin/uvicorn" > /dev/null; then
  echo "[restore] stopping uvicorn ..."
  pkill -f "venv/bin/uvicorn" || true
  sleep 1
fi

cp "$SNAPSHOT/lfa_reader.db" "$DB_DEST"
echo "[restore] db replaced ($(stat -c%s "$DB_DEST") bytes)"

if [[ -f "$SNAPSHOT/uploads.tar.gz" ]]; then
  rm -rf "$UPLOADS_DEST"
  tar -xzf "$SNAPSHOT/uploads.tar.gz" -C "$REPO_ROOT/apps/backend"
  echo "[restore] uploads restored from legacy snapshot"
else
  echo "[restore] snapshot has no uploads.tar.gz; leaving uploads/ unchanged"
fi

echo "[restore] done. Restart uvicorn manually:"
echo "  cd $REPO_ROOT/apps/backend && nohup venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 > uvicorn.log 2>&1 & disown"
