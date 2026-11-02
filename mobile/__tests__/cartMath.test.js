test('GST calc', () => {
  const subtotal = 110;
  const gst = subtotal * 0.1 / 1.1;
  expect(gst).toBeCloseTo(10, 5);
});