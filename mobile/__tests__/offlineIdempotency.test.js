test('idempotency key generation', () => {
  const id = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  expect(typeof id).toBe('string');
  expect(id.length).toBeGreaterThan(0);
});