import React from "react";

/**
 * Stream Line — NavItem (sidebar row)
 * Flat Notion-style: quiet by default, warm hover, pool-wash when active.
 */
export function NavItem({ icon = null, label, active = false, badge = null, onClick, style = {} }) {
  const [h, setH] = React.useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        width: "100%",
        padding: "6px 10px",
        border: "none",
        borderRadius: "var(--radius)",
        cursor: "pointer",
        textAlign: "start",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-base)",
        fontWeight: active ? "var(--weight-medium)" : "var(--weight-regular)",
        letterSpacing: "var(--tracking-tight)",
        color: active ? "var(--pool)" : "var(--ink-mid)",
        background: active ? "var(--pool-wash)" : h ? "var(--surface-hover)" : "transparent",
        transition: "background var(--dur-fast), color var(--dur-fast)",
        ...style,
      }}
    >
      {icon ? <span style={{ display: "inline-flex", flex: "none", color: active ? "var(--pool)" : "var(--ink-soft)" }}>{icon}</span> : null}
      <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      {badge != null ? (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: active ? "var(--pool)" : "var(--ink-soft)" }}>{badge}</span>
      ) : null}
    </button>
  );
}

/**
 * Sidebar — flat workspace nav. Header (workspace), scrollable nav body,
 * optional footer.
 */
export function Sidebar({ header = null, children, footer = null, width = "var(--sidebar-w)", style = {} }) {
  return (
    <aside
      style={{
        width,
        flex: "none",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--sidebar)",
        borderInlineEnd: "1px solid var(--border)",
        ...style,
      }}
    >
      {header ? <div style={{ padding: "14px 12px 8px" }}>{header}</div> : null}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px", display: "flex", flexDirection: "column", gap: 1 }}>
        {children}
      </div>
      {footer ? <div style={{ padding: "10px 12px", borderTop: "1px solid var(--border)" }}>{footer}</div> : null}
    </aside>
  );
}

/**
 * NavSection — overline group label inside the sidebar.
 */
export function NavSection({ children, style = {} }) {
  return (
    <div style={{ padding: "14px 10px 4px", fontSize: "var(--text-micro)", fontWeight: "var(--weight-semibold)", letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--ink-soft)", ...style }}>
      {children}
    </div>
  );
}
