const a = { name:'workshop-reminder', description:'Send workshop reminders 48h before.', trigger:'cron:daily', async run(){ return { ok: true, note: 'wire to email service' }; } };
export default a;
