import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

export default function StockProfilePage() {
  const { ticker } = useParams();
  const [stock, setStock] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ok | not_found | error
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setStatus('loading');
    setStock(null);
    fetch(`/api/stocks/${ticker}`, { signal: ctrl.signal })
      .then(async (res) => {
        if (ctrl.signal.aborted) return;
        if (res.status === 404) { setStatus('not_found'); return; }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (ctrl.signal.aborted) return;
        setStock(data);
        setStatus('ok');
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setStatus('error');
      });
    return () => ctrl.abort();
  }, [ticker, attempt]);

  if (status === 'loading') {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="text-sm text-muted animate-pulse">Loading profile…</div>
      </div>
    );
  }

  if (status === 'not_found') {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-3">
        <div className="bg-surface2 border rounded-2xl p-6 text-center space-y-2">
          <div className="font-black text-ink text-lg">No stock profile for “{ticker}”</div>
          <p className="text-sm text-muted">Check the ticker and try again.</p>
          <Link to="/" className="inline-block text-sm font-bold text-royal-600 hover:underline">Back home</Link>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="bg-surface2 border rounded-2xl p-6 text-center space-y-2">
          <div className="font-black text-ink text-lg">Couldn’t load the profile</div>
          <p className="text-sm text-muted">The quotes service didn’t respond.</p>
          <button onClick={() => setAttempt((a) => a + 1)} className="bg-bloom-500 text-white px-5 py-2 rounded-xl font-bold text-sm">Retry</button>
        </div>
      </div>
    );
  }

  const up = Number(stock.change) >= 0;
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-ink">{stock.company_name} <span className="text-muted">({stock.ticker})</span></h1>
          <div className="text-xs text-muted mt-1">{stock.sector} • {stock.currency}</div>
        </div>
        <Link to="/" className="text-xs font-bold text-royal-600 hover:underline shrink-0">Home</Link>
      </div>
      <div className="bg-surface2 border rounded-2xl p-6">
        <div className="text-3xl font-black text-ink">${Number(stock.current_price).toFixed(2)}</div>
        <div className={`text-sm font-bold mt-1 ${up ? 'text-green-600' : 'text-red-600'}`}>
          {up ? '+' : ''}{Number(stock.change).toFixed(2)} ({up ? '+' : ''}{Number(stock.change_percent).toFixed(1)}%) today
        </div>
      </div>
      <div className="bg-surface2 border rounded-2xl p-6 space-y-2">
        <h3 className="font-black text-ink">About</h3>
        <p className="text-sm text-muted leading-relaxed">{stock.description}</p>
      </div>
      <p className="text-xs text-muted">Mock quote for demonstration — not investment advice.</p>
    </div>
  );
}
