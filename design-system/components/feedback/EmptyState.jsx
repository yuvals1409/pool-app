import React from "react";

/**
 * Stream Line — EmptyState
 * Calm, centered. Icon, short message, optional action.
 */
export function EmptyState({ icon = null, title, description = null, action = null, style = {} }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: 8,
        padding: "48px 24px",
        ...style,
      }}
    >
      {icon ? (
        <div style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--radius-md)", background: "var(--surface-sunk)", color: "var(--ink-soft)", marginBottom: 4 }}>{icon}</div>
      ) : null}
      <div style={{ fontSize: "var(--text-title-3)", fontWeight: "var(--weight-semibold)", color: "var(--ink)" }}>{title}</div>
      {description ? <div style={{ fontSize: "var(--text-base)", color: "var(--ink-mid)", maxWidth: 320 }}>{description}</div> : null}
      {action ? <div style={{ marginTop: 8 }}>{action}</div> : null}
    </div>
  );
}
