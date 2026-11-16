import { enqueueEmail } from '../services/email.js';

const a = {
  name: 'materials-prep-reminder',
  description: 'Send kit checklist 48h before.',
  trigger: 'cron:daily',
  async run(ctx) {
    const { sessions } = ctx || {};
    if (!sessions?.length) return { ok: true, skipped: true };
    for (const s of sessions) {
      if (s.adminEmail) await enqueueEmail({ to: s.adminEmail, subject: `Kit prep: ${s.title}`, text: 'Prepare materials for upcoming session.' });
    }
    return { ok: true };
  },
};
export default a;
