import { enqueueEmail } from '../services/email.js';

const a = {
  name: 'birthday-discount',
  description: 'Send birthday discount (stub).',
  trigger: 'cron:daily',
  async run(ctx) {
    const { customers } = ctx || {};
    if (!customers?.length) return { ok: true, skipped: true };
    for (const c of customers) {
      if (c.email) await enqueueEmail({ to: c.email, subject: 'Happy birthday!', text: 'Here is your birthday discount.' });
    }
    return { ok: true, sent: customers.length };
  },
};
export default a;
