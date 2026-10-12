import Alert from './Alert.jsx';
import Btn from './Btn.jsx';

// Loading / empty / error treatments — one recipe per state so every page
// fails and loads the same way.

export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-2xl bg-surface3 ${className}`} />;
}

export function CardSkeleton({ lines = 3, className = '' }) {
  return (
    <div className={`bg-surface2 border rounded-2xl p-6 space-y-3 ${className}`}>
      <Skeleton className="h-5 w-1/3" />
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} className="h-4 w-full" />)}
    </div>
  );
}

export function EmptyState({ title, body, action, className = '' }) {
  return (
    <div className={`bg-surface2 border rounded-2xl p-10 text-center ${className}`}>
      <div className="text-3xl" aria-hidden>✿</div>
      <h2 className="mt-3 text-lg font-bold text-ink">{title}</h2>
      {body && <p className="mt-1 text-sm text-muted">{body}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({ children, className = '' }) {
  return <Alert tone="danger" className={className}>{children}</Alert>;
}

export function BackToShop() {
  return <Btn to="/shop" size="md">Browse the shop</Btn>;
}
