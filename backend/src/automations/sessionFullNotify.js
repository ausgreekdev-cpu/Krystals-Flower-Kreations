import { enqueueEmail } from '../services/email.js';

const a = {
  name: 'session-full-notify',
  description: 'Notify waitlist when session full.',
  trigger: 'event:session.full',
  async run(ctx) {
    const { session, waitlist } = ctx || {};
    if (!waitlist?.length) return { ok: true, skipped: true };
    for (const w of waitlist) {
      if (w.email) await enqueueEmail({ to: w.email, subject: 'Workshop session full', text: `Session ${session?.id || ''} is now full.` });
    }
    return { ok: true, notified: waitlist.length };
  },
};
export default a;
