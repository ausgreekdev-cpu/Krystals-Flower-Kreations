const a = { name: 'materials-prep-reminder', description: 'Send kit checklist 48h before (stub).', trigger: 'cron:daily', async run() { return { ok: true }; } };
export default a;
