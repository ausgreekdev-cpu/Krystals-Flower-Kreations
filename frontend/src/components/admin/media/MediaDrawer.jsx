import { useEffect, useState } from 'react';
import { adminApi } from '../../../lib/api/customClient';
import useAssetThumb from './useAssetThumb';

// Right-hand edit drawer: title/alt/caption/tags/folder/visibility + the
// attachment list. STAFF→LIBRARY promotion is admin-only (the API enforces;
// the select is just disabled for non-admins here).
export default function MediaDrawer({ asset, token, role, folders, onClose, onSaved, onDeleted }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const thumb = useAssetThumb(asset, token);
  const isAdmin = role === 'admin' || role === 'developer';

  useEffect(() => {
    setForm(asset ? {
      title: asset.title, altText: asset.altText || '', caption: asset.caption || '',
      tags: (asset.tags || []).join(', '), folderId: asset.folderId || '',
      visibility: asset.visibility,
    } : null);
    setErr('');
  }, [asset]);

  if (!asset || !form) return null;

  const save = async () => {
    setBusy(true); setErr('');
    try {
      await adminApi.media.update(asset.id, {
        title: form.title.trim(),
        altText: form.altText.trim() || null,
        caption: form.caption.trim() || null,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 10),
        folderId: form.folderId || null,
        visibility: form.visibility,
      }, token);
      onSaved?.();
    } catch (e) { setErr(e.message || 'Save failed'); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!window.confirm(`Move "${asset.title}" to the trash?`)) return;
    setBusy(true);
    try { await adminApi.media.remove(asset.id, token); onDeleted?.(); }
    catch (e) { setErr(e.message || 'Delete failed'); }
    finally { setBusy(false); }
  };

  const restore = async () => {
    setBusy(true);
    try { await adminApi.media.restore(asset.id, token); onSaved?.(); }
    catch (e) { setErr(e.message || 'Restore failed'); }
    finally { setBusy(false); }
  };

  const purge = async () => {
    if (!window.confirm(`Permanently delete "${asset.title}"? The bytes are removed and this cannot be undone.`)) return;
    setBusy(true);
    try { await adminApi.media.purge(asset.id, token); onDeleted?.(); }
    catch (e) { setErr(e.message || 'Delete failed'); }
    finally { setBusy(false); }
  };

  const input = 'w-full border border-line-strong rounded-xl px-3 py-2 text-sm bg-surface2 text-ink focus:outline-none focus:ring-2 focus:ring-royal-500';
  const label = 'block text-xs font-semibold text-muted mb-1';

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" role="dialog" aria-modal="true" aria-label="Edit media asset" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md bg-surface h-full overflow-y-auto p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm text-ink">Edit media</h3>
          <button type="button" onClick={onClose} className="text-xs text-muted hover:underline">Close</button>
        </div>
        {thumb && <img src={thumb} alt="" className="w-full h-48 object-contain bg-surface2 rounded-xl border border-line" />}
        <div><label className={label} htmlFor="m-title">Title</label>
          <input id="m-title" className={input} value={form.title} maxLength={200} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
        <div><label className={label} htmlFor="m-alt">Alt text (storefront)</label>
          <input id="m-alt" className={input} value={form.altText} maxLength={255} onChange={(e) => setForm({ ...form, altText: e.target.value })} /></div>
        <div><label className={label} htmlFor="m-caption">Caption</label>
          <textarea id="m-caption" className={input} rows={2} value={form.caption} maxLength={500} onChange={(e) => setForm({ ...form, caption: e.target.value })} /></div>
        <div><label className={label} htmlFor="m-tags">Tags (comma separated)</label>
          <input id="m-tags" className={input} value={form.tags} maxLength={120} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="hero, wedding" /></div>
        <div><label className={label} htmlFor="m-folder">Folder</label>
          <select id="m-folder" className={input} value={form.folderId} onChange={(e) => setForm({ ...form, folderId: e.target.value })}>
            <option value="">Unfiled</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select></div>
        <div><label className={label} htmlFor="m-vis">Visibility</label>
          <select id="m-vis" className={input} value={form.visibility} disabled={!isAdmin && asset.visibility === 'STAFF'}
            onChange={(e) => setForm({ ...form, visibility: e.target.value })}>
            <option value="LIBRARY">Library (reusable, public when attached)</option>
            <option value="STAFF">Staff archive (private)</option>
          </select>
          {asset.visibility === 'STAFF' && !isAdmin && <div className="text-[10px] text-muted mt-1">Promoting to the public library requires an admin.</div>}
        </div>
        {asset.attachments?.length > 0 && (
          <div>
            <div className={label}>Attached to</div>
            <ul className="text-xs text-muted space-y-1">
              {asset.attachments.map((a) => <li key={a.id}>{a.attachableType} · {a.role}</li>)}
            </ul>
          </div>
        )}
        {err && <div className="text-xs text-red-600 dark:text-red-300">{err}</div>}
        <div className="flex justify-between gap-2 pt-2">
          {asset.deletedAt ? (
            <>
              {isAdmin
                ? <button type="button" onClick={purge} disabled={busy} className="text-xs font-semibold border border-red-200 dark:border-red-700 text-red-600 dark:text-red-300 rounded-xl px-3 py-1.5 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50">Delete forever</button>
                : <span className="text-[10px] text-muted self-center">Purge requires an admin</span>}
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="text-xs font-semibold border border-line-strong rounded-xl px-3 py-1.5">Close</button>
                <button type="button" onClick={restore} disabled={busy} className="text-xs font-bold bg-royal-600 text-white rounded-xl px-4 py-1.5 disabled:opacity-50">{busy ? 'Working…' : 'Restore'}</button>
              </div>
            </>
          ) : (
            <>
              <button type="button" onClick={remove} disabled={busy} className="text-xs font-semibold border border-red-200 dark:border-red-700 text-red-600 dark:text-red-300 rounded-xl px-3 py-1.5 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50">Move to trash</button>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="text-xs font-semibold border border-line-strong rounded-xl px-3 py-1.5">Cancel</button>
                <button type="button" onClick={save} disabled={busy || !form.title.trim()} className="text-xs font-bold bg-royal-600 text-white rounded-xl px-4 py-1.5 disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
