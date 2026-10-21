import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../../../lib/api/customClient';
import { useToast } from '../Toast';
import BulkBar from './BulkBar';
import FolderSidebar from './FolderSidebar';
import MediaCard from './MediaCard';
import MediaDrawer from './MediaDrawer';
import MediaLightbox from './MediaLightbox';
import MediaUploadPanel from './MediaUploadPanel';

// Media library + staff photo archive (Phase A): folder browsing, grid with
// selection, upload queue with progress/metadata, lightbox preview, edit
// drawer (visibility rules live server-side), trash with restore.
export default function MediaLibrary({ token, role }) {
  const toast = useToast();
  const [params, setParams] = useState({ q: '', folderId: '', visibility: '', trashed: false, page: 1 });
  const [search, setSearch] = useState('');
  const [assets, setAssets] = useState(null);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [folders, setFolders] = useState([]);
  const [err, setErr] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [lightbox, setLightbox] = useState(-1);
  const [editing, setEditing] = useState(null);
  const [showUpload, setShowUpload] = useState(false);

  const loadFolders = useCallback(() => {
    adminApi.media.folders(token).then(setFolders).catch(() => {});
  }, [token]);

  useEffect(() => { loadFolders(); }, [loadFolders]);

  useEffect(() => {
    const t = setTimeout(() => setParams((p) => (p.q === search.trim() ? p : { ...p, q: search.trim(), page: 1 })), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let dead = false;
    setAssets(null);
    adminApi.media.list(token, {
      q: params.q, folderId: params.folderId, visibility: params.visibility,
      trashed: params.trashed, page: params.page, limit: 24,
    })
      .then((r) => { if (dead) return; setAssets(r.assets); setTotal(r.total); setPages(r.pages); setErr(''); })
      .catch((e) => { if (!dead) { setErr(e.message); setAssets([]); } });
    return () => { dead = true; };
  }, [params, token]);

  const toggle = (id) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const bulkAction = async (action, value) => {
    const ids = [...selected];
    try {
      if (action === 'tagAdd') await adminApi.media.bulkUpdate(token, { ids, patch: { tagsAdd: value } });
      else if (action === 'tagRemove') await adminApi.media.bulkUpdate(token, { ids, patch: { tagsRemove: value } });
      else if (action === 'move') await adminApi.media.bulkUpdate(token, { ids, patch: { folderId: value === '__root' ? null : value } });
      else if (action === 'visibility') await adminApi.media.bulkUpdate(token, { ids, patch: { visibility: value } });
      else if (action === 'trash') await adminApi.media.bulkDelete(token, ids);
      else if (action === 'restore') await adminApi.media.bulkRestore(token, ids);
      else if (action === 'purge') {
        const r = await adminApi.media.bulkPurge(token, ids);
        if (r.skipped?.length) toast(`${r.skipped.length} skipped — still attached to content`, 'error');
      }
      toast('Bulk action applied');
      setSelected(new Set());
      refresh();
    } catch (e) { toast(e.message, 'error'); }
  };

  const refresh = () => { setParams((p) => ({ ...p })); loadFolders(); };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-semibold text-muted mb-1" htmlFor="media-q">Search</label>
          <input id="media-q" className="w-full border border-line-strong rounded-xl px-3 py-2 text-sm bg-surface2 text-ink focus:outline-none focus:ring-2 focus:ring-royal-500"
            value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Title, caption or tag…" />
        </div>
        <button type="button" onClick={() => setShowUpload((v) => !v)} className="text-xs font-bold bg-royal-600 text-white rounded-xl px-4 py-2">
          {showUpload ? 'Hide upload' : '＋ Upload'}
        </button>
      </div>

      {showUpload && (
        <MediaUploadPanel token={token} folderId={params.folderId || undefined} onClose={() => setShowUpload(false)}
          onDone={(n) => { if (n) toast(`${n} uploaded`); refresh(); }} />
      )}

      <div className="flex gap-4">
        <FolderSidebar folders={folders} params={params}
          onSelect={(patch) => { setSelected(new Set()); setParams((p) => ({ ...p, ...patch, page: 1 })); }}
          onCreate={async () => {
            const name = window.prompt('Folder name');
            if (!name?.trim()) return;
            try { await adminApi.media.createFolder(token, { name: name.trim().slice(0, 80) }); refresh(); }
            catch (e) { toast(e.message, 'error'); }
          }}
          onDelete={async (id) => {
            try { await adminApi.media.deleteFolder(id, token); refresh(); }
            catch (e) { toast(e.message, 'error'); }
          }} />

        <div className="flex-1 min-w-0 space-y-3">
          {err && <div className="text-xs text-red-600 dark:text-red-300">{err}</div>}
          {assets === null && <div className="text-xs text-muted py-10 text-center">Loading…</div>}
          {assets?.length === 0 && (
            <div className="text-xs text-muted py-10 text-center">
              {params.trashed ? 'Trash is empty.' : 'No media yet — use Upload to add the first asset.'}
            </div>
          )}
          {assets && assets.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {assets.map((a) => (
                <MediaCard key={a.id} asset={a} token={token} selected={selected.has(a.id)} onToggle={toggle}
                  onOpen={() => setLightbox(assets.findIndex((x) => x.id === a.id))} onEdit={setEditing} />
              ))}
            </div>
          )}

          {assets && assets.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" className="h-4 w-4 rounded border-line-strong"
                checked={selected.size === assets.length && assets.length > 0}
                onChange={(e) => setSelected(e.target.checked ? new Set(assets.map((a) => a.id)) : new Set())}
                aria-label="Select all on this page" />
              Select all on this page
            </label>
          )}
          {assets && assets.length > 0 && (
            <div className="flex items-center justify-between text-xs text-muted pt-1">
              <span>{total} asset{total === 1 ? '' : 's'}{params.trashed ? ' in trash' : ''}</span>
              <div className="flex items-center gap-2">
                <button disabled={params.page <= 1} onClick={() => setParams((p) => ({ ...p, page: p.page - 1 }))} className="border border-line-strong rounded-xl px-2.5 py-1 disabled:opacity-50">Prev</button>
                <span>Page {params.page} of {pages}</span>
                <button disabled={params.page >= pages} onClick={() => setParams((p) => ({ ...p, page: p.page + 1 }))} className="border border-line-strong rounded-xl px-2.5 py-1 disabled:opacity-50">Next</button>
              </div>
            </div>
          )}

          {params.trashed && assets?.length > 0 && (
            <div className="text-[11px] text-muted">Select an asset and use Edit → Restore to bring it back.</div>
          )}
        </div>
      </div>

      {selected.size > 0 && (
        <BulkBar count={selected.size} trashed={params.trashed} folders={folders} role={role}
          onAction={bulkAction} onClear={() => setSelected(new Set())} />
      )}

      {lightbox >= 0 && assets?.[lightbox] && (
        <MediaLightbox assets={assets} index={lightbox} token={token}
          onNavigate={(i) => setLightbox(i >= 0 && i < assets.length ? i : lightbox)}
          onClose={() => setLightbox(-1)}
          onEdit={(a) => { setLightbox(-1); setEditing(a); }} />
      )}

      {editing && (
        <MediaDrawer asset={editing} token={token} role={role} folders={folders}
          onClose={() => setEditing(null)}
          onSaved={() => { toast('Media updated'); setEditing(null); refresh(); }}
          onDeleted={() => { toast('Moved to trash'); setEditing(null); refresh(); }} />
      )}
    </div>
  );
}
