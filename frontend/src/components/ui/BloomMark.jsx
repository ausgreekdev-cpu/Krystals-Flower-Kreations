// Brand flower mark — inline SVG so it inherits text colour (currentColor)
// and scales to any size via className. Decorative by default (aria-hidden);
// real meaning always lives in adjacent text or an aria-label on a parent.
export default function BloomMark({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <g fill="currentColor">
        <ellipse cx="12" cy="5.5" rx="3" ry="4.5" />
        <ellipse cx="12" cy="5.5" rx="3" ry="4.5" transform="rotate(72 12 12)" />
        <ellipse cx="12" cy="5.5" rx="3" ry="4.5" transform="rotate(144 12 12)" />
        <ellipse cx="12" cy="5.5" rx="3" ry="4.5" transform="rotate(216 12 12)" />
        <ellipse cx="12" cy="5.5" rx="3" ry="4.5" transform="rotate(288 12 12)" />
        <circle cx="12" cy="12" r="2.6" />
      </g>
    </svg>
  );
}
