import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compile, validateDag, normalizeToDag, isDag, isLegacySteps } from '../src/agents/core/dag-compiler.js';
import { fingerprintIncident } from '../src/agents/sentinel/normalizer.js';

test('DAG compiler: valid dag compiles', () => {
  const def = { nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ from: 'a', to: 'b' }] };
  const r = compile(def);
  assert.equal(r.ok, true);
  assert.deepEqual(r.topologicalOrder, ['a', 'b']);
});

test('DAG compiler: detects cycle', () => {
  const def = { nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }] };
  const r = compile(def);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /cycle/i.test(e)));
});

test('DAG compiler: legacy steps normalize to sequential dag', () => {
  const def = { steps: [{ type: 'skill', name: 'a' }, { type: 'function', name: 'b' }] };
  assert.equal(isLegacySteps(def), true);
  const dag = normalizeToDag(def);
  assert.equal(dag.nodes.length, 2);
  assert.equal(dag.edges.length, 1);
  const r = compile(def);
  assert.equal(r.ok, true);
});

test('DAG compiler: edge references unknown node fails', () => {
  const def = { nodes: [{ id: 'a' }], edges: [{ from: 'a', to: 'missing' }] };
  const r = compile(def);
  assert.equal(r.ok, false);
});

test('fingerprintIncident: same input yields same fingerprint', () => {
  const a = fingerprintIncident({ source: 'frontend', title: 'err', stackTrace: 'at foo:10:5' });
  const b = fingerprintIncident({ source: 'frontend', title: 'err', stackTrace: 'at foo:20:9' });
  assert.equal(a, b);
});

test('fingerprintIncident: different titles yield different fingerprints', () => {
  const a = fingerprintIncident({ source: 'frontend', title: 'err1', stackTrace: 'x' });
  const b = fingerprintIncident({ source: 'frontend', title: 'err2', stackTrace: 'x' });
  assert.notEqual(a, b);
});
