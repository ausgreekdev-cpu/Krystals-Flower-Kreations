const a = {
  name: 'social-post-scheduled',
  description: 'Post queued social content daily (stub).',
  trigger: 'cron:daily',
  async run() { return { ok: true }; },
};
export default a;
