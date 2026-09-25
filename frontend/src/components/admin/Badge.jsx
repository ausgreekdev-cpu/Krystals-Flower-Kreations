const COLORS = {
  paid: 'bg-emerald-100 text-emerald-700',
  delivered: 'bg-emerald-100 text-emerald-700',
  approved: 'bg-emerald-100 text-emerald-700',
  pending_payment: 'bg-amber-100 text-amber-700',
  making: 'bg-royal-100 text-royal-700',
  ready: 'bg-royal-100 text-royal-700',
  pending: 'bg-amber-100 text-amber-700',
  shipped: 'bg-sky-100 text-sky-700',
  confirmed: 'bg-emerald-100 text-emerald-700',
  waitlisted: 'bg-amber-100 text-amber-700',
  draft: 'bg-surface3 text-muted',
  cancelled: 'bg-red-100 text-red-600',
  refunded: 'bg-red-100 text-red-600',
  partially_refunded: 'bg-orange-100 text-orange-700',
  failed: 'bg-red-100 text-red-600',
  open: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-surface3 text-muted',
  published: 'bg-emerald-100 text-emerald-700',
  review: 'bg-amber-100 text-amber-700',
  archived: 'bg-surface3 text-muted',
  paid_default: 'bg-emerald-100 text-emerald-700',
};

export default function StatusBadge({ value }) {
  const v = String(value || '').toLowerCase();
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${COLORS[v] || 'bg-surface3 text-muted'}`}>
      {value || '—'}
    </span>
  );
}