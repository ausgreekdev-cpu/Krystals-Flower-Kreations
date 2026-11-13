import { drainEmailQueue } from '../services/email.js';

const a = {
  name: 'email-queue-drain',
  description: 'Drain pending emails.',
  trigger: 'cron:hourly',
  async run() {
    const r = await drainEmailQueue(50);
    return r;
  },
};
export default a;
