import Modal from './Modal';

// Printable packing slip for an order. Content lives inside #label-sheet so the
// shared print stylesheet (@media print → only #label-sheet visible) prints it
// cleanly without the admin chrome.
export default function PackingSlipModal({ order, onClose }) {
  if (!order) return null;
  const lines = Array.isArray(order.lines) ? order.lines : [];
  const careFor = (l) => {
    const p = l.product;
    if (!p) return [];
    const bits = [];
    if (p.careInstructions) bits.push(`Care: ${p.careInstructions}`);
    if (Array.isArray(p.occasions) && p.occasions.length) bits.push(`Perfect for: ${p.occasions.join(', ')}`);
    return bits;
  };
  return (
    <Modal title={`Packing slip — ${order.orderNumber}`} onClose={onClose} wide>
      <div className="space-y-3 no-print">
        <button
          className="px-3 py-1.5 rounded-xl bg-royal-500 text-white font-bold text-sm"
          onClick={() => window.print()}
        >🖨 Print slip</button>
        <p className="text-[11px] text-muted">A4, 100% scale. Only the slip below prints.</p>
      </div>
      <div id="label-sheet" className="mt-3 text-sm text-black">
        <div className="flex justify-between items-start border-b-2 border-black pb-2 mb-3">
          <div>
            <div className="font-bold text-base">Krystals Flower Creations</div>
            <div className="text-xs">Perth, Western Australia • krystalsflowercreations.com.au</div>
          </div>
          <div className="text-right">
            <div className="font-bold">PACKING SLIP</div>
            <div className="text-xs">{order.orderNumber}</div>
            <div className="text-xs">{new Date(order.createdAt).toLocaleDateString('en-AU')}</div>
          </div>
        </div>
        <div className="mb-3">
          <div className="font-bold text-xs uppercase">Ship to</div>
          <div>{order.shippingName}</div>
          <div>{order.shippingAddress}</div>
          <div>{order.shippingSuburb} {order.shippingState} {order.shippingPostcode}</div>
        </div>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-black text-left">
              <th className="py-1 pr-2 w-10">Qty</th>
              <th className="py-1 pr-2">Item</th>
              <th className="py-1 text-right w-20">Each</th>
              <th className="py-1 text-right w-20">Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-b border-black/30 align-top">
                <td className="py-1.5 pr-2">{l.quantity}</td>
                <td className="py-1.5 pr-2">
                  <div className="font-semibold">{l.title}</div>
                  {careFor(l).map((b, bi) => <div key={bi} className="text-[10px] mt-0.5">— {b}</div>)}
                </td>
                <td className="py-1.5 text-right">${Number(l.unitPrice).toFixed(2)}</td>
                <td className="py-1.5 text-right">${(Number(l.unitPrice) * l.quantity).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {order.customerNote && (
          <div className="mt-3 text-xs"><span className="font-bold">Customer note:</span> {order.customerNote}</div>
        )}
        <div className="mt-3 flex justify-between text-xs font-bold border-t-2 border-black pt-2">
          <span>Paid: {order.paymentMethod} • {order.paymentStatus}</span>
          <span>Order total ${Number(order.total).toFixed(2)}</span>
        </div>
      </div>
    </Modal>
  );
}
