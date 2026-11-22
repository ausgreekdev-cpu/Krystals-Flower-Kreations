const a = {
  name: 'broken-link-check',
  description: 'Scan site for 404s (stub).',
  trigger: 'cron:weekly',
  async run() { return { ok: true }; },
};
export default a;
