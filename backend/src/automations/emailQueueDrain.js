const a = { name:'email-queue-drain', description:'Drain pending emails (delegated).', trigger:'cron:hourly', async run(){ return { ok: true, note: 'wire to services/email.js drainEmailQueue' }; } };
export default a;
