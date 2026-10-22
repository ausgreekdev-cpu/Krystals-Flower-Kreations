#!/usr/bin/env bash
# pg_dump backup of the production (Supabase) database — launch checklist
# "automated daily database snapshot backups".
#
# Usage:
#   ./scripts/db-backup.sh                 # uses backend/.env.supabase DIRECT_URL
#   DATABASE_URL=... ./scripts/db-backup.sh # or an explicit connection string
#
# Output: backups/krystals-YYYY-MM-DD-HHMM.sql.gz (gitignored). Keep 7–30 days.
# Cron example (daily 2am, from the repo root):
#   0 2 * * * cd /path/to/Krystals-Flower-Kreations && ./scripts/db-backup.sh >> backups/cron.log 2>&1
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p backups

URL="${DATABASE_URL:-}"
if [ -z "$URL" ] && [ -f backend/.env.supabase ]; then
  URL="$(grep -E '^DIRECT_URL=' backend/.env.supabase | cut -d= -f2- | tr -d '"')"
fi
if [ -z "$URL" ]; then
  echo "No DATABASE_URL env and no backend/.env.supabase DIRECT_URL found" >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump not found — install the postgresql client (apt install postgresql-client / brew install postgresql)" >&2
  exit 1
fi

STAMP="$(date +%Y-%m-%d-%H%M)"
OUT="backups/krystals-${STAMP}.sql.gz"
pg_dump --no-owner --no-acl "$URL" | gzip -9 > "$OUT"
echo "wrote $OUT ($(du -h "$OUT" | cut -f1))"

# Retention: keep the newest 30 dumps
ls -1t backups/krystals-*.sql.gz 2>/dev/null | tail -n +31 | xargs -r rm --
