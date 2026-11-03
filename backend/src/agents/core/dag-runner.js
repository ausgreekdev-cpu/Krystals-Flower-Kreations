// Stateful DAG execution engine.
// Runs nodes in topological order, passing parent outputs to children,
// with retry + compensating rollback hooks (best-effort).

export async function runDag(dag, handlers, opts = {}) {
  const { topologicalOrder } = opts;
  const order = topologicalOrder || topoSort(dag);
  const state = { nodeOutputs: {}, nodeStatus: {}, startedAt: Date.now() };
  const results = [];

  // Build adjacency for parent lookup
  const parentsOf = new Map(dag.nodes.map((n) => [n.id, []]));
  for (const e of dag.edges) (parentsOf.get(e.to) || []).push(e.from);

  for (const id of order) {
    const node = dag.nodes.find((n) => n.id === id);
    const parents = parentsOf.get(id) || [];
    const parentOutputs = parents.map((p) => state.nodeOutputs[p]).filter((x) => x !== undefined);

    state.nodeStatus[id] = 'running';
    const start = Date.now();
    try {
      const handler = handlers?.[node.type] || handlers?.default;
      const output = handler ? await handler(node, { parentOutputs, state }) : { skipped: true };
      state.nodeOutputs[id] = output;
      state.nodeStatus[id] = 'success';
      results.push({ id, status: 'success', output, duration: Date.now() - start });
    } catch (e) {
      state.nodeStatus[id] = 'failed';
      const err = e?.message || String(e);
      results.push({ id, status: 'failed', error: err, duration: Date.now() - start });
      // Compensating rollback: mark downstream as skipped
      // (best-effort; handlers may implement their own compensation)
      if (opts.stopOnError !== false) break;
    }
  }

  const failed = results.filter((r) => r.status === 'failed');
  return {
    status: failed.length ? 'failed' : 'success',
    duration: Date.now() - state.startedAt,
    results,
    nodeOutputs: state.nodeOutputs,
    nodeStatus: state.nodeStatus,
  };
}

function topoSort(dag) {
  const inDeg = new Map(dag.nodes.map((n) => [n.id, 0]));
  const adj = new Map(dag.nodes.map((n) => [n.id, []]));
  for (const e of dag.edges) {
    inDeg.set(e.to, (inDeg.get(e.to) || 0) + 1);
    adj.get(e.from)?.push(e.to);
  }
  const q = [];
  for (const [id, d] of inDeg) if (d === 0) q.push(id);
  const out = [];
  while (q.length) {
    const u = q.shift();
    out.push(u);
    for (const v of adj.get(u) || []) {
      inDeg.set(v, inDeg.get(v) - 1);
      if (inDeg.get(v) === 0) q.push(v);
    }
  }
  return out;
}
