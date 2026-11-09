import test from 'node:test';
import assert from 'node:assert/strict';
test('agents registry lists 10 agents', async () => {
  const m = await import('../src/agents/index.js');
  assert.equal(m.listAgents().length, 10);
});
