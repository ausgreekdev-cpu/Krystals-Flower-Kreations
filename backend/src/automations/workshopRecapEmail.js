import { enqueueEmail } from '../services/email.js';

const a = {
  name: 'workshop-recap-email',
  description: 'Send recap to attendees.',
  trigger: 'cron:daily',
  async run(ctx) {
    const { attendees, recap } = ctx || {};
    if (!attendees?.length) return { ok: true, skipped: true };
    for (const a of attendees) {
      if (a.email) await enqueueEmail({ to: a.email, subject: 'Workshop recap', text: recap || 'Thanks for attending!' });
    }
    return { ok: true, sent: attendees.length };
  },
};
export default a;
