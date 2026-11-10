const a = { name:'order-status-changed-notify', description:'Notify on order status change (stub).', trigger:'event:order.status', async run(ctx){ return { ok: true, ctx }; } };
export default a;
