import { useState } from 'react';
import { Link } from 'react-router-dom';
import { req } from '../lib/api/customClient';

const STATUS_LABELS = {
  draft: 'Draft', pending_payment: 'Awaiting payment', paid: 'Paid',
  making: 'In production', ready: 'Ready for pickup/shipping',
  shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled',
  refunded: 'Refunded', partially_refunded: 'Partially refunded',
};

export default function OrderTracking() {
  const [orderNumber, setOrderNumber] = useState('');
  const [email, setEmail] = useState('');
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setError(''); setOrder(null);
    try {
      const res = await req(`/api/orders/track?orderNumber=${encodeURIComponent(orderNumber)}&email=${encodeURIComponent(email)}`);
      setOrder(res.order);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-serif mb-4">Track your order</h1>
      <form onSubmit={submit} className="space-y-3 mb-6">
        <input value={orderNumber} onChange={e => setOrderNumber(e.target.value)} placeholder="Order number (e.g. KFK-2026-0001)" className="w-full border rounded px-3 py-2" required />
        <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email used at checkout" className="w-full border rounded px-3 py-2" required />
        <button disabled={loading} className="bg-terracotta text-white px-4 py-2 rounded">{loading ? 'Looking up…' : 'Track'}</button>
      </form>
      {error && <p className="text-red-600 mb-4">{error}</p>}
      {order && (
        <div className="border rounded p-4 space-y-4">
          <div>
            <p className="text-sm text-gray-500">Order {order.orderNumber}</p>
            <p className="text-lg font-medium">{STATUS_LABELS[order.status] || order.status}</p>
            {order.trackingNumber && <p className="text-sm">Tracking: {order.trackingNumber}{order.trackingUrl && <> · <a href={order.trackingUrl} className="underline">link</a></>}</p>}
          </div>
          <div>
            <h2 className="font-medium mb-2">Items</h2>
            <ul className="text-sm space-y-1">
              {order.lines.map((l, i) => <li key={i}>{l.title} × {l.quantity} — ${Number(l.lineTotal).toFixed(2)}</li>)}
            </ul>
            <p className="mt-2 font-medium">Total: ${Number(order.total).toFixed(2)} {order.currency}</p>
          </div>
          {order.history?.length > 0 && (
            <div>
              <h2 className="font-medium mb-2">Timeline</h2>
              <ul className="text-sm space-y-1 border-l-2 border-gray-200 pl-3">
                {order.history.map((h, i) => (
                  <li key={i}>
                    <span className="font-medium">{STATUS_LABELS[h.toStatus] || h.toStatus}</span>
                    <span className="text-gray-500 ml-2">{new Date(h.createdAt).toLocaleString()}</span>
                    {h.note && <span className="block text-gray-600">{h.note}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <p className="mt-6 text-sm"><Link to="/shop" className="underline">Continue shopping</Link></p>
    </div>
  );
}