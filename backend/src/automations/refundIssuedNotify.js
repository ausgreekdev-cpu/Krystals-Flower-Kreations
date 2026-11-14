const a = {
  name: 'refund-issued-notify',
  description: 'Notify on refund (stub).',
  trigger: 'event:refund.issued',
  async run(ctx) { return { ok: true, ctx }; },
};
export default a;
