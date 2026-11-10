const a = { name:'welcome-email', description:'Send welcome email on registration (stub).', trigger:'event:user.registered', async run(ctx){ return { ok: true, ctx }; } };
export default a;
