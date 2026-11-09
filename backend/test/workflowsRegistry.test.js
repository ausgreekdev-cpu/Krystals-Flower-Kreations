import test from 'node:test';
import assert from 'node:assert/strict';
test('workflows registry lists 10', async () => {
  const m = await import('../src/workflows/index.js');
  assert.equal(m.listWorkflows().length, 10);
});
