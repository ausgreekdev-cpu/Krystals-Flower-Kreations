import { enqueueEmail } from '../services/email.js';

const a = {
  name: 'workshop-reminder',
  description: 'Send workshop reminders 48h before sessions.',
  trigger: 'cron:daily',
  async run(ctx) {
    const { sessions } = ctx || {};
    if (!sessions?.length) return { ok: true, skipped: true };
    for (const s of sessions) {
      for (const a of s.attendees || []) {
        if (a.email) await enqueueEmail({ to: a.email, subject: `Reminder: ${s.title}`, text: `Your workshop is on ${s.date}.` });
      }
    }
    return { ok: true };
  },
};
export default a;
