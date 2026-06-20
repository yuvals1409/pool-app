import React from "react";

/**
 * Stream Line — Toast
 * Floating notification. White surface, faint shadow, status accent bar.
 */
export function Toast({ message, variant = "info", onClose = null, style = {} }) {
  const accent = {
    info: "var(--pool)", success: "var(--success)", danger: "var(--danger)", warn: "var(--warn)",
  }[variant] || "var(--pool)";
  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        minWidth: 240,
        maxWidth: 420,
        padding: "12px 14px",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderInlineStart: `3px solid ${accent}`,
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-md)",
        ...style,
      }}
    >
      <span style={{ flex: 1, fontSize: "var(--text-base)", color: "var(--ink)" }}>{message}</span>
      {onClose ? (
        <button type="button" onClick={onClose} aria-label="Dismiss" style={{ border: "none", background: "transparent", color: "var(--ink-soft)", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
      ) : null}
    </div>
  );
}
