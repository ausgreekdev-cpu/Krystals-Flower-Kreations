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
import negativeStockAlert from './negativeStockAlert.js';
import inventorySnapshot from './inventorySnapshot.js';
import variantStockSync from './variantStockSync.js';
import stocktakeDueReminder from './stocktakeDueReminder.js';
import errorDigest from './errorDigest.js';
import dbHealthCheck from './dbHealthCheck.js';
import slowMoverFlag from './slowMoverFlag.js';
import paymentFailedNotify from './paymentFailedNotify.js';
import orderStatusChangedNotify from './orderStatusChangedNotify.js';
import orderStuckInPending from './orderStuckInPending.js';
import welcomeEmail from './welcomeEmail.js';
import reviewRequest from './reviewRequest.js';
import sessionFullNotify from './sessionFullNotify.js';
import sessionCancelledNotify from './sessionCancelledNotify.js';
import noShowFollowup from './noShowFollowup.js';
import materialsPrepReminder from './materialsPrepReminder.js';
import postWorkshopSurvey from './postWorkshopSurvey.js';
import workshopRecapEmail from './workshopRecapEmail.js';
import digitalDeliveryRetry from './digitalDeliveryRetry.js';

const all = [
  newOrderNotify, lowStockAlert, cartCleanup, emailQueueDrain, backupDump, rateLimitPurge, imageVariantBackfill, staleDraftCleanup, workshopReminder, reviewDigest,
  negativeStockAlert, inventorySnapshot, variantStockSync, stocktakeDueReminder, errorDigest, dbHealthCheck, slowMoverFlag,
  paymentFailedNotify, orderStatusChangedNotify, orderStuckInPending, welcomeEmail, reviewRequest, sessionFullNotify, sessionCancelledNotify, noShowFollowup, materialsPrepReminder, postWorkshopSurvey, workshopRecapEmail, newBlogPostNotify, highValueOrderAlert, refundIssuedNotify, duplicateOrderDetect, digitalDeliveryRetry,
];
for (const a of all) registerAutomation(a);

export { registerAutomation, getAutomation, listAutomations, runAutomation } from './registry.js';
