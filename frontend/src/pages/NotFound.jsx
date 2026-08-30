import { Link } from 'react-router-dom';
export default function NotFound(){
  return (
    <div className="max-w-3xl mx-auto p-12 text-center">
      <div className="text-6xl">✿</div>
      <h1 className="text-3xl font-black text-bloom-700 mt-4">404 — Bloom not found</h1>
      <p className="text-gray-600 mt-2">The page you wilted to doesn't exist. Try our everlasting bouquets instead.</p>
      <div className="mt-6 flex gap-3 justify-center">
        <Link to="/" className="bg-bloom-500 text-white px-6 py-3 rounded-xl font-bold">Home</Link>
        <Link to="/shop" className="border px-6 py-3 rounded-xl font-bold hover:bg-bloom-50">Shop</Link>
        <Link to="/configurator" className="border px-6 py-3 rounded-xl font-bold hover:bg-bloom-50">Configurator</Link>
      </div>
      <p className="text-xs text-gray-400 mt-6">If you followed a QR ticket, check the code or contact krystal@krystalsflowerkreations.com.au</p>
    </div>
  );
}
