const a = { name:'session-cancelled-notify', description:'Notify attendees on cancellation (stub).', trigger:'event:session.cancelled', async run(ctx){ return { ok: true, ctx }; } };
export default a;
