import { useEffect } from 'react';

export default function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div
        className={`bg-surface2 rounded-2xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[88vh] flex flex-col overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 bg-black text-white">
          <h3 className="font-bold text-sm">{title}</h3>
          <button onClick={onClose} className="text-white/60 hover:text-white text-lg leading-none px-1">✕</button>
        </div>
        <div className="overflow-y-auto p-5 flex-1 min-h-0">{children}</div>
      </div>
    </div>
  );
}