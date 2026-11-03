// Frontend telemetry ingestion helper (called by route).
export function normalizeFrontendPayload(payload) {
  return {
    source: 'frontend',
    title: payload?.message || payload?.title || 'Frontend error',
    stackTrace: payload?.stack || payload?.stackTrace || null,
    payload,
    statusCode: payload?.status || null,
    errorType: payload?.type || 'window.onerror',
  };
}
