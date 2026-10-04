import { useEffect, useState } from 'react';
import { adminApi } from '../../lib/api/customClient';
import { useToast } from './Toast';
import LabelPrintModal from './LabelPrintModal';

const KIND_LABELS = {
  material: 'Material', level: 'Stock level', location: 'Location', stocktake: 'Stocktake',
  purchase: 'Purchase order', movement: 'Stock movement', lot: 'Inventory lot', variant: 'Variant',
  product: 'Product', transfer: 'Transfer',
};

function Card({ title, children, actions, description }) {
  return <div className="border border-line rounded-2xl p-4"><div className="flex items-center justify-between mb-3"><div><h3 className="font-bold text-sm text-ink">{title}</h3>{description && <p className="text-xs text-muted mt-0.5">{description}</p>}</div>{actions}</div>{children}</div>;
}
const Btn = ({ children, onClick, color = 'royal', disabled, small, title }) => (
  <button onClick={onClick} disabled={disabled} title={title}
    className={`inline-flex items-center gap-1 rounded-xl font-semibold disabled:opacity-50 transition-colors ${small ? 'px-2.5 py-1 text-xs' : 'px-4 py-2 text-sm'} ${color === 'royal' ? 'bg-royal-600 text-white hover:bg-royal-700' : color === 'ghost' ? 'border border-line-strong text-ink hover:bg-surface3' : color === 'red' ? 'bg-red-600 text-white hover:bg-red-700' : ''}`}>{children}</button>
);

function humanize(key) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).replace(/Id$/, ' ID');
}
function fmtValue(v, key) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object' && !Array.isArray(v)) return v.name || v.title || v.poNumber || v.email || v.sku || null;
  if (typeof v === 'string' && /At$/.test(key) && !Number.isNaN(Date.parse(v))) return new Date(v).toLocaleString();
  if (typeof v === 'string' && (key === 'createdAt' || key === 'updatedAt') && !Number.isNaN(Date.parse(v))) return new Date(v).toLocaleString();
  return String(v);
}

// ── Generic key/value detail for non-material entities ─────────────────────
function GenericDetail({ kind, item, loading, error, onBack, onOpen, data }) {
  const [linesOpen, setLinesOpen] = useState(false);
  if (loading) return <div className="text-xs text-muted py-10 text-center">Loading…</div>;
  if (error || !item) {
    return (
      <div className="space-y-3">
        <BackBar onBack={onBack} title={KIND_LABELS[kind] || kind} />
        <div className="text-xs text-muted py-8 text-center">{error || 'This item was opened without its data — go back and open it from the list.'}</div>
      </div>
    );
  }
  const title = item.name || item.title || item.poNumber || item.lotNumber
    || item.product?.title || item.rawMaterial?.name || item.location?.name || item.variant?.title
    || (kind === 'level' ? [item.product?.title, item.variant?.title].filter(Boolean).join(' — ') : '') || '—';
  const skip = new Set(['images', 'bomLines', 'stockMovements', 'inventoryLots', 'stocktakeLines', 'purchaseOrderLines', 'customFields', 'productId', 'variantId', 'rawMaterialId', 'recipeId', 'locationId', 'userId']);
  const rows = Object.entries(item).filter(([k, v]) => !skip.has(k) && v !== null && v !== undefined && v !== '' && typeof v !== 'object');

  // Relations shown explicitly (name/title resolved)
  const relations = [
    item.product && ['Product', item.product.title],
    item.rawMaterial && ['Material', item.rawMaterial.name],
    item.variant && ['Variant', item.variant.title],
    item.location && ['Location', item.location.name],
    item.user && ['By', item.user.email],
    item.supplier && ['Supplier', item.supplier],
  ].filter(Boolean);

  const lines = Array.isArray(item.lines) ? item.lines : [];

  // Contextual jumps
  const jumps = [];
  if (item.rawMaterialId && kind !== 'material') jumps.push({ label: 'Open material →', fn: () => onOpen('material', item.rawMaterialId, (data.materials || []).find((m) => m.id === item.rawMaterialId)) });
  if (item.productId && kind === 'movement') {
    const lvl = (data.levels || []).find((l) => l.productId === item.productId && (!item.locationId || l.locationId === item.locationId)) || (data.levels || []).find((l) => l.productId === item.productId);
    if (lvl) jumps.push({ label: 'Open stock level →', fn: () => onOpen('level', lvl.id, lvl) });
  }

  return (
    <div className="space-y-4">
      <BackBar onBack={onBack} title={`${KIND_LABELS[kind] || kind} — ${title}`} />
      {jumps.length > 0 && <div className="flex gap-2">{jumps.map((j) => <Btn key={j.label} small color="ghost" onClick={j.fn}>{j.label}</Btn>)}</div>}
      <Card title="Details">
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
          {relations.map(([label, val]) => (
            <div key={label} className="flex justify-between gap-3 border-b border-line py-1"><span className="text-muted">{label}</span><span className="font-medium text-ink text-right">{val}</span></div>
          ))}
          {rows.map(([k, v]) => {
            const out = fmtValue(v, k);
            if (out === null) return null;
            return <div key={k} className="flex justify-between gap-3 border-b border-line py-1"><span className="text-muted">{humanize(k)}</span><span className="font-medium text-ink text-right">{out}</span></div>;
          })}
        </div>
        {lines.length > 0 && (
          <div className="mt-3">
            <button className="text-xs font-semibold text-royal-700 hover:underline" onClick={() => setLinesOpen((o) => !o)}>{lines.length} line{lines.length === 1 ? '' : 's'} {linesOpen ? '▾' : '▸'}</button>
            {linesOpen && <div className="mt-1.5 space-y-1">{lines.map((ln, i) => (
              <div key={i} className="text-xs border-b border-line py-1 flex justify-between gap-3">
                <span className="text-ink">{ln.rawMaterial?.name || ln.product?.title || ln.rawMaterialId || i}</span>
                <span className="text-muted">× {ln.qty ?? ln.quantity ?? '—'}{ln.unitCost != null ? ` @ $${Number(ln.unitCost).toFixed(2)}` : ''}</span>
              </div>
            ))}</div>}
          </div>
        )}
      </Card>
    </div>
  );
}

