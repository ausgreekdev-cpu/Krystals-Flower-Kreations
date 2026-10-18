import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../../lib/api/customClient';

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

// Live price mirror (bomPricing math) so edits show the new retail instantly —
// the server recomputes authoritatively on save/approve.
function recompute(plan, labour, cricut, pricing) {
  const materialsCost = (plan || []).reduce((a, m) => a + Number(m.qtyPerUnit || 0) * (1 + Number(m.wasteFactor || 0)) * Number(m.costPerUnit || 0), 0);
  const labourMinutes = Math.round(Number(labour || 0) + Number(cricut || 0));
  const withLabour = Math.round((materialsCost + (labourMinutes * (pricing?.labourPerHour || 55)) / 60) * 100) / 100;
  return {
    materialsCost: Math.round(materialsCost * 100) / 100,
    labourMinutes,
    withLabour,
    retail: Math.round(withLabour * (pricing?.margin || 1.3) * 100) / 100,
  };
}

export default function ImportReviewModal({ importId, token, onClose, onSaved, onApproved }) {
  const [row, setRow] = useState(null);
  const [plan, setPlan] = useState([]);
  const [minutes, setMinutes] = useState({ labour: 25, cricut: 8 });
  const [product, setProduct] = useState({ title: '', sku: '', price: 0 });
  const [flags, setFlags] = useState({ createProduct: true, createProcedureDocument: true });
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [remapFor, setRemapFor] = useState(-1);
  const [remapQuery, setRemapQuery] = useState('');
  const [remapResults, setRemapResults] = useState([]);

  const load = useCallback(() => {
    adminApi.procedureImports.get(importId, token).then((r) => {
      setRow(r);
      setPlan(Array.isArray(r.materialPlan) ? r.materialPlan.map((m) => ({ ...m })) : []);
      setMinutes({ labour: r.labourMinutesPerUnit ?? 25, cricut: r.cricutMinutesPerUnit ?? 8 });
      const pp = r.productProposal || {};
      setProduct({ title: pp.title || '', sku: pp.sku || '', price: pp.price ?? r.pricing?.retail ?? 0 });
    }).catch((e) => setErr(e.message));
  }, [importId, token]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (remapFor < 0) return;
    const t = setTimeout(() => {
      adminApi.procedureImports.searchMaterials(token, remapQuery)
        .then(setRemapResults).catch(() => setRemapResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [remapFor, remapQuery, token]);

  if (!row) return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center" role="dialog" aria-modal="true" aria-label="Review procedure import">
      <div className="bg-surface rounded-2xl p-6 text-sm text-muted">{err || 'Loading…'}</div>
    </div>
  );

  const pricing = recompute(plan, minutes.labour, minutes.cricut, row.pricing);
  const setRowField = (i, patch) => setPlan((p) => p.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  async function save() {
    setBusy('Saving…'); setErr('');
    try {
      const updated = await adminApi.procedureImports.update(importId, {
        materialPlan: plan.map((m) => ({
          name: m.name, spec: m.spec ?? null, unit: m.unit, qtyPerUnit: Number(m.qtyPerUnit),
          wasteFactor: Number(m.wasteFactor ?? 0.05), costPerUnit: Number(m.costPerUnit || 0),
          colour: m.colour ?? null, weightValue: m.weightValue ?? null, weightUnit: m.weightUnit ?? null,
          size: m.size ?? null, brand: m.brand ?? null,
          action: m.action, rawMaterialId: m.rawMaterialId ?? null,
        })),
        labourMinutesPerUnit: Number(minutes.labour), cricutMinutesPerUnit: Number(minutes.cricut),
        productProposal: { title: product.title, sku: product.sku || null, price: Number(product.price) },
      }, token);
      setRow(updated);
      onSaved?.();
      return updated;
    } catch (e) { setErr(e.message || 'Save failed'); return null; }
    finally { setBusy(''); }
  }

  async function approve() {
    setBusy('Approving…');
    const saved = await save();
    if (!saved) { setBusy(''); return; }
    try {
      const r = await adminApi.procedureImports.approve(importId, {
        createProduct: flags.createProduct, createProcedureDocument: flags.createProcedureDocument,
        product: flags.createProduct ? { title: product.title, sku: product.sku || null, price: Number(product.price) } : undefined,
      }, token);
      onApproved?.(r);
    } catch (e) { setErr(e.message || 'Approve failed'); }
    finally { setBusy(''); }
  }

  async function reject() {
    const note = window.prompt('Reason (optional):') ?? '';
    setBusy('Rejecting…');
    try {
      await adminApi.procedureImports.reject(importId, note, token);
      onSaved?.();
      onClose();
    } catch (e) { setErr(e.message || 'Reject failed'); }
    finally { setBusy(''); }
  }

  const input = 'border border-line-strong rounded-lg px-2 py-1 text-xs bg-surface2 text-ink focus:outline-none focus:ring-1 focus:ring-royal-500';
  const extracted = row.extracted || {};

  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Review procedure import" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-surface border border-line rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-sm text-ink">{extracted.title || 'Procedure import'}</h3>
            <div className="text-[11px] text-muted">
              {row.sourceName} · {extracted.category} · confidence {Math.round((extracted.confidence || 0) * 100)}% · engine {row.engine || 'rules'}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-xs text-muted hover:underline">Close</button>
        </div>

        {extracted.steps?.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-muted mb-1">Detected steps</div>
            <ol className="list-decimal ml-5 text-xs text-ink space-y-0.5">
              {extracted.steps.slice(0, 12).map((st, i) => <li key={i}>{st}</li>)}
            </ol>
          </div>
        )}

        <div>
          <div className="text-xs font-semibold text-muted mb-1">Materials (per finished item)</div>
          <div className="space-y-1.5">
            {plan.map((m, i) => (
              <div key={i} className="flex flex-wrap items-center gap-1.5 border border-line rounded-lg px-2 py-1.5">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${m.action === 'reuse' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-royal-50 text-royal-700 border-royal-100'}`}>
                  {m.action === 'reuse' ? '✓ existing' : '+ new'}
                </span>
                <input className={`${input} w-40`} value={m.name} maxLength={200} aria-label="Material name"
                  onChange={(e) => setRowField(i, { name: e.target.value })} />
                <input className={`${input} w-16`} type="number" step="0.01" min="0" value={m.qtyPerUnit} aria-label="Quantity per unit"
                  onChange={(e) => setRowField(i, { qtyPerUnit: Number(e.target.value) })} />
                <select className={`${input} w-20`} value={m.unit} aria-label="Unit"
                  onChange={(e) => setRowField(i, { unit: e.target.value })}>
                  {['sheet', 'meter', 'stick', 'roll', 'piece', 'ml', 'gram'].map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                <input className={`${input} w-20`} type="number" step="0.01" min="0" value={m.costPerUnit ?? 0} aria-label="Cost per unit"
                  onChange={(e) => setRowField(i, { costPerUnit: Number(e.target.value) })} />
                <input className={`${input} w-14`} type="number" step="0.01" min="0" max="1" value={m.wasteFactor ?? 0.05} aria-label="Waste factor"
                  onChange={(e) => setRowField(i, { wasteFactor: Number(e.target.value) })} />
                <button type="button" onClick={() => { setRemapFor(remapFor === i ? -1 : i); setRemapQuery(m.name); setRemapResults([]); }}
                  className="text-[11px] text-royal-700 hover:underline">change</button>
                {remapFor === i && (
                  <div className="w-full border border-line rounded-lg p-2 bg-surface2 space-y-1">
                    <input className={`${input} w-full`} value={remapQuery} placeholder="Search materials…" aria-label="Search materials"
                      onChange={(e) => setRemapQuery(e.target.value)} />
                    {remapResults.slice(0, 6).map((r) => (
                      <button key={r.id} type="button" className="block w-full text-left text-[11px] hover:bg-surface3 rounded px-1.5 py-1"
                        onClick={() => {
                          setRowField(i, { action: 'reuse', rawMaterialId: r.id, costPerUnit: Number(r.costPerUnit || 0), unit: r.unit });
                          setRemapFor(-1);
                        }}>
                        {r.name} <span className="text-muted">({r.sku} · {fmt(r.costPerUnit)}/{r.unit})</span>
                      </button>
                    ))}
                    {remapResults.length === 0 && <div className="text-[10px] text-muted">No matches — row stays a new profile.</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-muted">Labour min/unit
            <input className={`${input} ml-1 w-16`} type="number" min="0" value={minutes.labour} onChange={(e) => setMinutes({ ...minutes, labour: Number(e.target.value) })} />
          </label>
          <label className="text-xs text-muted">Cricut min/unit
            <input className={`${input} ml-1 w-16`} type="number" min="0" value={minutes.cricut} onChange={(e) => setMinutes({ ...minutes, cricut: Number(e.target.value) })} />
          </label>
          <div className="flex-1" />
          <div className="text-xs text-muted">
            Materials {fmt(pricing.materialsCost)} · Labour {pricing.labourMinutes}m → {fmt(pricing.withLabour)} · ×{row.pricing?.margin ?? 1.3} ={' '}
            <span className="font-bold text-ink">{fmt(pricing.retail)}</span>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-2">
          <label className="text-xs text-muted">Product title
            <input className={`${input} w-full`} value={product.title} maxLength={200} onChange={(e) => setProduct({ ...product, title: e.target.value })} />
          </label>
          <label className="text-xs text-muted">SKU
            <input className={`${input} w-full`} value={product.sku || ''} maxLength={50} onChange={(e) => setProduct({ ...product, sku: e.target.value })} />
          </label>
          <label className="text-xs text-muted">Sales price
            <input className={`${input} w-full`} type="number" step="0.01" min="0" value={product.price} onChange={(e) => setProduct({ ...product, price: Number(e.target.value) })} />
          </label>
        </div>

        <div className="flex flex-wrap gap-4 text-xs text-ink">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={flags.createProduct} onChange={(e) => setFlags({ ...flags, createProduct: e.target.checked })} className="h-4 w-4" />
            Create draft product (inactive until published)
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={flags.createProcedureDocument} onChange={(e) => setFlags({ ...flags, createProcedureDocument: e.target.checked })} className="h-4 w-4" />
            Create draft procedure document
          </label>
        </div>

        {err && <div className="text-xs text-red-600">{err}</div>}
        <div className="flex justify-between gap-2">
          <button type="button" onClick={reject} disabled={!!busy} className="text-xs font-semibold border border-red-200 text-red-600 rounded-xl px-3 py-1.5 hover:bg-red-50 disabled:opacity-50">Reject</button>
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={!!busy} className="text-xs font-semibold border border-line-strong rounded-xl px-3 py-1.5 disabled:opacity-50">Save</button>
            <button type="button" onClick={approve} disabled={!!busy} className="text-xs font-bold bg-royal-600 text-white rounded-xl px-4 py-1.5 disabled:opacity-50">
              {busy || 'Approve → create materials + recipe'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
