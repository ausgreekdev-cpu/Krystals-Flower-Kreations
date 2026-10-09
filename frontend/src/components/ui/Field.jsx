import { useId, cloneElement } from 'react';

// Shared storefront form controls. label renders sr-only by default
// (labelVisible=false → zero visual change; visible labels land with the
// Phase 3.2 a11y pass). A sr-only label is a sibling (fragment), never a
// wrapper — wrapping would clip the input too.
const BASE = 'border rounded-xl px-3 py-2';

function fieldClass({ size, className }) {
  return [BASE, size === 'sm' && 'text-sm', className].filter(Boolean).join(' ');
}

function labelled(node, id, label, labelVisible) {
  if (!label) return node;
  if (labelVisible) {
    return (
      <label htmlFor={id} className="block text-sm">
        <span className="text-ink font-semibold">{label}</span>
        {cloneElement(node, { className: `${node.props.className || ''} mt-1 w-full` })}
      </label>
    );
  }
  return (<><label htmlFor={id} className="sr-only">{label}</label>{node}</>);
}

export function Input({ label, labelVisible = false, size = 'md', className = '', id, ...rest }) {
  const auto = useId();
  const inputId = id || (label ? `in-${auto}` : id);
  const node = <input id={inputId} className={fieldClass({ size, className })} {...rest} />;
  return labelled(node, inputId, label, labelVisible);
}

export function Select({ label, labelVisible = false, size = 'md', className = '', id, children, ...rest }) {
  const auto = useId();
  const inputId = id || (label ? `sel-${auto}` : id);
  const node = <select id={inputId} className={fieldClass({ size, className })} {...rest}>{children}</select>;
  return labelled(node, inputId, label, labelVisible);
}

export function TextArea({ label, labelVisible = false, size = 'md', className = '', id, ...rest }) {
  const auto = useId();
  const inputId = id || (label ? `ta-${auto}` : id);
  const node = <textarea id={inputId} className={fieldClass({ size, className })} {...rest} />;
  return labelled(node, inputId, label, labelVisible);
}
