const a = { name:'payment-failed-notify', description:'Notify on payment failure (stub).', trigger:'event:payment.failed', async run(ctx){ return { ok: true, ctx }; } };
export default a;
