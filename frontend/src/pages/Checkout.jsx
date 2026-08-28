export default function Checkout(){
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-black text-bloom-700">Checkout — Perth WA</h1>
      <p className="text-sm text-gray-600 mt-2">GST inclusive • Perth metro / WA regional / national shipping • Click & collect • Stripe + Afterpay</p>
      <form className="mt-6 grid gap-4 bg-white p-6 rounded-2xl border" onSubmit={e=>e.preventDefault()}>
        <input placeholder="Email" className="border rounded-xl px-3 py-2" />
        <input placeholder="Full name" className="border rounded-xl px-3 py-2" />
        <input placeholder="Address" className="border rounded-xl px-3 py-2" />
        <div className="grid grid-cols-3 gap-4"><input placeholder="Suburb" className="border rounded-xl px-3 py-2" /><input placeholder="State" defaultValue="WA" className="border rounded-xl px-3 py-2" /><input placeholder="Postcode" className="border rounded-xl px-3 py-2" /></div>
        <input placeholder="Discount code (BLOOM10)" className="border rounded-xl px-3 py-2" />
        <button className="bg-bloom-500 text-white py-3 rounded-xl font-bold">Pay with Stripe</button>
        <p className="text-xs text-gray-500">Backend: POST /api/orders/checkout → Stripe Checkout Session. Orders at /api/orders</p>
      </form>
    </div>
  );
}
