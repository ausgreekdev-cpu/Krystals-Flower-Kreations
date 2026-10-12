import { Link } from 'react-router-dom';

// Shared storefront button. variant = colour scheme, size = shape only —
// never both (conflicting Tailwind utilities resolve by CSS order, not string
// order). className carries spacing/layout extras only (mt-*, w-full, hidden…).
const VARIANTS = {
  primary: 'bg-bloom-500 text-white font-bold hover:bg-bloom-700 disabled:opacity-50 disabled:cursor-not-allowed',
  outline: 'border hover:bg-surface3 disabled:opacity-40 disabled:cursor-not-allowed',
  soft: 'bg-surface2 border hover:bg-surface3',
  danger: 'text-danger-800 hover:underline',
  dangerOutline: 'border hover:bg-danger-50 hover:text-danger-800',
  // On dark/gradient surfaces (hero bands) — contrast comes from white, not tokens
  onDark: 'bg-white/15 border border-white/60 text-white font-bold hover:bg-white/25',
  light: 'bg-surface2 text-ink font-bold hover:bg-surface shadow',
};
const SIZES = {
  lg: 'py-3 rounded-xl',
  md: 'px-6 py-2 rounded-xl',
  sm: 'px-5 py-2 rounded-xl text-sm',
  pill: 'px-3 py-1 rounded-full',
  pillLg: 'px-6 py-2 rounded-full',
  inline: 'px-4 text-sm rounded-xl',
  icon: 'w-10 h-10 rounded-full',
  bare: '',
};

export default function Btn({ variant = 'primary', size = 'lg', to, className = '', children, ...rest }) {
  const cls = [VARIANTS[variant], SIZES[size], 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-highlight/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface', className].filter(Boolean).join(' ');
  if (to) return <Link to={to} className={cls} {...rest}>{children}</Link>;
  return <button className={cls} {...rest}>{children}</button>;
}
