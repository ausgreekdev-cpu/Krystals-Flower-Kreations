const a = {
  name: 'cert-expiry-check',
  description: 'Check SSL cert expiry (stub).',
  trigger: 'cron:weekly',
  async run() { return { ok: true }; },
};
export default a;
