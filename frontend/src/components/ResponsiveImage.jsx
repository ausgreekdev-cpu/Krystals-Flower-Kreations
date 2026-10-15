import { PLACEHOLDER_IMG } from '../lib/assets';

// Responsive <picture> for product imagery. Upload time stores AVIF/WebP
// variants (400/800w) alongside the JPEG master — the browser picks the
// smallest source ≥ its rendered size, which is the main mobile-LCP lever.
// Legacy rows without `variants` render a plain <img>; any load error falls
// back to the placeholder.
function srcSet(map) {
  return Object.entries(map)
    .filter(([, u]) => typeof u === 'string' && u)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([w, u]) => `${u} ${w}w`)
    .join(', ');
}

export default function ResponsiveImage({
  image,
  alt = '',
  className = '',
  width,
  height,
  sizes = '100vw',
  loading = 'lazy',
  eager = false,
  fallback = PLACEHOLDER_IMG,
  ...rest
}) {
  const variants = image?.variants && typeof image.variants === 'object' ? image.variants : null;
  const src = image?.url || fallback;
  const handleError = (e) => {
    const el = e.currentTarget;
    if (!el.src.endsWith(fallback)) el.src = fallback; // avoid an onError loop
  };
  const imgProps = {
    src,
    alt,
    className,
    width,
    height,
    loading: eager ? 'eager' : loading,
    decoding: 'async',
    onError: handleError,
    ...rest,
  };
  if (!variants?.avif && !variants?.webp) return <img {...imgProps} />;
  return (
    <picture>
      {variants.avif && <source type="image/avif" srcSet={srcSet(variants.avif)} sizes={sizes} />}
      {variants.webp && <source type="image/webp" srcSet={srcSet(variants.webp)} sizes={sizes} />}
      <img {...imgProps} />
    </picture>
  );
}
