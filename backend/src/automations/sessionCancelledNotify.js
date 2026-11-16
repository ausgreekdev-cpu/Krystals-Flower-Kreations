import { enqueueEmail } from '../services/email.js';

const a = {
  name: 'session-cancelled-notify',
  description: 'Notify attendees on cancellation.',
  trigger: 'event:session.cancelled',
  async run(ctx) {
    const { attendees } = ctx || {};
    if (!attendees?.length) return { ok: true, skipped: true };
    for (const a of attendees) {
      if (a.email) await enqueueEmail({ to: a.email, subject: 'Workshop cancelled', text: 'Your workshop session has been cancelled.' });
    }
    return { ok: true, notified: attendees.length };
  },
};
export default a;
