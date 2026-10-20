import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Page, PageHeader } from '../components/ui/Page.jsx';
import Btn from '../components/ui/Btn.jsx';
import Alert from '../components/ui/Alert.jsx';
import { CardSkeleton, EmptyState, ErrorState } from '../components/ui/State.jsx';
import ResponsiveImage from '../components/ResponsiveImage.jsx';
import { accountApi, getToken, getUser } from '../lib/api/customClient';

// Customer account: order history + every digital file this account has paid
// for. Digital links are re-signed on load, so they keep working long after the
// 30-day link in the confirmation email has expired.
const TABS = [
  { id: 'orders', label: 'Orders' },
  { id: 'downloads', label: 'Downloads' },
];

const CHIP = 'px-3 py-1.5 rounded-full text-xs border transition';
const CHIP_ON = 'bg-bloom-500 text-white border-bloom-500';
const CHIP_OFF = 'bg-surface2 hover:bg-surface3';

// Status colours ride the semantic ramps so they flip in dark mode.
const STATUS_TONE = {
  pending_payment: 'bg-warning-50 border-warning-200 text-warning-800',
  paid: 'bg-success-50 border-success-200 text-success-800',
  making: 'bg-surface3 border-line text-ink',
  ready: 'bg-success-50 border-success-200 text-success-800',
  shipped: 'bg-surface3 border-line text-ink',
  delivered: 'bg-success-50 border-success-200 text-success-800',
  partially_refunded: 'bg-warning-50 border-warning-200 text-warning-800',
  refunded: 'bg-danger-50 border-danger-200 text-danger-800',
  cancelled: 'bg-danger-50 border-danger-200 text-danger-800',
};

const label = (s) => String(s || '').replace(/_/g, ' ');
const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

function OrderCard({ order }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="bg-surface2 border rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full text-left px-4 py-3 md:px-5 flex flex-wrap items-center gap-x-4 gap-y-2 hover:bg-surface3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bloom-500"
      >
        <span className="font-bold text-ink">{order.orderNumber}</span>
        <span className={`${CHIP} ${STATUS_TONE[order.status] || 'bg-surface3 border-line text-ink'}`}>{label(order.status)}</span>
        <span className="text-xs text-muted">{fmtDate(order.createdAt)}</span>
        <span className="text-xs text-muted">{order.itemCount} item{order.itemCount === 1 ? '' : 's'}</span>
        <span className="ml-auto font-black text-ink tabular-nums">{money(order.total)}</span>
        <span aria-hidden="true" className="text-muted text-xs">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="border-t px-4 py-4 md:px-5 space-y-3">
          <ul className="space-y-3">
            {order.lines.map((l) => (
              <li key={l.id} className="flex items-center gap-3">
                {l.image ? (
                  <ResponsiveImage
                    image={l.image}
                    alt=""
                    sizes="56px"
                    className="w-14 h-14 rounded-xl object-cover border shrink-0"
                  />
                ) : (
                  <span className="w-14 h-14 rounded-xl bg-surface3 border shrink-0 grid place-items-center text-[10px] text-muted">
                    {l.isDigital ? 'File' : '—'}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-ink font-semibold truncate">
                    {l.productSlug ? <Link to={`/product/${l.productSlug}`} className="hover:text-highlight">{l.title}</Link> : l.title}
                  </div>
                  <div className="text-xs text-muted">
                    {l.quantity} × {money(l.unitPrice)}{l.variant ? ` · ${l.variant}` : ''}{l.isDigital ? ' · instant download' : ''}
                  </div>
                </div>
                <span className="text-sm text-ink tabular-nums shrink-0">{money(l.lineTotal)}</span>
              </li>
            ))}
          </ul>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm border-t pt-3 max-w-xs">
            <dt className="text-muted">Subtotal</dt><dd className="text-right text-ink tabular-nums">{money(order.subtotal)}</dd>
            {order.discountTotal > 0 && (<><dt className="text-muted">Discount</dt><dd className="text-right text-ink tabular-nums">−{money(order.discountTotal)}</dd></>)}
            <dt className="text-muted">Shipping</dt><dd className="text-right text-ink tabular-nums">{money(order.shippingCost)}</dd>
            <dt className="font-bold text-ink">Total (GST incl.)</dt><dd className="text-right font-black text-ink tabular-nums">{money(order.total)}</dd>
          </dl>

          <div className="text-xs text-muted space-y-1">
            {order.shipping?.address && (
              <p>Delivering to {order.shipping.name} — {order.shipping.address}, {order.shipping.suburb} {order.shipping.state} {order.shipping.postcode}</p>
            )}
            {order.trackingNumber && (
              <p>
                Tracking: {order.trackingUrl
                  ? <a href={order.trackingUrl} className="underline text-highlight" target="_blank" rel="noopener noreferrer">{order.trackingNumber}</a>
                  : order.trackingNumber}
              </p>
            )}
            <p>Payment: {label(order.paymentMethod) || '—'} ({label(order.paymentStatus)})</p>
          </div>

          {order.hasDownloads && (
            <Btn variant="soft" size="sm" to="/account?tab=downloads" className="mt-1">Get your downloads</Btn>
          )}
        </div>
      )}
    </li>
  );
}

