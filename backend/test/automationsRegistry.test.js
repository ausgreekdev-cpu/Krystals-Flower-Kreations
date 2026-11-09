import test from 'node:test';
import assert from 'node:assert/strict';
test('automations registry lists 10', async () => {
  const m = await import('../src/automations/index.js');
  assert.equal(m.listAutomations().length, 10);
});
