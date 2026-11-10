import test from 'node:test';
import assert from 'node:assert/strict';
test('automations registry lists at least 20', async () => {
  const m = await import('../src/automations/index.js');
  assert.ok(m.listAutomations().length >= 20);
});
