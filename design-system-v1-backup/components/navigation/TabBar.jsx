import React from 'react';

/**
 * @component TabBar
 * @description iOS-style bottom navigation bar with frosted glass. 44px tap targets. RTL-aware.
 */
export function TabBar({ tabs = [], activeId, onTabChange, style: extra }) {
  return (
    <nav
      style={{
        display: 'flex',
        position: 'fixed',
        bottom: 0,
        insetInline: 0,
        maxWidth: 'var(--app-max-w)',
        margin: '0 auto',
        zIndex: 'var(--z-overlay)',
        background: 'var(--nav-bg)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderTop: '1px solid var(--nav-border)',
        padding: 'var(--space-1) var(--space-2)',
        paddingBottom: 'calc(var(--space-1) + env(safe-area-inset-bottom, 0px))',
        gap: 'var(--space-1)',
        ...extra,
      }}
    >
      {tabs.map(tab => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange?.(tab.id)}
            style={{
              flex: 1,
              padding: '6px var(--space-1) var(--space-2)',
              background: 'none',
              border: 'none',
              borderRadius: 'var(--radius)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: '-0.01em',
              lineHeight: 1.2,
              color: isActive ? 'var(--accent)' : 'var(--nav-inactive)',
              transition: 'color var(--dur-normal)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              minHeight: 'var(--tap-target-min)',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {tab.icon && (
              <span style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {tab.icon}
              </span>
            )}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
