const a = { name:'no-show-followup', description:'Follow up no-shows (stub).', trigger:'cron:daily', async run(){ return { ok: true }; } };
export default a;
