import React from 'react';

/**
 * @component Sidebar
 * @description Desktop sidebar navigation. Shows logo, nav items, user info. RTL layout.
 */
export function Sidebar({ logoSrc, brandName = 'Stream Line', items = [], activeId, onItemChange, user, style: extra }) {
  return (
    <aside
      style={{
        width: 'var(--sidebar-w)',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-secondary)',
        borderInlineStart: '1px solid var(--separator)',
        overflowY: 'auto',
        padding: 'var(--space-4) var(--space-2)',
        gap: 'var(--space-2)',
        ...extra,
      }}
    >
      {/* Brand */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
        padding: 'var(--space-2) var(--space-3) var(--space-4)',
        fontSize: 'var(--text-headline)', fontWeight: 700, color: 'var(--ink)',
        borderBottom: '1px solid var(--separator)', marginBottom: 'var(--space-2)',
      }}>
        {logoSrc && <img src={logoSrc} alt={brandName} style={{ height: 28, width: 'auto' }} />}
        {brandName}
      </div>

      {/* Nav items */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', flex: 1 }}>
        {items.map(item => {
          const isActive = item.id === activeId;
          return (
            <button
              key={item.id}
              onClick={() => onItemChange?.(item.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                width: '100%',
                padding: 'var(--space-3)',
                border: 'none',
                borderRadius: 'var(--radius)',
                background: isActive ? 'var(--pool-pale)' : 'transparent',
                fontFamily: 'inherit',
                fontSize: 'var(--text-subhead)',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? 'var(--accent)' : 'var(--nav-inactive)',
                cursor: 'pointer',
                textAlign: 'start',
                transition: 'background var(--dur-fast), color var(--dur-fast)',
                minHeight: 'var(--tap-target-min)',
              }}
            >
              {item.icon && (
                <span style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {item.icon}
                </span>
              )}
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* User footer */}
      {user && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
          padding: 'var(--space-3)',
          borderTop: '1px solid var(--separator)',
          marginTop: 'auto',
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'var(--pool-pale)', color: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 'var(--text-footnote)', fontWeight: 700, flexShrink: 0,
          }}>
            {user.name ? user.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() : '?'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 'var(--text-footnote)', fontWeight: 600, color: 'var(--label)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</div>
            <div style={{ fontSize: 'var(--text-caption)', color: 'var(--label-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}>{user.email}</div>
          </div>
        </div>
      )}
    </aside>
  );
}
