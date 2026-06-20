import React from "react";

/**
 * Stream Line — Switch (toggle)
 */
export function Switch({ checked = false, onChange, disabled = false, style = {} }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange && onChange(!checked)}
      style={{
        width: 38, height: 22, flex: "none", padding: 2,
        borderRadius: "var(--radius-pill)",
        border: "none",
        background: checked ? "var(--pool)" : "var(--border-strong)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background var(--dur-base) var(--ease-standard)",
        display: "inline-flex",
        alignItems: "center",
        ...style,
      }}
    >
      <span style={{
        width: 18, height: 18, borderRadius: "50%", background: "#fff",
        boxShadow: "var(--shadow-sm)",
        transform: checked ? "translateX(16px)" : "translateX(0)",
        transition: "transform var(--dur-base) var(--ease-out)",
      }} />
    </button>
  );
}

/**
 * Checkbox — square, pool-blue when checked.
 */
export function Checkbox({ checked = false, onChange, disabled = false, label = null, style = {} }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, ...style }}>
      <span
        onClick={() => !disabled && onChange && onChange(!checked)}
        style={{
          width: 18, height: 18, flex: "none", borderRadius: "var(--radius-sm)",
          border: checked ? "1px solid var(--pool)" : "1px solid var(--border-strong)",
          background: checked ? "var(--pool)" : "var(--surface)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          transition: "background var(--dur-fast), border-color var(--dur-fast)",
        }}
      >
        {checked ? (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        ) : null}
      </span>
      {label ? <span style={{ fontSize: "var(--text-base)", color: "var(--ink)" }}>{label}</span> : null}
    </label>
  );
}
