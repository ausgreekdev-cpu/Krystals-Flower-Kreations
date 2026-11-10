const a = { name:'post-workshop-survey', description:'Send survey after workshop (stub).', trigger:'cron:daily', async run(){ return { ok: true }; } };
export default a;
