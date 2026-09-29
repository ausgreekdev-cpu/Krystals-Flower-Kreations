// Minimal, XSS-safe markdown renderer (zero deps).
// Order of operations: HTML-escape FIRST, then apply markdown transforms to the
// escaped text — raw HTML in the source can never reach the DOM. Link/image URLs
// are additionally allow-listed (http/https, relative, mailto, #anchors).
//
// Blocks: headings (# → h2 … ###### → h6 — the page owns the <h1>), paragraphs
// (blank-line separated), -/* unordered lists, 1. ordered lists, --- hr.
// Inline: ![alt](src), [text](url), **bold**, *italic*, `code`.

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(u, { image = false } = {}) {
  const url = String(u).trim();
  if (/^(https?:\/\/|\/(?!\/)|\.\/|#)/i.test(url)) return url;
  if (!image && /^mailto:[^\s]+@[^\s]+$/i.test(url)) return url;
  return null;
}

function inline(escaped) {
  let out = escaped;
  // images (before links so ![alt](x) isn't caught by the link rule)
  out = out.replace(/!\[([^\]]*)\]\(([^()\s]+)\)/g, (m, alt, src) => {
    const url = safeUrl(src, { image: true });
    return url ? `<img src="${url}" alt="${alt}" loading="lazy" />` : m;
  });
  out = out.replace(/\[([^\]]+)\]\(([^()\s]+)\)/g, (m, text, href) => {
    const url = safeUrl(href);
    return url ? `<a href="${url}">${text}</a>` : text;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\s][^*]*)\*(?!\*)/g, '$1<em>$2</em>');
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  return out;
}

export function renderMarkdown(src) {
  if (!src) return '';
  const lines = escapeHtml(src).split(/\r?\n/);
  const html = [];
  let para = [];
  let list = null; // 'ul' | 'ol'

  const flushPara = () => {
    if (para.length) { html.push(`<p>${inline(para.join(' '))}</p>`); para = []; }
  };
  const flushList = () => {
    if (list) { html.push(`</${list}>`); list = null; }
  };
  const flush = () => { flushPara(); flushList(); };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); continue; }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flush();
      const level = Math.min(6, heading[1].length + 1); // shift down: page has the h1
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { flush(); html.push('<hr />'); continue; }

    const ul = line.match(/^[-*]\s+(.*)$/);
    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const want = ul ? 'ul' : 'ol';
      if (list !== want) { flushList(); html.push(`<${want}>`); list = want; }
      html.push(`<li>${inline((ul || ol)[1])}</li>`);
      continue;
    }

    flushList();
    para.push(line.trim());
  }
  flush();
  return html.join('\n');
}
