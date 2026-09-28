import { Link } from 'react-router-dom';

// Home is always the first crumb; the last item is the current page.
export default function Breadcrumbs({ items = [] }) {
  if (!items.length) return null;
  return (
    <nav aria-label="Breadcrumb" className="text-xs text-muted mb-4">
      <ol className="flex flex-wrap items-center gap-1.5">
        <li><Link to="/" className="hover:text-highlight">Home</Link></li>
        {items.map((it, i) => {
          const last = i === items.length - 1;
          return (
            <li key={i} className="flex items-center gap-1.5">
              <span aria-hidden="true">/</span>
              {last || !it.to ? (
                <span className="text-ink font-semibold" aria-current={last ? 'page' : undefined}>{it.label}</span>
              ) : (
                <Link to={it.to} className="hover:text-highlight">{it.label}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
