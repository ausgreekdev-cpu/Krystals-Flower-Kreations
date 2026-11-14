import { enqueueEmail } from '../services/email.js';

const a = {
  name: 'session-full-notify',
  description: 'Notify waitlist when session full (stub).',
  trigger: 'event:session.full',
  async run(ctx) {
    return { ok: true, ctx };
  },
};
export default a;
