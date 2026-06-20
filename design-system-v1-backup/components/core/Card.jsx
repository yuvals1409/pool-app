import React from 'react';

/**
 * @component Card
 * @description Surface container. Default flat (border only); elevated with layered pool-blue shadow.
 */
export function Card({
  children,
  elevated = false,
  padding = 'md',
  radius = 'card',
  style: extra,
  ...props
}) {
  const padMap = {
    none: '0',
    sm: 'var(--space-3)',
    md: 'var(--space-4)',
    lg: 'var(--space-5)',
  };
  const radMap = {
    sm: 'var(--radius-sm)',
    md: 'var(--radius)',
    card: 'var(--radius-card)',
    xl: 'var(--radius-xl)',
  };

  return (
    <div
      style={{
        background: 'var(--bg)',
        border: '1px solid var(--separator)',
        borderRadius: radMap[radius] || radMap.card,
        padding: padMap[padding] || padMap.md,
        boxShadow: elevated ? 'var(--shadow)' : 'none',
        overflow: 'hidden',
        minWidth: 0,
        ...extra,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * @component KpiCard
 * @description Dashboard KPI metric tile — label + large value.
 */
export function KpiCard({ label, value, accent = false, style: extra }) {
  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--separator)',
      borderRadius: 'var(--radius-card)',
      padding: 'var(--space-4)',
      textAlign: 'center',
      ...extra,
    }}>
      <div style={{ fontSize: 'var(--text-caption)', color: 'var(--label-secondary)', marginBottom: 'var(--space-1)' }}>
        {label}
      </div>
      <div style={{
        fontSize: '1.75rem',
        fontWeight: 700,
        color: accent ? 'var(--accent)' : 'var(--label)',
        fontFamily: 'var(--font-mono)',
        lineHeight: 1.1,
      }}>
        {value}
      </div>
    </div>
  );
}
