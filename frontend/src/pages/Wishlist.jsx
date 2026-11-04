import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { wishlistApi, getToken, getUser } from '../lib/api/customClient';

export default function Wishlist() {
  const token = getToken();
  const _user = getUser();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    wishlistApi.list(token)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [token]);

  const remove = async (productId) => {
    if (!token) return;
    await wishlistApi.remove(token, productId).catch(() => {});
    setItems((prev) => prev.filter((i) => i.product?.id !== productId && i.productId !== productId));
  };

  if (!token) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-serif mb-2">Your wishlist</h1>
        <p className="text-muted mb-4">Sign in to save items for later.</p>
        <Link to="/login" className="bg-terracotta text-white px-4 py-2 rounded">Sign in</Link>
      </div>
    );
  }

  if (loading) return <div className="max-w-2xl mx-auto px-4 py-12 text-center">Loading…</div>;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-serif mb-4">Your wishlist</h1>
      {items.length === 0 ? (
        <p className="text-muted">No saved items yet. <Link to="/shop" className="underline">Browse the shop</Link></p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {items.map((w) => {
            const p = w.product;
            const img = p?.images?.[0]?.url;
            return (
              <div key={w.id} className="border rounded-lg p-3">
                {img && <img src={img} alt={p.title} className="w-full h-40 object-cover rounded mb-2" />}
                <Link to={`/product/${p?.slug}`} className="font-medium hover:underline">{p?.title}</Link>
                <p className="text-sm text-muted">${Number(p?.price).toFixed(2)}</p>
                <button onClick={() => remove(p?.id)} className="text-xs text-red-600 mt-1">Remove</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}