// Folder tree + Library/Staff/Trash scopes. Folders are a flat list from the
// API (parentId) — nested here into a tree.
export default function FolderSidebar({ folders, params, onSelect, onCreate, onDelete }) {
  const childrenOf = (id) => folders.filter((f) => (f.parentId || null) === id);
  const renderNodes = (parentId, depth = 0) => childrenOf(parentId).map((f) => (
    <div key={f.id}>
      <div className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs ${params.folderId === f.id ? 'bg-royal-50 dark:bg-royal-900 text-royal-700 dark:text-royal-300 font-bold' : 'text-ink hover:bg-surface2'}`} style={{ paddingLeft: `${8 + depth * 14}px` }}>
        <button type="button" className="flex-1 text-left truncate" onClick={() => onSelect({ folderId: f.id, trashed: false })}>📁 {f.name}
          <span className="text-[10px] text-muted ml-1">{f._count?.assets ?? 0}</span>
        </button>
        <button type="button" onClick={() => { if (window.confirm(`Delete folder "${f.name}"? Assets move to Unfiled.`)) onDelete(f.id); }} className="text-muted hover:text-red-600 dark:text-red-300 px-1" aria-label={`Delete folder ${f.name}`}>×</button>
      </div>
      {renderNodes(f.id, depth + 1)}
    </div>
  ));

  const btn = (active) => `w-full text-left rounded-lg px-2 py-1.5 text-xs ${active ? 'bg-royal-50 dark:bg-royal-900 text-royal-700 dark:text-royal-300 font-bold' : 'text-ink hover:bg-surface2'}`;

  return (
    <nav className="w-48 shrink-0 space-y-1" aria-label="Media folders">
      <button type="button" className={btn(!params.folderId && !params.trashed && !params.visibility)} onClick={() => onSelect({ folderId: '', trashed: false })}>All media</button>
      <button type="button" className={btn(!params.folderId && !params.trashed && params.visibility === 'LIBRARY')} onClick={() => onSelect({ folderId: '', trashed: false, visibility: 'LIBRARY' })}>⭐ Library</button>
      <button type="button" className={btn(!params.folderId && !params.trashed && params.visibility === 'STAFF')} onClick={() => onSelect({ folderId: '', trashed: false, visibility: 'STAFF' })}>🔒 Staff archive</button>
      <button type="button" className={btn(params.trashed)} onClick={() => onSelect({ folderId: '', trashed: true })}>🗑 Trash</button>
      <div className="pt-2">
        <div className="flex items-center justify-between px-2 pb-1">
          <span className="text-[10px] font-bold text-muted uppercase tracking-wide">Folders</span>
          <button type="button" onClick={onCreate} className="text-[11px] text-royal-700 dark:text-royal-300 font-bold hover:underline" aria-label="New folder">+ New</button>
        </div>
        {renderNodes(null)}
      </div>
    </nav>
  );
}
