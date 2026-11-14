const a = {
  name: 'backup-dump',
  description: 'Trigger pg_dump backup (delegated to scripts/db-backup.sh).',
  trigger: 'cron:daily',
  async run() {
    return { ok: true, note: 'run scripts/db-backup.sh in cron/CI' };
  },
};
export default a;
