import React from 'react';

/**
 * @component Toast
 * @description Fixed-position toast notification. Appears above the tab bar.
 */
export function Toast({ message, visible = true, standalone = false, style: extra }) {
  if (!message) return null;

  const bottomOffset = standalone
    ? 'calc(var(--space-5) + env(safe-area-inset-bottom, 0px))'
    : 'calc(var(--tab-bar-h) + env(safe-area-inset-bottom, 0px) + var(--space-2))';

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: bottomOffset,
        left: '50%',
        transform: `translateX(-50%) translateY(${visible ? '0' : '16px'})`,
        background: 'var(--ink)',
        color: '#fff',
        padding: 'var(--space-3) var(--space-5)',
        borderRadius: 'var(--radius-pill)',
        fontSize: 'var(--text-subhead)',
        fontWeight: 500,
        boxShadow: 'var(--shadow-lg)',
        zIndex: 'var(--z-toast)',
        whiteSpace: 'nowrap',
        maxWidth: 'calc(100% - var(--space-8))',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        opacity: visible ? 1 : 0,
        transition: 'opacity var(--dur-normal), transform var(--dur-normal)',
        pointerEvents: visible ? 'auto' : 'none',
        ...extra,
      }}
    >
      {message}
    </div>
  );
}
