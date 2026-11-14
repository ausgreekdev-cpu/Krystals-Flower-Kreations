const a = {
  name: 'digital-delivery-retry',
  description: 'Retry minting download links if email failed (stub).',
  trigger: 'cron:daily',
  async run() { return { ok: true }; },
};
export default a;
