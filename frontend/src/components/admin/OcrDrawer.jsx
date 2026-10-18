import { useEffect, useState } from 'react';
import { adminApi } from '../../lib/api/customClient';

// OCR/text drawer: shows the extracted text (editable), OCR confidence and
// timestamp, re-run, and .txt export. Replaces the old toast-only OCR flow.
export default function OcrDrawer({ doc, token, onClose, onSaved, onAnalyzed }) {
  const [text, setText] = useState('');
  const [confidence, setConfidence] = useState(null);
  const [ocrAt, setOcrAt] = useState(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [dirty, setDirty] = useState(false);

  const canOcr = doc.kind === 'IMAGE' || doc.kind === 'PDF';

  useEffect(() => {
    setBusy('Loading…');
    adminApi.documents.get(doc.id, token)
      .then((d) => {
        setText(d.extractedText || '');
        setConfidence(d.ocrConfidence ?? null);
        setOcrAt(d.ocrAt || null);
        setBusy('');
      })
      .catch((e) => { setErr(e.message); setBusy(''); });
  }, [doc.id, token]);

  async function runOcr(force = false) {
    setBusy('Running OCR…');
    setErr('');
    try {
      const r = await adminApi.documents.ocr(doc.id, token, force);
      setText(r.document?.extractedText ?? '');
      setConfidence(r.ocr?.confidence ?? null);
      setOcrAt(r.document?.ocrAt || new Date().toISOString());
      setDirty(false);
    } catch (e) {
      if (!force && String(e.message).includes('already has extracted text')) {
        setBusy('');
        if (window.confirm('This document already has extracted text. Re-run OCR and replace it?')) return runOcr(true);
        return;
      }
      setErr(e.message || 'OCR failed');
    } finally { setBusy(''); }
  }

  async function save() {
    setBusy('Saving…');
    setErr('');
    try {
      await adminApi.documents.update(doc.id, { extractedText: text || null }, token);
      setDirty(false);
      onSaved?.();
    } catch (e) { setErr(e.message || 'Save failed'); }
    finally { setBusy(''); }
  }

  async function analyzeToRecipe() {
    setBusy('Analysing into a recipe…');
    setErr('');
    try {
      const r = await adminApi.procedureImports.analyze(token, { text, sourceName: doc.title });
      onAnalyzed?.(r);
    } catch (e) { setErr(e.message || 'Analysis failed'); }
    finally { setBusy(''); }
  }

  function downloadTxt() {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(doc.title || 'document').replace(/[^\w.-]+/g, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" role="dialog" aria-modal="true" aria-label="Extracted text" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg bg-surface h-full overflow-y-auto p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm text-ink truncate pr-3">{doc.title}</h3>
          <button type="button" onClick={onClose} className="text-xs text-muted hover:underline">Close</button>
        </div>
        <div className="text-[11px] text-muted">
          {doc.kind} · {doc.category}
          {confidence != null && <> · OCR confidence {Math.round(confidence)}%</>}
          {ocrAt && <> · last run {new Date(ocrAt).toLocaleString('en-AU')}</>}
          {' · '}{text.length.toLocaleString()} chars
        </div>

        <div className="flex flex-wrap gap-2">
          {canOcr && (
            <button type="button" onClick={() => runOcr(false)} disabled={!!busy}
              className="text-xs font-semibold border border-royal-200 text-royal-700 dark:text-royal-300 rounded-xl px-3 py-1.5 hover:bg-royal-50 disabled:opacity-50">
              {text ? 'Re-run OCR' : 'Run OCR'}
            </button>
          )}
          <button type="button" onClick={downloadTxt} disabled={!text} className="text-xs font-semibold border border-line-strong rounded-xl px-3 py-1.5 disabled:opacity-50">Download .txt</button>
          <button type="button" onClick={analyzeToRecipe} disabled={!text || !!busy}
            className="text-xs font-semibold border border-emerald-200 text-emerald-700 rounded-xl px-3 py-1.5 hover:bg-emerald-50 disabled:opacity-50">→ Recipe</button>
          {dirty && <button type="button" onClick={save} disabled={!!busy} className="text-xs font-bold bg-royal-600 text-white rounded-xl px-3 py-1.5 disabled:opacity-50">{busy === 'Saving…' ? busy : 'Save text'}</button>}
        </div>

        <textarea
          className="w-full h-96 border border-line-strong rounded-xl px-3 py-2 text-xs font-mono bg-surface2 text-ink focus:outline-none focus:ring-2 focus:ring-royal-500"
          value={text} onChange={(e) => { setText(e.target.value); setDirty(true); }}
          placeholder={canOcr ? 'No text extracted yet — run OCR.' : 'No text extracted for this file type.'}
          aria-label="Extracted text" />
        {busy && <div className="text-xs text-royal-700 dark:text-royal-300" role="status">{busy}</div>}
        {err && <div className="text-xs text-red-600">{err}</div>}
        <div className="text-[10px] text-muted">Edits here are searchable — content search and the AI markdown summaries read this text.</div>
      </div>
    </div>
  );
}
