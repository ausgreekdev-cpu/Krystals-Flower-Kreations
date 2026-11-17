import { enqueueEmail } from '../services/email.js';

const a = {
  name: 'post-workshop-survey',
  description: 'Send survey after workshop.',
  trigger: 'cron:daily',
  async run(ctx) {
    const { attendees } = ctx || {};
    if (!attendees?.length) return { ok: true, skipped: true };
    for (const a of attendees) {
      if (a.email) await enqueueEmail({ to: a.email, subject: 'Workshop feedback', text: 'Please share your feedback.' });
    }
    return { ok: true, sent: attendees.length };
  },
};
export default a;
