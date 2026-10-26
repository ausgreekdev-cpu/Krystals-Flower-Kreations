// Hardening for uploaded digital-template SVGs (paid template files).
//
// Delivery is already safe-by-context (private bucket, tokenized /api/dl,
// Content-Disposition: attachment + nosniff) — these guards are the
// defense-in-depth layer so a stored file can never carry active content
// even if it is opened directly later.
//
// sanitizeSvg() strips active content: <script>, <foreignObject>, embeds,
// on* event handler attributes, javascript: URLs.
//
// safeOptimizeSvg() is deliberately NOT svgo's preset-default: cutting-machine
// files must keep geometry, viewBox and id references byte-stable (path
// re-precision, id cleanup or editor-namespace stripping can corrupt cutting
// layers). Only debris is removed: doctype, XML prolog, comments, <metadata>.
import { optimize } from 'svgo';

const SAFE_PLUGINS = ['removeDoctype', 'removeXMLProcInst', 'removeComments', 'removeMetadata'];

// Same debris removal without a parser — the fallback for files svgo refuses
// (e.g. undeclared namespace prefixes like <rdf:RDF>).
function regexTrim(input) {
  return String(input)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<\?xml[^>]*\?>/gi, '')
    .replace(/<metadata\b[^>]*>[\s\S]*?<\/metadata\s*>/gi, '')
    .replace(/<metadata\b[^>]*\/>/gi, '');
}

export function sanitizeSvg(input) {
  let svg = String(input);
  svg = svg.replace(/<script\b[\s\S]*?(?:<\/script\s*>|$)/gi, '');
  svg = svg.replace(/<foreignObject\b[\s\S]*?(?:<\/foreignObject\s*>|$)/gi, '');
  svg = svg.replace(/<(?:iframe|embed|object)\b[\s\S]*?(?:<\/(?:iframe|embed|object)\s*>|$)/gi, '');
  svg = svg.replace(/<(?:iframe|embed|object)\b[^>]*\/?>/gi, '');
  svg = svg.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  svg = svg.replace(/\s(?:xlink:href|href|src)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]+)/gi, ' xlink:href="#"');
  return svg;
}

export function safeOptimizeSvg(input) {
  try {
    return optimize(String(input), { multipass: false, plugins: SAFE_PLUGINS }).data;
  } catch {
    return regexTrim(input);
  }
}

// Full pipeline for the upload route. Throws when the result could not
// reasonably have come from an SVG (caller maps this to 400 invalid_file).
export function hardenSvg(input) {
  const out = safeOptimizeSvg(sanitizeSvg(input)).trim();
  if (!out || !/<svg[\s>]/i.test(out)) throw new Error('not an svg');
  return out;
}
