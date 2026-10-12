const TONES = {
  ok: 'bg-success-50 border-success-200 text-success-800',
  warn: 'bg-warning-50 border-warning-200 text-warning-800',
  danger: 'bg-danger-50 border-danger-200 text-danger-800',
  info: 'bg-surface3 border-line text-ink',
};

// Dark-safe status card (tokens flip with html.dark — never use raw
// red-50/green-50/amber-50 on the storefront).
export default function Alert({ tone = 'info', className = '', children }) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`border rounded-xl px-4 py-3 text-sm ${TONES[tone]} ${className}`}>
      {children}
    </div>
  );
}
