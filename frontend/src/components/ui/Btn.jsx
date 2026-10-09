import { Link } from 'react-router-dom';

// Shared storefront button. variant = colour scheme, size = shape only —
// never both (conflicting Tailwind utilities resolve by CSS order, not string
// order). className carries spacing/layout extras only (mt-*, w-full, hidden…).
const VARIANTS = {
  primary: 'bg-bloom-500 text-white font-bold hover:bg-bloom-700 disabled:opacity-50 disabled:cursor-not-allowed',
  outline: 'border hover:bg-surface3 disabled:opacity-40 disabled:cursor-not-allowed',
  soft: 'bg-surface2 border hover:bg-surface3',
  danger: 'text-red-600 hover:underline',
  dangerOutline: 'border hover:bg-red-50 hover:text-red-600',
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
  const cls = [VARIANTS[variant], SIZES[size], className].filter(Boolean).join(' ');
  if (to) return <Link to={to} className={cls} {...rest}>{children}</Link>;
  return <button className={cls} {...rest}>{children}</button>;
}
