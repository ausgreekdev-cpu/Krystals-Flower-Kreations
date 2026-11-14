import { enqueueEmail } from '../services/email.js';

const a = {
  name: 'welcome-email',
  description: 'Send welcome email on registration.',
  trigger: 'event:user.registered',
  async run(ctx) {
    const user = ctx?.user;
    if (!user?.email) return { ok: true, skipped: true };
    await enqueueEmail({ to: user.email, subject: 'Welcome to Krystal\'s Flower Kreations', text: `Hi ${user.name || 'there'}, thanks for joining!` });
    return { ok: true, queued: true };
  },
};
export default a;
