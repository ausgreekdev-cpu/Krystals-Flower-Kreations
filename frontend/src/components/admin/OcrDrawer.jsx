import { useEffect, useRef, useState } from 'react';
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
  const [preview, setPreview] = useState(null); // { url, angle } | 'loading' | null
  const [words, setWords] = useState([]);
  const textareaRef = useRef(null);

  const canOcr = doc.kind === 'IMAGE' || doc.kind === 'PDF';

  useEffect(() => () => {
    if (preview && typeof preview === 'object') URL.revokeObjectURL(preview.url);
  }, [preview]);

  useEffect(() => {
    setBusy('Loading…');
    adminApi.documents.get(doc.id, token)
      .then((d) => {
        setText(d.extractedText || '');
        setConfidence(d.ocrConfidence ?? null);
        setOcrAt(d.ocrAt || null);
        setWords((d.ocrWords?.pages || []).flatMap((pg) => pg.words || []));
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

  // Confidence review: clicking a low-confidence word focuses it in the
  // textarea (the textarea stays the source of truth for edits).
  function focusWord(w) {
    const ta = textareaRef.current;
    if (!ta) return;
    const idx = text.indexOf(w.t);
    if (idx >= 0) { ta.focus(); ta.setSelectionRange(idx, idx + w.t.length); }
  }

  async function downloadSearchable() {
    setBusy('Building searchable PDF…');
    try {
      const blob = await adminApi.documents.searchablePdf(doc.id, token);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(doc.title || 'document').replace(/[^\w.-]+/g, '_')}-searchable.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) { setErr(e.message || 'Export failed'); }
    finally { setBusy(''); }
  }

  // "What OCR sees": the exact prepared image (deskewed) the engine read.
  async function togglePreview() {
    if (preview) {
      if (typeof preview === 'object') URL.revokeObjectURL(preview.url);
      setPreview(null);
      return;
    }
    setPreview('loading');
    try {
      const { blob, angle } = await adminApi.documents.preprocessed(doc.id, token);
      setPreview({ url: URL.createObjectURL(blob), angle });
    } catch (e) {
      setPreview(null);
      setErr(e.message || 'Preview unavailable');
    }
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
              className="text-xs font-semibold border border-royal-200 text-royal-700 dark:text-royal-300 rounded-xl px-3 py-1.5 hover:bg-royal-50 dark:hover:bg-royal-950 disabled:opacity-50">
              {text ? 'Re-run OCR' : 'Run OCR'}
            </button>
          )}
          <button type="button" onClick={downloadTxt} disabled={!text} className="text-xs font-semibold border border-line-strong rounded-xl px-3 py-1.5 disabled:opacity-50">Download .txt</button>
          <button type="button" onClick={analyzeToRecipe} disabled={!text || !!busy}
            className="text-xs font-semibold border border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 rounded-xl px-3 py-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-950 disabled:opacity-50">→ Recipe</button>
          {dirty && <button type="button" onClick={save} disabled={!!busy} className="text-xs font-bold bg-royal-600 text-white rounded-xl px-3 py-1.5 disabled:opacity-50">{busy === 'Saving…' ? busy : 'Save text'}</button>}
          {doc.kind === 'IMAGE' && (
            <button type="button" onClick={togglePreview} className="text-xs font-semibold border border-line-strong rounded-xl px-3 py-1.5">
              {preview ? 'Hide preview' : 'What OCR sees'}
            </button>
          )}
          {words.length > 0 && (
            <button type="button" onClick={downloadSearchable} disabled={!!busy}
              className="text-xs font-semibold border border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 rounded-xl px-3 py-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-950 disabled:opacity-50">
              Download searchable PDF
            </button>
          )}
        </div>

        {(() => {
          const low = words.filter((w) => Number(w.c) < 70);
          return low.length ? (
            <div className="border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 rounded-xl p-2.5">
              <div className="text-[11px] font-semibold text-amber-800 dark:text-amber-200 mb-1.5">
                {low.length} word{low.length === 1 ? '' : 's'} below 70% confidence — click to review in the text
              </div>
              <div className="flex flex-wrap gap-1.5">
                {low.map((w, i) => (
                  <button key={`${w.t}-${i}`} type="button" onClick={() => focusWord(w)}
                    className="text-[11px] px-2 py-0.5 rounded-full border border-amber-300 dark:border-amber-700 bg-white dark:bg-amber-900 text-ink hover:bg-amber-100 dark:hover:bg-amber-800">
                    {w.t} <span className="text-amber-700 dark:text-amber-300 font-semibold">{w.c}%</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null;
        })()}

        {preview === 'loading' && <div className="text-xs text-muted">Loading the prepared image…</div>}
        {preview && typeof preview === 'object' && (
          <figure className="m-0">
            <img src={preview.url} alt={`Prepared scan of ${doc.title}`} className="w-full rounded-xl border border-line bg-surface2" />
            <figcaption className="text-[10px] text-muted mt-1">
              What the OCR engine sees — trimmed{Number(preview.angle) ? `, deskewed ${Math.abs(Number(preview.angle)).toFixed(2)}°` : ''}, greyscaled, contrast-normalised, sharpened.
            </figcaption>
          </figure>
        )}

        <textarea
          ref={textareaRef}
          className="w-full h-96 border border-line-strong rounded-xl px-3 py-2 text-xs font-mono bg-surface2 text-ink focus:outline-none focus:ring-2 focus:ring-royal-500"
          value={text} onChange={(e) => { setText(e.target.value); setDirty(true); }}
          placeholder={canOcr ? 'No text extracted yet — run OCR.' : 'No text extracted for this file type.'}
          aria-label="Extracted text" />
        {busy && <div className="text-xs text-royal-700 dark:text-royal-300" role="status">{busy}</div>}
        {err && <div className="text-xs text-red-600 dark:text-red-300">{err}</div>}
        <div className="text-[10px] text-muted">Edits here are searchable — content search and the AI markdown summaries read this text.</div>
      </div>
    </div>
  );
}