function DownloadsList({ downloads }) {
  if (!downloads.length) {
    return (
      <EmptyState
        title="No downloads yet"
        body="Digital templates you buy appear here permanently — re-download any time, even years later."
        action={<Btn to="/shop" variant="soft" size="md">Browse the shop</Btn>}
      />
    );
  }
  return (
    <ul className="divide-y border rounded-2xl bg-surface2 overflow-hidden">
      {downloads.map((d) => (
        <li key={d.lineId} className="flex flex-wrap items-center gap-3 px-4 py-3 md:px-5">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-ink truncate">{d.title}</div>
            <div className="text-xs text-muted">
              {d.orderNumber} · purchased {fmtDate(d.orderedAt)}{d.quantity > 1 ? ` · ${d.quantity} copies` : ''}
            </div>
          </div>
          {/* Plain anchor, not a router Link: /api/dl streams the file as an
              attachment, so an SPA navigation would blow the download away. */}
          <a
            href={d.url}
            className="px-5 py-2 rounded-xl text-sm border bg-surface2 hover:bg-surface3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bloom-500 shrink-0"
          >
            Download
          </a>
        </li>
      ))}
    </ul>
  );
}

export default function Account() {
  const token = getToken();
  const user = getUser();
  const location = useLocation();
  const [tab, setTab] = useState(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    return TABS.some((x) => x.id === t) ? t : 'orders';
  });

  // In-page links carry the tab in the query (?tab=downloads). A router Link
  // doesn't remount the page, so follow the query rather than only reading it
  // on mount.
  useEffect(() => {
    const t = new URLSearchParams(location.search).get('tab');
    if (t && TABS.some((x) => x.id === t)) setTab((cur) => (cur === t ? cur : t));
  }, [location.search]);
  const [orders, setOrders] = useState([]);
  const [downloads, setDownloads] = useState([]);
  const [loading, setLoading] = useState(Boolean(token));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    let live = true;
    setLoading(true);
    setError('');
    Promise.all([accountApi.orders(token), accountApi.downloads(token)])
      .then(([o, d]) => {
        if (!live) return;
        setOrders(Array.isArray(o.orders) ? o.orders : []);
        setDownloads(Array.isArray(d.downloads) ? d.downloads : []);
      })
      .catch((e) => { if (live) setError(e?.message || 'Could not load your account'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [token]);

  function selectTab(id) {
    setTab(id);
    const url = new URL(window.location.href);
    if (id === 'orders') url.searchParams.delete('tab'); else url.searchParams.set('tab', id);
    window.history.replaceState({}, '', url);
  }

  if (!token) {
    return (
      <Page width="default">
        <PageHeader title="Your account" lede="Orders, downloads and details in one place." />
        <div className="mt-6">
          <EmptyState
            title="Sign in to see your orders"
            body="Your order history and any digital templates you've bought live here."
            action={<Btn to="/login?next=/account" size="md">Sign in</Btn>}
          />
        </div>
      </Page>
    );
  }

  return (
    <Page width="default">
      <PageHeader
        title="Your account"
        lede={user?.email ? `Signed in as ${user.email}` : 'Orders and downloads in one place.'}
      />

      <div className="mt-5 flex flex-wrap items-center gap-2" role="tablist" aria-label="Account sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => selectTab(t.id)}
            className={`${CHIP} ${tab === t.id ? CHIP_ON : CHIP_OFF} font-semibold`}
          >
            {t.label}
            {t.id === 'downloads' && downloads.length > 0 && (
              <span className="ml-1.5 opacity-80">{downloads.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-5" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {loading && <div className="space-y-3"><CardSkeleton /><CardSkeleton lines={2} /></div>}

        {!loading && error && (
          <div className="space-y-3">
            <ErrorState>{error}</ErrorState>
            <Btn variant="soft" size="md" onClick={() => window.location.reload()}>Try again</Btn>
          </div>
        )}

        {!loading && !error && tab === 'orders' && (
          orders.length
            ? <ul className="space-y-3">{orders.map((o) => <OrderCard key={o.id} order={o} />)}</ul>
            : (
              <EmptyState
                title="No orders yet"
                body={`Nothing on this account's email yet. Orders placed as a guest with ${user?.email || 'this email'} show up here after you sign in.`}
                action={<Btn to="/shop" size="md">Start shopping</Btn>}
              />
            )
        )}

        {!loading && !error && tab === 'downloads' && <DownloadsList downloads={downloads} />}
      </div>

      <Alert tone="info" className="mt-8">
        Need to change your password? <Link to="/forgot-password" className="underline text-highlight">Send yourself a reset link</Link> — it arrives by email and works once.
      </Alert>
    </Page>
  );
}
