import { getSettings } from '../../lib/settingsSchema.js';
import { runAbandonedCartReminders } from '../../services/cartRecovery.js';

export async function run() {
  const settings = await getSettings().catch(() => ({}));
  return runAbandonedCartReminders(settings);
}
