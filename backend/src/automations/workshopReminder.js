const a = {
  name: 'workshop-reminder',
  description: 'Send workshop reminders 48h before sessions (stub).',
  trigger: 'cron:daily',
  async run() {
    return { ok: true, note: 'wire to email service + workshop sessions' };
  },
};
export default a;
