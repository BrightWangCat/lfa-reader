#!/usr/bin/env bash
# LFA Reader database backup script.
#
# Usage:
#   backup.sh backend-change [upstream-ref]
#   backup.sh pre-restore
#
# Modes:
#   backend-change  Fetches the tracked upstream and creates a database snapshot
#                   only when the incoming diff touches apps/backend/.
#   pre-restore     Always creates a database snapshot before restore.
#
# Output:
#   /home/ubuntu/backups/lfa-reader/<mode>/<YYYYMMDD-HHMMSS>/
#     ├── lfa_reader.db
#     └── metadata.json
#
# Retention:
#   Both modes share one rolling pool. Every run keeps only the 2 newest
#   snapshots by timestamp and deletes the rest, so AWS holds at most 3
#   database copies: the live db plus 2 backups.

set -euo pipefail

REPO_ROOT="/home/ubuntu/lfa-reader"
BACKUP_ROOT="/home/ubuntu/backups/lfa-reader"
DB_SRC="$REPO_ROOT/apps/backend/lfa_reader.db"

MODE="${1:-backend-change}"
UPSTREAM_INPUT="${2:-@{upstream}}"

# Both modes share one rolling backup pool; keep only the newest KEEP snapshots.
KEEP=2

case "$MODE" in
  backend-change|pre-restore) ;;
  *)
    echo "Usage: $0 backend-change [upstream-ref] | pre-restore" >&2
    exit 2
    ;;
esac

TS="$(date -u +%Y%m%d-%H%M%S)"
DEST="$BACKUP_ROOT/$MODE/$TS"

log() { echo "[backup $MODE $TS] $*"; }

resolve_upstream_branch() {
  git -C "$REPO_ROOT" rev-parse --abbrev-ref --symbolic-full-name "$UPSTREAM_INPUT" 2>/dev/null
}

fetch_upstream_remote() {
  local upstream_branch="$1"
  local remote_name="${upstream_branch%%/*}"
  if [[ "$remote_name" == "$upstream_branch" ]]; then
    remote_name="origin"
  fi
  git -C "$REPO_ROOT" fetch --quiet "$remote_name"
}

GIT_HEAD="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")"
GIT_UPSTREAM=""
BACKEND_FILE_COUNT=0

if [[ "$MODE" == "backend-change" ]]; then
  GIT_UPSTREAM="$(resolve_upstream_branch)"
  if [[ -z "$GIT_UPSTREAM" ]]; then
    echo "No upstream branch configured for $REPO_ROOT" >&2
    exit 2
  fi

  fetch_upstream_remote "$GIT_UPSTREAM"

  BACKEND_FILE_COUNT="$(
    git -C "$REPO_ROOT" diff --name-only HEAD "$GIT_UPSTREAM" -- apps/backend \
      | sed '/^$/d' \
      | wc -l \
      | tr -d ' '
  )"

  if [[ "$BACKEND_FILE_COUNT" -eq 0 ]]; then
    log "no incoming apps/backend changes in $GIT_UPSTREAM; skipped"
    exit 0
  fi
fi

mkdir -p "$DEST"

if [[ -f "$DB_SRC" ]]; then
  sqlite3 "$DB_SRC" ".backup '$DEST/lfa_reader.db'"
  DB_SIZE="$(stat -c%s "$DEST/lfa_reader.db")"
  log "db ok ($DB_SIZE bytes)"
else
  DB_SIZE=0
  log "db missing, skipped"
fi

cat > "$DEST/metadata.json" <<EOF
{
  "mode": "$MODE",
  "timestamp_utc": "$TS",
  "db_bytes": $DB_SIZE,
  "host": "$(hostname)",
  "git_head": "$GIT_HEAD",
  "git_upstream": "${GIT_UPSTREAM:-null}",
  "backend_files_changed": $BACKEND_FILE_COUNT
}
EOF

# Unified rotation across both modes: keep only the newest KEEP snapshots by
# timestamp and delete the rest, capping AWS at the live db plus KEEP backups.
mapfile -t SNAPSHOTS < <(
  find "$BACKUP_ROOT" -mindepth 2 -maxdepth 2 -type d -printf '%f\t%p\n' \
    | sort -r \
    | cut -f2-
)
for old in "${SNAPSHOTS[@]:$KEEP}"; do
  rm -rf "$old"
  log "rotated out: ${old#"$BACKUP_ROOT"/}"
done

log "done -> $DEST"
