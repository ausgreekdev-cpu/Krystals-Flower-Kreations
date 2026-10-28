// Centralized notification dispatcher (item 3): one entry point for all
// studio alerts. Routes events to the right email template based on the
// event type, respecting per-channel settings. Callers use notify(event, payload)
// instead of importing individual send*Alert functions.
import {
  sendAdminOrderAlert,
  sendAdminBookingAlert,
  sendAdminCustomOrderAlert,
  sendStatusUpdate,
} from './email.js';

const HANDLERS = {
  'order.created': (payload) => sendAdminOrderAlert(payload.order),
  'order.status_changed': (payload) => sendStatusUpdate(payload.order, payload.fromStatus, payload.toStatus),
  'booking.created': (payload) => sendAdminBookingAlert(payload.booking, payload.workshop, payload.session),
  'custom_order.created': (payload) => sendAdminCustomOrderAlert(payload.order),
};

// Fire a notification. Best-effort: never throws, never blocks the caller.
export async function notify(event, payload = {}) {
  const handler = HANDLERS[event];
  if (!handler) {
    console.warn(JSON.stringify({ level: 'warn', msg: 'unknown_notification_event', event }));
    return null;
  }
  try {
    return await handler(payload);
  } catch (e) {
    console.error(JSON.stringify({ level: 'error', msg: 'notification_failed', event, err: e?.message }));
    return null;
  }
}

// Registry of supported events (for documentation / frontend)
export const NOTIFICATION_EVENTS = Object.keys(HANDLERS);
