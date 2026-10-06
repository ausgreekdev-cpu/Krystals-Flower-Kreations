import { useEffect, useState } from 'react';
import { adminApi } from '../../lib/api/customClient';
import Modal from './Modal.jsx';
import { useToast } from './Toast';

const Btn = ({ children, onClick, color = 'royal', disabled, small }) => (
  <button onClick={onClick} disabled={disabled}
    className={`inline-flex items-center gap-1 rounded-xl font-semibold disabled:opacity-50 transition-colors ${small ? 'px-2.5 py-1 text-xs' : 'px-4 py-2 text-sm'} ${color === 'royal' ? 'bg-royal-600 text-white hover:bg-royal-700' : color === 'ghost' ? 'border border-line-strong text-ink hover:bg-surface3' : color === 'red' ? 'bg-red-600 text-white hover:bg-red-700' : ''}`}>{children}</button>
);

const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const statusTone = (s) => ({
  received: 'bg-emerald-100 text-emerald-700', cancelled: 'bg-gray-200 text-gray-600',
  ordered: 'bg-royal-100 text-royal-700', partial: 'bg-amber-100 text-amber-700',
}[s] || 'bg-surface3 text-muted');

// Supplier drill-in: stats, contact quick actions, linked materials + POs.
export default function SupplierDetail({ supplierId, seed, token, onClose, onEdit, onChanged, onOpenMaterial }) {
  const toast = useToast();
  const [s, setS] = useState(seed || null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supplierId) return;
    adminApi.suppliers.get(supplierId, token)
      .then((r) => { setS(r); setErr(''); })
      .catch((e) => setErr(e.message));
  }, [supplierId, token]);

  async function toggleActive() {
    if (!s) return;
    setBusy(true);
    try {
      const r = await adminApi.suppliers.update(s.id, { isActive: !s.isActive }, token);
      setS((prev) => ({ ...prev, isActive: r.isActive }));
      toast(r.isActive ? 'Supplier activated' : 'Supplier deactivated');
      onChanged?.();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  if (!s) {
    return (
      <Modal title="Supplier" onClose={onClose}>
        <div className="text-xs text-muted py-8 text-center">{err || 'Loading…'}</div>
      </Modal>
    );
  }

  const stats = s.stats || {};
  const materials = Array.isArray(s.rawMaterials) ? s.rawMaterials : [];
  const pos = Array.isArray(s.purchaseOrders) ? s.purchaseOrders : [];
  const email = String(s.email || '').trim();
  const phone = String(s.phone || '').trim();
  const site = String(s.website || '').trim();
  const siteHref = site ? (/^https?:\/\//i.test(site) ? site : `https://${site}`) : '';

  return (
    <Modal title={s.name} onClose={onClose} wide>
      <div className="space-y-4 text-sm">
        <div className="flex items-center gap-2 flex-wrap">
          {!s.isActive && <span className="text-[10px] uppercase font-bold bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">inactive</span>}
          <span className="text-xs text-muted">{[s.contact, s.address].filter(Boolean).join(' • ') || 'No contact person'}</span>
          <div className="ml-auto flex gap-1.5">
            {email && <a href={`mailto:${email}`} className="px-2.5 py-1 rounded-lg border border-line-strong text-xs font-semibold hover:bg-surface3" title="Email">✉ Email</a>}
            {phone && <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="px-2.5 py-1 rounded-lg border border-line-strong text-xs font-semibold hover:bg-surface3" title="Call">☎ Call</a>}
            {siteHref && <a href={siteHref} target="_blank" rel="noreferrer" className="px-2.5 py-1 rounded-lg border border-line-strong text-xs font-semibold hover:bg-surface3" title={site}>↗ Website</a>}
            <Btn small color="ghost" onClick={() => onEdit?.(s)}>Edit</Btn>
            <Btn small color="ghost" onClick={toggleActive} disabled={busy}>{s.isActive ? 'Deactivate' : 'Activate'}</Btn>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            ['Total spend', money(stats.totalSpend)],
            ['Purchase orders', `${stats.poCount ?? pos.length}${stats.openPos ? ` (${stats.openPos} open)` : ''}`],
            ['Last order', stats.lastPoAt ? new Date(stats.lastPoAt).toLocaleDateString('en-AU') : '—'],
            ['Materials', `${s._count?.rawMaterials ?? materials.length}${s.lowStock ? ` (${s.lowStock} low)` : ''}`],
          ].map(([label, val]) => (
            <div key={label} className="border border-line rounded-xl px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-muted font-bold">{label}</div>
              <div className="font-bold text-ink">{val}</div>
            </div>
          ))}
        </div>

        {email && <div className="text-xs"><span className="text-muted">Email </span><a className="text-royal-700 hover:underline" href={`mailto:${email}`}>{email}</a>{phone && <><span className="text-muted"> • Phone </span><a className="text-royal-700 hover:underline" href={`tel:${phone.replace(/[^\d+]/g, '')}`}>{phone}</a></>}</div>}
        {s.notes && <div className="text-xs text-muted whitespace-pre-wrap border-t border-line pt-2">{s.notes}</div>}

        <div>
          <div className="font-bold text-xs uppercase tracking-wide text-muted mb-1">Linked materials ({materials.length})</div>
          <div className="max-h-44 overflow-auto space-y-1">
            {materials.map((m) => (
              <div key={m.id} className="flex items-center gap-2 text-xs border-b border-line py-1">
                <span className={`font-medium flex-1 min-w-0 truncate ${onOpenMaterial ? 'cursor-pointer hover:text-royal-700 hover:underline' : ''}`}
                  onClick={() => onOpenMaterial?.(m)} title={onOpenMaterial ? 'Open material' : undefined}>{m.name}</span>
                <span className="text-muted">{m.sku}</span>
                <span className={`font-bold w-14 text-right ${Number(m.onHand) <= Number(m.lowThreshold) ? 'text-amber-600' : 'text-ink'}`}>{m.onHand}</span>
              </div>
            ))}
            {materials.length === 0 && <div className="text-xs text-muted py-2">No materials linked</div>}
          </div>
        </div>

        <div>
          <div className="font-bold text-xs uppercase tracking-wide text-muted mb-1">Purchase orders ({pos.length})</div>
          <div className="max-h-40 overflow-auto space-y-1">
            {pos.map((po) => (
              <div key={po.id} className="flex items-center gap-2 text-xs border-b border-line py-1">
                <span className="font-medium flex-1 min-w-0">{po.poNumber}</span>
                <span className="text-muted">{new Date(po.createdAt).toLocaleDateString('en-AU')}</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${statusTone(po.status)}`}>{po.status}</span>
                <span className="font-bold w-16 text-right text-royal-700">{po.total != null ? money(po.total) : ''}</span>
              </div>
            ))}
            {pos.length === 0 && <div className="text-xs text-muted py-2">No purchase orders yet</div>}
          </div>
        </div>
      </div>
    </Modal>
  );
}
