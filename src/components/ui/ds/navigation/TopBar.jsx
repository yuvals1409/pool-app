import React from "react";

/**
 * Stream Line — TopBar
 * Thin workspace header: title / breadcrumb on the start edge,
 * actions on the end edge. Border-bottom, no shadow.
 */
export function TopBar({ title, subtitle = null, breadcrumb = null, actions = null, style = {} }) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        height: 56,
        padding: "0 24px",
        background: "var(--canvas)",
        borderBottom: "1px solid var(--border)",
        ...style,
      }}
    >
      <div style={{ minWidth: 0 }}>
        {breadcrumb ? <div style={{ fontSize: "var(--text-xs)", color: "var(--ink-soft)", marginBottom: 1 }}>{breadcrumb}</div> : null}
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h1 style={{ fontSize: "var(--text-title-2)", fontWeight: "var(--weight-semibold)", color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</h1>
          {subtitle ? <span style={{ fontSize: "var(--text-sm)", color: "var(--ink-soft)" }}>{subtitle}</span> : null}
        </div>
      </div>
      {actions ? <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "none" }}>{actions}</div> : null}
    </header>
  );
}
