const a = { name: 'workshop-recap-email', description: 'Send recap to attendees (stub).', trigger: 'cron:daily', async run() { return { ok: true }; } };
export default a;
