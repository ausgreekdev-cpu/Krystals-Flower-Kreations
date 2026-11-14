const a = {
  name: 'review-digest',
  description: 'Weekly review digest (stub).',
  trigger: 'cron:weekly',
  async run() {
    return { ok: true, note: 'wire to review summary + email' };
  },
};
export default a;
