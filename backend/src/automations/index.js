import { registerAutomation } from './registry.js';
import newOrderNotify from './newOrderNotify.js';
import lowStockAlert from './lowStockAlert.js';
import cartCleanup from './cartCleanup.js';
import emailQueueDrain from './emailQueueDrain.js';
import backupDump from './backupDump.js';
import rateLimitPurge from './rateLimitPurge.js';
import imageVariantBackfill from './imageVariantBackfill.js';
import staleDraftCleanup from './staleDraftCleanup.js';
import workshopReminder from './workshopReminder.js';
import reviewDigest from './reviewDigest.js';

for (const a of [newOrderNotify, lowStockAlert, cartCleanup, emailQueueDrain, backupDump, rateLimitPurge, imageVariantBackfill, staleDraftCleanup, workshopReminder, reviewDigest]) registerAutomation(a);

export { registerAutomation, getAutomation, listAutomations, runAutomation } from './registry.js';
