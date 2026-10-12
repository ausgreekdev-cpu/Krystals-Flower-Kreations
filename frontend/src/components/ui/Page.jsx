import Breadcrumbs from '../layout/Breadcrumbs.jsx';

// Page chrome kit — one container width, one padding, one h1 scale for every
// public page. width: 'narrow' (prose: 3xl) | 'default' (4xl) | 'detail' (6xl) | 'wide' (7xl).
const WIDTHS = {
  narrow: 'max-w-3xl',
  default: 'max-w-4xl',
  detail: 'max-w-6xl',
  wide: 'max-w-7xl',
};

export function Page({ width = 'default', className = '', children }) {
  return (
    <div className={`${WIDTHS[width] || WIDTHS.default} mx-auto px-4 py-8 ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({ crumbs, title, lede, action, className = '' }) {
  return (
    <>
      {crumbs}
      <div className={className}>
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-ink">{title}</h1>
          {lede && <p className="mt-1 text-sm text-muted">{lede}</p>}
        </div>
        {action}
      </div>
    </>
  );
}

export { Breadcrumbs };
