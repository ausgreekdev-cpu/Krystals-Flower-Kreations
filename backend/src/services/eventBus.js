// Event bus (item 6): lightweight in-process event emitter for pipeline
// side effects. Provides pub/sub, retry, and dead-letter tracking.
// Events are fire-and-forget by default but can be awaited for critical paths.
import { runSideEffect } from './sideEffects.js';

const listeners = new Map(); // event → Set of handlers
const eventLog = []; // recent events for debugging (capped at 100)

// Register a handler for an event
export function on(event, handler, { priority = 0 } = {}) {
  if (!listeners.has(event)) listeners.set(event, []);
  listeners.get(event).push({ handler, priority });
  listeners.get(event).sort((a, b) => b.priority - a.priority);
  return () => off(event, handler);
}

// Unregister a handler
export function off(event, handler) {
  if (!listeners.has(event)) return;
  listeners.set(event, listeners.get(event).filter((h) => h.handler !== handler));
}

// Emit an event — runs all handlers, best-effort
export async function emit(event, payload = {}, { await: awaitAll = false } = {}) {
  const handlers = listeners.get(event) || [];
  const entry = { event, payload, timestamp: new Date().toISOString(), handlers: handlers.length };
  eventLog.push(entry);
  if (eventLog.length > 100) eventLog.shift();

  if (!handlers.length) return [];

  const results = handlers.map(({ handler }) =>
    runSideEffect(`event:${event}`, () => handler(payload), { context: { event, payload } })
  );

  if (awaitAll) {
    return Promise.all(results);
  }
  // Fire-and-forget
  Promise.all(results).catch(() => {});
  return results.map(() => ({ ok: true, deferred: true }));
}

// List recent events (for debugging/monitoring)
export function recentEvents(limit = 20) {
  return eventLog.slice(-limit).reverse();
}

// List registered events and handler counts
export function registeredEvents() {
  const out = {};
  for (const [event, handlers] of listeners) {
    out[event] = handlers.length;
  }
  return out;
}
