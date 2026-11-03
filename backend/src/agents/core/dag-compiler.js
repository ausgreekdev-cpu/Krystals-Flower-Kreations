// DAG compiler for Workflow Synthesizer.
// Validates a workflow definition, detects cycles, topologically sorts nodes,
// and returns an execution plan. Supports both legacy linear `steps` arrays and
// DAG-shaped `{ nodes, edges }` definitions for backwards compatibility.

export function isDag(def) {
  return def && Array.isArray(def.nodes) && Array.isArray(def.edges);
}

export function isLegacySteps(def) {
  return def && Array.isArray(def.steps) && !Array.isArray(def.nodes);
}

export function normalizeToDag(def) {
  if (isDag(def)) return { nodes: def.nodes, edges: def.edges };
  if (isLegacySteps(def)) {
    // Convert linear steps into a sequential DAG
    const nodes = def.steps.map((s, i) => ({ id: `step_${i}`, type: s.type || 'task', data: s, label: s.name || `Step ${i + 1}` }));
    const edges = nodes.slice(1).map((n, i) => ({ from: nodes[i].id, to: n.id }));
    return { nodes, edges };
  }
  return { nodes: [], edges: [] };
}

export function validateDag(dag) {
  const errors = [];
  if (!dag || !Array.isArray(dag.nodes)) errors.push('nodes must be an array');
  if (!dag || !Array.isArray(dag.edges)) errors.push('edges must be an array');
  if (errors.length) return { valid: false, errors };

  const ids = new Set(dag.nodes.map((n) => n.id));
  for (const n of dag.nodes) {
    if (!n.id) errors.push('node missing id');
  }
  for (const e of dag.edges) {
    if (!ids.has(e.from)) errors.push(`edge references unknown node: ${e.from}`);
    if (!ids.has(e.to)) errors.push(`edge references unknown node: ${e.to}`);
  }

  // Cycle detection via Kahn's algorithm
  const inDeg = new Map(dag.nodes.map((n) => [n.id, 0]));
  const adj = new Map(dag.nodes.map((n) => [n.id, []]));
  for (const e of dag.edges) {
    if (inDeg.has(e.to)) inDeg.set(e.to, inDeg.get(e.to) + 1);
    if (adj.has(e.from)) adj.get(e.from).push(e.to);
  }
  const queue = [];
  for (const [id, d] of inDeg) if (d === 0) queue.push(id);
  const sorted = [];
  while (queue.length) {
    const u = queue.shift();
    sorted.push(u);
    for (const v of adj.get(u) || []) {
      inDeg.set(v, inDeg.get(v) - 1);
      if (inDeg.get(v) === 0) queue.push(v);
    }
  }
  if (sorted.length !== dag.nodes.length) errors.push('DAG contains a cycle');

  return { valid: errors.length === 0, errors, topologicalOrder: sorted };
}

export function compile(def) {
  const dag = normalizeToDag(def);
  const validation = validateDag(dag);
  if (!validation.valid) return { ok: false, errors: validation.errors };
  return { ok: true, dag, topologicalOrder: validation.topologicalOrder };
}
