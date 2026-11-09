const a = { name:'review-digest', description:'Weekly review digest.', trigger:'cron:weekly', async run(){ return { ok: true }; } };
export default a;
