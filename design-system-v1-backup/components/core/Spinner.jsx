import React from 'react';

/**
 * @component Spinner
 * @description Circular loading indicator. Light or dark.
 */
export function Spinner({ size = 20, color = 'accent', style: extra }) {
  const colorMap = {
    accent: { border: 'rgba(0,119,182,.25)', top: 'var(--pool)' },
    white:  { border: 'rgba(255,255,255,.3)', top: '#fff' },
    dark:   { border: 'rgba(1,42,74,.2)', top: 'var(--ink)' },
    muted:  { border: 'var(--separator)', top: 'var(--label-secondary)' },
  };
  const c = colorMap[color] || colorMap.accent;

  return (
    <span
      role="progressbar"
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        border: `${Math.max(2, size * 0.13)}px solid ${c.border}`,
        borderTopColor: c.top,
        borderRadius: '50%',
        animation: 'sl-spin .7s linear infinite',
        flexShrink: 0,
        ...extra,
      }}
    />
  );
}
