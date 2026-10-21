import { useState } from 'react';

// Sticky action bar for multi-select bulk workflows: add/remove tags, move to
// folder, change visibility (promotion is admin-gated server-side too), trash,
// restore, and admin purge. Trash-view actions swap automatically.
export default function BulkBar({ count, trashed, folders, role, onAction, onClear }) {
  const [busy, setBusy] = useState('');
  const isAdmin = role === 'admin' || role === 'developer';

  const run = async (name, fn) => {
    setBusy(name);
    try { await fn(); } finally { setBusy(''); }
  };

  const btn = 'text-xs font-semibold border border-line-strong rounded-xl px-3 py-1.5 text-ink hover:bg-surface3 disabled:opacity-50';
  const danger = 'text-xs font-semibold border border-red-200 dark:border-red-700 text-red-600 dark:text-red-300 rounded-xl px-3 py-1.5 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50';

  return (
    <div className="sticky bottom-2 z-30 flex flex-wrap items-center gap-2 bg-surface border border-line rounded-2xl px-3 py-2 shadow-lg" role="region" aria-label="Bulk actions">
      <span className="text-xs font-bold text-ink">{count} selected</span>
      {trashed ? (
        <>
          <button type="button" className={btn} disabled={!!busy} onClick={() => run('restore', () => onAction('restore'))}>{busy === 'restore' ? 'Restoring…' : 'Restore'}</button>
          {isAdmin && <button type="button" className={danger} disabled={!!busy}
            onClick={() => { if (window.confirm(`Permanently delete ${count} asset(s)? This cannot be undone.`)) run('purge', () => onAction('purge')); }}>
            {busy === 'purge' ? 'Purging…' : 'Delete forever'}</button>}
        </>
      ) : (
        <>
          <button type="button" className={btn} disabled={!!busy}
            onClick={() => { const t = window.prompt('Tag to add (comma separated)'); if (t?.trim()) run('tag', () => onAction('tagAdd', t.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 10))); }}>
            {busy === 'tag' ? 'Tagging…' : '+ Tag'}</button>
          <button type="button" className={btn} disabled={!!busy}
            onClick={() => { const t = window.prompt('Tag to remove (comma separated)'); if (t?.trim()) run('untag', () => onAction('tagRemove', t.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 10))); }}>
            {busy === 'untag' ? 'Working…' : '− Tag'}</button>
          <label className="text-xs font-semibold text-ink flex items-center gap-1">
            Move
            <select className="border border-line-strong rounded-lg px-2 py-1 text-xs bg-surface2" disabled={!!busy}
              defaultValue="" onChange={(e) => { const v = e.target.value; e.target.value = ''; if (v !== '') run('move', () => onAction('move', v || null)); }}>
              <option value="">Choose…</option>
              <option value="__root">Unfiled</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-ink flex items-center gap-1">
            Visibility
            <select className="border border-line-strong rounded-lg px-2 py-1 text-xs bg-surface2" disabled={!!busy}
              defaultValue="" onChange={(e) => { const v = e.target.value; e.target.value = ''; if (v) run('vis', () => onAction('visibility', v)); }}>
              <option value="">Choose…</option>
              <option value="LIBRARY">Library{!isAdmin ? ' (admin only to promote)' : ''}</option>
              <option value="STAFF">Staff archive</option>
            </select>
          </label>
          <button type="button" className={danger} disabled={!!busy}
            onClick={() => { if (window.confirm(`Move ${count} asset(s) to the trash?`)) run('trash', () => onAction('trash')); }}>
            {busy === 'trash' ? 'Working…' : 'Move to trash'}</button>
        </>
      )}
      <button type="button" className="text-xs text-muted hover:underline ml-auto" onClick={onClear} disabled={!!busy}>Clear</button>
    </div>
  );
}
