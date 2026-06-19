import React from 'react';

/**
 * @component Button
 * @description Primary interactive control. Covers all Stream Line action types.
 */

function _spinnerEl(color) {
  return React.createElement('span', {
    style: {
      display: 'inline-block',
      width: 16,
      height: 16,
      border: `2.5px solid ${color === 'dark' ? 'rgba(1,42,74,.25)' : 'rgba(255,255,255,.3)'}`,
      borderTopColor: color === 'dark' ? 'var(--ink)' : '#fff',
      borderRadius: '50%',
      animation: 'sl-spin .7s linear infinite',
      flexShrink: 0,
    }
  });
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = true,
  disabled = false,
  loading = false,
  icon = null,
  onClick,
  type = 'button',
  style: extraStyle,
  ...props
}) {
  const sizeMap = {
    sm:   { padding: '8px 16px',  fontSize: 'var(--text-subhead)',  minHeight: 'var(--tap-target-min)' },
    md:   { padding: '12px 16px', fontSize: 'var(--text-body)',     minHeight: 'var(--tap-target-min)' },
    lg:   { padding: '14px 20px', fontSize: 'var(--text-headline)', minHeight: '52px' },
    scan: { padding: '14px 16px', fontSize: 'var(--text-headline)', minHeight: '52px' },
  };

  const variantMap = {
    primary: {
      background: 'linear-gradient(135deg, var(--pool) 0%, var(--pool-deep) 100%)',
      color: '#fff',
      border: 'none',
      boxShadow: 'var(--shadow-btn)',
    },
    secondary: {
      background: 'var(--bg)',
      color: 'var(--ink)',
      border: '1.5px solid var(--separator)',
      boxShadow: '0 2px 8px rgba(0,0,0,.06)',
    },
    outline: {
      background: 'var(--bg)',
      color: 'var(--accent)',
      border: '1.5px solid var(--accent)',
      boxShadow: 'none',
    },
    danger: {
      background: 'var(--danger)',
      color: '#fff',
      border: 'none',
      boxShadow: 'none',
    },
    success: {
      background: 'var(--success)',
      color: '#fff',
      border: 'none',
      boxShadow: 'none',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--accent)',
      border: 'none',
      boxShadow: 'none',
    },
    whatsapp: {
      background: '#25D366',
      color: '#fff',
      border: 'none',
      boxShadow: 'none',
    },
    google: {
      background: 'var(--bg)',
      color: '#3c4043',
      border: '1.5px solid var(--separator)',
      boxShadow: '0 2px 8px rgba(0,0,0,.08)',
    },
  };

  const spinnerColor = ['primary','danger','success','whatsapp'].includes(variant) ? 'light' : 'dark';
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      onClick={!isDisabled ? onClick : undefined}
      disabled={isDisabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-2)',
        borderRadius: 'var(--radius)',
        fontFamily: 'inherit',
        fontWeight: 600,
        letterSpacing: 'var(--tracking-body)',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.45 : 1,
        transition: 'all var(--dur-fast)',
        width: fullWidth ? '100%' : 'auto',
        WebkitTapHighlightColor: 'transparent',
        userSelect: 'none',
        textDecoration: 'none',
        ...sizeMap[size] || sizeMap.md,
        ...variantMap[variant] || variantMap.primary,
        ...extraStyle,
      }}
      {...props}
    >
      {loading && _spinnerEl(spinnerColor)}
      {!loading && icon}
      {children}
    </button>
  );
}
