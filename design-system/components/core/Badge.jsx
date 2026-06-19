import React from 'react';

/**
 * @component Badge
 * @description Status pill for lessons, enrollments, roles and user states.
 *   All colours are CSS custom properties so badges adapt to light/dark mode.
 */
export function Badge({ children, variant = 'active', style: extra }) {
  const variantMap = {
    active:    { background: 'var(--success-bg)', color: 'var(--success)' },
    pending:   { background: 'var(--warn-bg)',    color: 'var(--badge-pending-fg)' },
    cancelled: { background: 'var(--danger-bg)',  color: 'var(--danger)' },
    used:      { background: 'var(--danger-bg)',  color: 'var(--danger)' },
    danger:    { background: 'var(--danger-bg)',  color: 'var(--danger)' },
    info:      { background: 'var(--info-bg)',    color: 'var(--info)' },
    admin:     { background: 'var(--badge-admin-bg)',      color: 'var(--badge-admin-fg)' },
    owner:     { background: 'var(--badge-owner-bg)',      color: 'var(--badge-owner-fg)' },
    instructor:{ background: 'var(--badge-instructor-bg)', color: 'var(--badge-instructor-fg)' },
    guard:     { background: 'var(--badge-guard-bg)',      color: 'var(--badge-guard-fg)' },
    office:    { background: 'var(--badge-office-bg)',     color: 'var(--badge-office-fg)' },
    parent:    { background: 'var(--badge-parent-bg)',     color: 'var(--badge-parent-fg)' },
    neutral:   { background: 'var(--bg-secondary)',color: 'var(--label-secondary)' },
  };

  const v = variantMap[variant] || variantMap.neutral;

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '3px 10px',
      borderRadius: 'var(--radius-pill)',
      fontSize: 'var(--text-caption)',
      fontWeight: 700,
      fontFamily: 'var(--font-mono)',
      letterSpacing: '0.01em',
      whiteSpace: 'nowrap',
      ...v,
      ...extra,
    }}>
      {children}
    </span>
  );
}
