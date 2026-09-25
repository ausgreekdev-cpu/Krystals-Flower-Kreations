import { useState } from 'react';
import Modal from './Modal.jsx';

export default function ConfirmDialog({ title = 'Are you sure?', message, confirmLabel = 'Confirm', onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-sm text-muted">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold border border-line-strong hover:bg-surface3">Cancel</button>
        <button
          onClick={async () => { setBusy(true); try { await onConfirm(); onClose(); } finally { setBusy(false); } }}
          disabled={busy}
          className="px-4 py-2 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}