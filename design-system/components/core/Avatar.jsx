import React from 'react';

/**
 * @component Avatar
 * @description User avatar with image or auto-generated initials fallback.
 */
export function Avatar({ name, src, size = 32, style: extra }) {
  const initials = name
    ? name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  const base = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: size < 36 ? 'var(--text-footnote)' : 'var(--text-body)',
    fontWeight: 700,
    background: 'var(--pool-pale)',
    color: 'var(--accent)',
    border: '1.5px solid var(--separator)',
    ...extra,
  };

  if (src) {
    return (
      <div style={base}>
        <img src={src} alt={name || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }

  return <div style={base}>{initials}</div>;
}
