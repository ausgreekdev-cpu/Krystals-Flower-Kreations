// Backend scanner: polls health endpoint and checks for 5xx/unhandled exceptions.
export async function scanBackend(baseUrl) {
  const results = [];
  try {
    const res = await fetch(`${baseUrl}/api/health`);
    results.push({ check: 'health', status: res.status, ok: res.ok });
  } catch (e) {
    results.push({ check: 'health', status: 0, ok: false, error: e?.message });
  }
  return results;
}
EOF
# recreate frontend-ingest.js
cat > /home/aiuser/Downloads/KFK/backend/src/agents/sentinel/frontend-ingest.js << 'INGESTEOF'
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
INGESTEOF
node --check backend/src/agents/sentinel/backend-scanner.js && node --check backend/src/agents/sentinel/frontend-ingest.js && echo OK