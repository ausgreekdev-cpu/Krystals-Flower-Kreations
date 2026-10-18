// Per-route <head> updates for the SPA. Googlebot renders JS, so dynamic
// meta descriptions, canonicals and noindex are honoured. Social scrapers
// (FB/WhatsApp/Slack) do NOT run JS — index.html keeps the static absolute
// OG/twitter tags; pages can only improve what Google sees, never those.
const DEFAULT_TITLE = 'Krystals Flower Creations — Paper Florist Perth WA';
const DEFAULT_DESCRIPTION =
  'Custom paper florist & sculptural art workshop — Cricut + origami blooms. Perth WA. Everlasting bouquets, SVG templates & workshops. Handmade in Perth, GST-inclusive.';

function getMeta(content) {
  let el = document.head.querySelector(`meta[name="${content}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', content);
    document.head.appendChild(el);
  }
  return el;
}

// Partial update — omitted keys are left untouched. `canonical` accepts a
// path (resolved against the origin) or an absolute URL; pass null/'' to
// drop the tag. `robots` null removes the tag (default: indexable).
export function updateSeo({ title, description, canonical, robots } = {}) {
  if (title) document.title = title;
  if (description) getMeta('description').setAttribute('content', description);
  if (canonical !== undefined) {
    let link = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      if (link) link.remove();
    } else {
      if (!link) {
        link = document.createElement('link');
        link.setAttribute('rel', 'canonical');
        document.head.appendChild(link);
      }
      link.setAttribute(
        'href',
        /^https?:\/\//.test(canonical) ? canonical : `${window.location.origin}${canonical}`,
      );
    }
  }
  const robotsEl = document.head.querySelector('meta[name="robots"]');
  if (robots) getMeta('robots').setAttribute('content', robots);
  else if (robotsEl) robotsEl.remove();
}

// Back to the static index.html values (used on unmount / route teardown —
// the next route's effect then applies its own).
export function restoreSeo() {
  updateSeo({
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    canonical: '/',
    robots: null,
  });
}
