# scripts/

Operational scripts for the AWS host. The scripts are versioned in the repo,
while snapshot output is stored outside the repo under
`/home/ubuntu/backups/lfa-reader/`.

## Backup Policy

Regular backups are now database-only and happen only when AWS is about to
pull incoming changes that touch `apps/backend/`.

Use this command from the AWS repo root before `git pull`:

```bash
scripts/backup.sh backend-change
```

What it does:

1. Resolves the tracked upstream branch and runs `git fetch`
2. Checks whether the incoming diff touches `apps/backend/`
3. Creates a SQLite hot backup only when backend changes are incoming
4. Stores the snapshot under
   `/home/ubuntu/backups/lfa-reader/backend-change/<timestamp>/`

Snapshot contents:

- `lfa_reader.db`
- `metadata.json`

Retention:

`backend-change` and `pre-restore` share one rolling pool. Every backup keeps
only the 2 newest snapshots by timestamp and deletes the rest, so AWS holds at
most 3 database copies: the live db plus 2 backups. The first run after this
policy lands prunes any existing surplus snapshots down to the newest 2.

Scheduled `hourly`, `daily`, and `weekly` backups are not part of the active
workflow and should remain disabled on AWS.

## Restore Workflow

Restore a snapshot with:

```bash
scripts/restore.sh <tier>/<timestamp>
```

Examples:

```bash
scripts/restore.sh backend-change/20260419-021229
scripts/restore.sh pre-restore/20260419-013949
```

The restore script:

1. Stages the chosen snapshot to a temp dir so rolling rotation cannot delete
   the source while the restore is in progress
2. Creates a `pre-restore` database snapshot as a rollback safety net, which
   itself counts toward the 2-snapshot pool
3. Stops `uvicorn`
4. Replaces `lfa_reader.db` from the staged copy
5. Restores `uploads/` only when the snapshot includes a legacy `uploads.tar.gz`
6. Prints the manual backend restart command

Run `scripts/restore.sh` without arguments to list all available snapshots.

## Notes

- `scripts/backup.sh` uses `sqlite3 .backup` instead of `cp`, so the database
  snapshot stays transactionally consistent without blocking normal reads and
  writes.
- Current snapshots are database-only. Legacy snapshots may still include
  `uploads.tar.gz`, and `scripts/restore.sh` remains compatible with them.
- Backups do not include `.env`, `venv/`, or source code. Source code recovery
  still goes through `git`.
