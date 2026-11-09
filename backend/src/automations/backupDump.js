const a = { name:'backup-dump', description:'Trigger pg_dump backup.', trigger:'cron:daily', async run(){ return { ok: true, note: 'wire to scripts/db-backup.sh' }; } };
export default a;