function BackBar({ title, onBack, actions }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Btn small color="ghost" onClick={onBack}>← Back</Btn>
      <h2 className="font-black text-base text-ink flex-1 min-w-0 truncate">{title}</h2>
      {actions}
    </div>
  );
}

// ── Material detail — attributes, custom fields, history, usage ────────────
function MaterialDetail({ id, seed, token, data, reload, onBack, onEditMaterial, role }) {
  const toast = useToast();
  const [m, setM] = useState(seed || null);
  const [err, setErr] = useState('');
  const [defs, setDefs] = useState([]);
  const [draft, setDraft] = useState({});
  const [history, setHistory] = useState([]);
  const [usage, setUsage] = useState([]);
  const [manage, setManage] = useState(false);
  const [newField, setNewField] = useState({ label: '', type: 'text' });
  const [setVal, setSetVal] = useState('');
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const canManageFields = role === 'admin' || role === 'developer';

  function loadAll() {
    adminApi.materials.get(id, token).then((r) => { setM(r); setDraft({ ...(r.customFields || {}) }); }).catch((e) => setErr(e.message));
    adminApi.materialFields.list(token).then(setDefs).catch(() => {});
    adminApi.inventory.movements(token, { productId: id, limit: 15 }).then((d) => setHistory(d?.data || [])).catch(() => {});
    adminApi.bom.recipes(token).then((rs) => setUsage((Array.isArray(rs) ? rs : []).filter((r) => (r.lines || []).some((l) => l.rawMaterialId === id)))).catch(() => {});
  }
  useEffect(() => { loadAll(); }, [id]);
  useEffect(() => { if (seed && !m) { setM(seed); setDraft({ ...(seed.customFields || {}) }); setErr(''); } }, [seed]);

  async function adjust(delta) {
    try { const r = await adminApi.materials.adjust(id, delta, 'Detail adjust', token); setM(r); reload(); }
    catch (e) { toast(e.message, 'error'); }
  }
  async function setExact() {
    const onHand = Number(setVal);
    if (!Number.isFinite(onHand) || onHand < 0) return toast('Enter a valid number', 'error');
    setBusy(true);
    try { const r = await adminApi.materials.set(id, onHand, 'Detail set', token); setM(r); setSetVal(''); reload(); }
    catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  async function saveCustomFields() {
    const cf = {};
    for (const d of defs) {
      const v = draft[d.key];
      if (d.type === 'boolean') { if (v === true) cf[d.key] = true; }
      else if (d.type === 'number') { if (v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v))) cf[d.key] = Number(v); }
      else if (v !== undefined && v !== null && String(v).trim() !== '') cf[d.key] = String(v).trim();
    }
    setBusy(true);
    try {
      const r = await adminApi.materials.update(id, { customFields: cf }, token);
      setM(r); toast('Custom fields saved');
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  async function addField() {
    if (!newField.label.trim()) return;
    try {
      await adminApi.materialFields.create({ label: newField.label.trim(), type: newField.type }, token);
      setNewField({ label: '', type: 'text' });
      setDefs(await adminApi.materialFields.list(token));
    } catch (e) { toast(e.message, 'error'); }
  }
  async function renameField(def) {
    const label = window.prompt('Rename field', def.label);
    if (!label || label.trim() === def.label) return;
    try { await adminApi.materialFields.update(def.id, { label: label.trim() }, token); setDefs(await adminApi.materialFields.list(token)); }
    catch (e) { toast(e.message, 'error'); }
  }
  async function removeField(def) {
    if (!window.confirm(`Delete field "${def.label}"? Stored values stay but stop rendering.`)) return;
    try { await adminApi.materialFields.remove(def.id, token); setDefs(await adminApi.materialFields.list(token)); }
    catch (e) { toast(e.message, 'error'); }
  }

  if (err && !m) {
    return <div className="space-y-3"><BackBar onBack={onBack} title="Material" /><div className="text-xs text-muted py-8 text-center">{err}</div></div>;
  }
  if (!m) return <div className="text-xs text-muted py-10 text-center">Loading…</div>;

  const locations = Array.isArray(data.locations) ? data.locations : [];
  const locationName = locations.find((l) => l.id === m.locationId)?.name || '—';
  const weight = m.weightValue != null ? `${m.weightValue} ${m.weightUnit || ''}`.trim() : '—';
  const attrs = [
    ['SKU', m.sku || '—'], ['Barcode', m.barcode || '—'], ['Unit', m.unit],
    ['Supplier', m.supplier || '—'], ['Brand', m.brand || '—'], ['Weight (gsm/lb)', weight],
    ['Colour', m.colour || '—'], ['Paper/board size', m.size || '—'],
    ['Cost/unit', `$${Number(m.costPerUnit).toFixed(2)}`], ['Location', locationName],
    ['On hand', `${m.onHand}`], ['Low threshold', `${m.lowThreshold}`],
    ['Created', new Date(m.createdAt).toLocaleString()], ['Updated', new Date(m.updatedAt).toLocaleString()],
  ];

  return (
    <div className="space-y-4">
      <BackBar onBack={onBack} title={`Material — ${m.name}`} actions={
        <>
          <Btn small color="ghost" onClick={() => onEditMaterial(m)}>Edit</Btn>
          <Btn small color="ghost" onClick={() => setLabelsOpen(true)}>🖨 Labels</Btn>
        </>
      } />

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="px-2 py-1 rounded-lg bg-amber-100 text-amber-700 font-semibold">{m.sku}</span>
        {m.barcode && <span className="px-2 py-1 rounded-lg bg-surface3 text-muted font-mono">{m.barcode}</span>}
        <span className={`px-2 py-1 rounded-lg font-bold ${Number(m.onHand) <= Number(m.lowThreshold) ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{m.onHand} {m.unit} on hand</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Btn small onClick={() => adjust(10)}>+10</Btn>
        <Btn small color="ghost" onClick={() => adjust(-10)}>−10</Btn>
        <input value={setVal} onChange={(e) => setSetVal(e.target.value)} placeholder="set exact…" className="w-24 border border-line-strong rounded-lg px-2 py-1 text-xs" />
        <Btn small color="ghost" disabled={busy} onClick={setExact}>Set</Btn>
      </div>

      <Card title="Attributes">
        <div className="grid sm:grid-cols-2 gap-x-6 text-xs">
          {attrs.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-line py-1"><span className="text-muted">{k}</span><span className="font-medium text-ink text-right">{v}</span></div>
          ))}
        </div>
      </Card>

      <Card
        title={`Custom fields — ${defs.length}`}
        description={defs.length === 0 ? 'Admin-defined fields (like products) appear here. Define one below.' : 'Values are validated against field definitions on save.'}
        actions={canManageFields ? <Btn small color="ghost" onClick={() => setManage((o) => !o)}>{manage ? 'Done' : 'Manage fields'}</Btn> : undefined}
      >
        {manage && canManageFields && (
          <div className="mb-3 p-3 rounded-xl bg-surface3 border border-line space-y-1.5">
            {defs.map((d) => (
              <div key={d.id} className="flex items-center gap-2 text-xs">
                <span className="font-medium text-ink flex-1">{d.label} <span className="text-muted font-normal">({d.key})</span></span>
                <span className="px-1.5 py-0.5 rounded bg-surface2 text-muted">{d.type}</span>
                <button className="text-royal-700 hover:underline" onClick={() => renameField(d)}>Rename</button>
                <button className="text-red-600 hover:underline" onClick={() => removeField(d)}>Delete</button>
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <input className="flex-1 border border-line-strong rounded-lg px-2 py-1 text-xs" placeholder="New field label…" value={newField.label} onChange={(e) => setNewField({ ...newField, label: e.target.value })} />
              <select className="border border-line-strong rounded-lg px-2 py-1 text-xs" value={newField.type} onChange={(e) => setNewField({ ...newField, type: e.target.value })}>
                <option value="text">text</option><option value="number">number</option><option value="boolean">boolean</option>
              </select>
              <Btn small onClick={addField}>Add</Btn>
            </div>
          </div>
        )}
        {defs.length === 0 ? (
          <p className="text-xs text-muted">No custom fields defined yet.</p>
        ) : (
          <div className="space-y-2">
            <div className="grid sm:grid-cols-2 gap-3">
              {defs.map((d) => (
                <div key={d.id}>
                  <label className="block text-xs font-semibold text-muted mb-1">{d.label}</label>
                  {d.type === 'boolean' ? (
                    <label className="inline-flex items-center gap-2 text-sm text-ink"><input type="checkbox" className="accent-royal-500" checked={draft[d.key] === true} onChange={(e) => setDraft((s) => ({ ...s, [d.key]: e.target.checked }))} /> Yes</label>
                  ) : d.type === 'number' ? (
                    <input type="number" className="w-full border border-line-strong rounded-xl px-3 py-2 text-sm" value={draft[d.key] ?? ''} onChange={(e) => setDraft((s) => ({ ...s, [d.key]: e.target.value }))} />
                  ) : (
                    <input className="w-full border border-line-strong rounded-xl px-3 py-2 text-sm" value={draft[d.key] ?? ''} onChange={(e) => setDraft((s) => ({ ...s, [d.key]: e.target.value }))} />
                  )}
                </div>
              ))}
            </div>
            <div><Btn small disabled={busy} onClick={saveCustomFields}>{busy ? 'Saving…' : 'Save field values'}</Btn></div>
          </div>
        )}
      </Card>

      <Card title={`Usage in recipes — ${usage.length}`}>
        {usage.length === 0 ? <p className="text-xs text-muted">Not used in any BOM recipe yet.</p> : (
          <div className="space-y-1.5">{usage.map((r) => {
            const line = r.lines.find((l) => l.rawMaterialId === id);
            return (
              <div key={r.id} className="text-xs border-b border-line py-1.5 flex justify-between gap-3">
                <span className="text-ink">{r.product?.title || r.variant?.title || 'Unassigned recipe'}</span>
                <span className="text-muted">{line?.qtyPerUnit ?? '—'} / unit • waste {Math.round((line?.wasteFactor ?? 0) * 100)}%</span>
              </div>
            );
          })}</div>
        )}
      </Card>

      <Card title={`Movement history — last ${history.length}`}>
        {history.length === 0 ? <p className="text-xs text-muted">No movements recorded.</p> : (
          <div className="space-y-1.5">{history.map((mv) => (
            <div key={mv.id} className="text-xs border-b border-line py-1.5 flex justify-between gap-3">
              <span className="text-ink"><span className={`font-bold ${mv.quantity > 0 ? 'text-emerald-600' : 'text-red-600'}`}>{mv.quantity > 0 ? '+' : ''}{mv.quantity}</span> <span className="text-muted">{mv.type}{mv.reason ? ` • ${mv.reason}` : ''}{mv.user ? ` • ${mv.user.email}` : ''}</span></span>
              <span className="text-muted shrink-0">{new Date(mv.createdAt).toLocaleString()}</span>
            </div>
          ))}</div>
        )}
      </Card>

      {labelsOpen && <LabelPrintModal title={`Label — ${m.name}`} items={[{ id: m.id, name: m.name, value: m.barcode || m.sku || '' }]} onClose={() => setLabelsOpen(false)} />}
    </div>
  );
}

// ── Router: material → rich view; everything else → generic ────────────────
export default function InventoryDetail({ kind, id, seed, token, data, reload, onBack, onOpen, onEditMaterial, role }) {
  const [item, setItem] = useState(seed || null);
  const [loading, setLoading] = useState(!seed);
  const [error, setError] = useState('');

  useEffect(() => {
    if (kind === 'material') return;
    // Adopt seed whenever it becomes available (deep-link load: data may arrive after mount)
    if (seed) { setItem(seed); setLoading(false); setError(''); return; }
    let alive = true;
    const fetchers = {
      stocktake: () => adminApi.inventory.stocktakeDetail(id, token),
      purchase: () => adminApi.purchaseOrders.get(id, token),
    };
    const fn = fetchers[kind];
    if (!fn) { setLoading(false); setError('Open this item from its list to see details.'); return; }
    fn().then((r) => { if (alive) { setItem(r); setLoading(false); } }).catch((e) => { if (alive) { setError(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, [kind, id, seed]);

  if (kind === 'material') {
    return <MaterialDetail id={id} seed={seed} token={token} data={data} reload={reload} onBack={onBack} onEditMaterial={onEditMaterial} role={role} />;
  }
  return <GenericDetail kind={kind} item={item} loading={loading} error={error} onBack={onBack} onOpen={onOpen} data={data || {}} />;
}
