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
#   backend-change = keep until manually deleted
#   pre-restore    = keep the latest 20 snapshots

set -euo pipefail

REPO_ROOT="/home/ubuntu/lfa-reader"
BACKUP_ROOT="/home/ubuntu/backups/lfa-reader"
DB_SRC="$REPO_ROOT/apps/backend/lfa_reader.db"

MODE="${1:-backend-change}"
UPSTREAM_INPUT="${2:-@{upstream}}"

case "$MODE" in
  backend-change) RETAIN=0 ;;
  pre-restore) RETAIN=20 ;;
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

if [[ "$RETAIN" -gt 0 ]]; then
  TIER_DIR="$BACKUP_ROOT/$MODE"
  mapfile -t OLD < <(ls -1 "$TIER_DIR" | sort -r | tail -n +"$((RETAIN + 1))")
  for old in "${OLD[@]}"; do
    rm -rf "${TIER_DIR:?}/$old"
    log "rotated out: $old"
  done
fi

log "done -> $DEST"
