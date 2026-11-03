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
cat > /home/aiuser/Downloads/KFK/backend/src/agents/sentinel/frontend-ingest.js << 'EOF'
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
EOF
cat > /home/aiuser/Downloads/KFK/backend/src/agents/core/workflow-optimizer.js << 'EOF'
// Suggests parallelization opportunities in a DAG.
export function suggestParallelization(dag) {
  const suggestions = [];
  // Find nodes with same parent that have no data dependency between them
  const childrenByParent = new Map();
  for (const e of dag.edges) {
    if (!childrenByParent.has(e.from)) childrenByParent.set(e.from, []);
    childrenByParent.get(e.from).push(e.to);
  }
  for (const [parent, children] of childrenByParent) {
    if (children.length > 1) {
      suggestions.push({ type: 'parallel', parent, children, note: 'These child nodes share a parent and can run in parallel if no data dependency.' });
    }
  }
  return suggestions;
}
EOF
echo done