// Strip fields that must never reach non-staff clients.
//
// - `svgUrl` is the PRIVATE digital-assets storage ref for the purchased
//   Cricut template (delivered only via tokenized /api/dl/:token) — the ref
//   itself is not a public URL but it is an internal storage key.
// - `cost` is unit cost (margin) — storefront display uses `price` only.
// Staff routes (`?all=1`, admin CRUD responses) keep the raw row; every
// public serialization (storefront products, cart items, blog post embeds)
// runs through here.
const INTERNAL_FIELDS = ['svgUrl', 'cost'];

export function publicProduct(product) {
  if (!product || typeof product !== 'object') return product;
  const copy = { ...product };
  for (const f of INTERNAL_FIELDS) delete copy[f];
  return copy;
}

export function publicProducts(list) {
  return Array.isArray(list) ? list.map(publicProduct) : list;
}

// cart.items[].product / post.products[].product
export function publicNestedProducts(rows, key = 'product') {
  if (!Array.isArray(rows)) return rows;
  return rows.map((row) =>
    row && typeof row === 'object' && row[key] ? { ...row, [key]: publicProduct(row[key]) } : row,
  );
}
