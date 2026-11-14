const a = {
  name: 'invoice-generated',
  description: 'Generate + email invoice on paid (stub).',
  trigger: 'event:order.paid',
  async run(ctx) { return { ok: true, ctx }; },
};
export default a;
