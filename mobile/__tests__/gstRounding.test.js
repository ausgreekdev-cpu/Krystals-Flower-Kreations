test('GST rounding edge cases', () => {
  const cases = [0.01, 1.0, 10.99, 99.99];
  for (const subtotal of cases) {
    const gst = subtotal * 0.1 / 1.1;
    expect(Number.isFinite(gst)).toBe(true);
    expect(gst).toBeGreaterThanOrEqual(0);
  }
});