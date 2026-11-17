import { enqueueEmail } from '../services/email.js';

const a = {
  name: 'no-show-followup',
  description: 'Follow up no-shows.',
  trigger: 'cron:daily',
  async run(ctx) {
    const { noShows } = ctx || {};
    if (!noShows?.length) return { ok: true, skipped: true };
    for (const n of noShows) {
      if (n.email) await enqueueEmail({ to: n.email, subject: 'We missed you', text: 'Sorry you could not make it. Rebook anytime.' });
    }
    return { ok: true, sent: noShows.length };
  },
};
export default a;
