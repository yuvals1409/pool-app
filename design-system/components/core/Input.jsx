import React from 'react';

/**
 * @component Input
 * @description Form input primitives: text field, select, textarea, with label wrapper.
 */
export function Field({ label, hint, children, style: extra }) {
  return (
    <div style={{ marginBottom: 'var(--space-4)', minWidth: 0, ...extra }}>
      {label && (
        <label style={{
          display: 'block',
          fontSize: 'var(--text-footnote)',
          fontWeight: 600,
          color: 'var(--label-secondary)',
          marginBottom: 'var(--space-2)',
        }}>
          {label}
        </label>
      )}
      {children}
      {hint && (
        <p style={{
          fontSize: 'var(--text-caption)',
          color: 'var(--label-tertiary)',
          marginTop: 'var(--space-1)',
          lineHeight: 'var(--leading-normal)',
        }}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled = false,
  error = false,
  style: extra,
  ...props
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      style={{
        width: '100%',
        padding: 'var(--space-3) var(--space-4)',
        border: `1.5px solid ${error ? 'var(--danger)' : 'var(--separator)'}`,
        borderRadius: 'var(--radius)',
        fontFamily: 'inherit',
        fontSize: 'var(--text-body)',
        color: 'var(--label)',
        background: disabled ? 'var(--bg-secondary)' : 'var(--bg-secondary)',
        outline: 'none',
        minHeight: 'var(--tap-target-min)',
        letterSpacing: 'var(--tracking-body)',
        maxWidth: '100%',
        minWidth: 0,
        opacity: disabled ? 0.55 : 1,
        transition: 'border-color var(--dur-fast)',
        ...extra,
      }}
      {...props}
    />
  );
}

export function Select({ value, onChange, children, disabled = false, style: extra, ...props }) {
  return (
    <select
      value={value}
      onChange={onChange}
      disabled={disabled}
      style={{
        width: '100%',
        padding: 'var(--space-3) var(--space-4)',
        border: '1.5px solid var(--separator)',
        borderRadius: 'var(--radius)',
        fontFamily: 'inherit',
        fontSize: 'var(--text-body)',
        color: 'var(--label)',
        background: 'var(--bg-secondary)',
        outline: 'none',
        minHeight: 'var(--tap-target-min)',
        cursor: 'pointer',
        appearance: 'none',
        opacity: disabled ? 0.55 : 1,
        ...extra,
      }}
      {...props}
    >
      {children}
    </select>
  );
}
