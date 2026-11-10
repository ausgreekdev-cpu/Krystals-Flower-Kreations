const a = { name:'review-request', description:'Request review after delivery (stub).', trigger:'cron:daily', async run(){ return { ok: true }; } };
export default a;
