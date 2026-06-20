import React from "react";

/**
 * Stream Line — Card
 * White surface on warm canvas. Border-first (no shadow by default),
 * small radius. The primary container shape.
 */
export function Card({ children, padded = true, hover = false, style = {}, ...rest }) {
  const [h, setH] = React.useState(false);
  return (
    <div
      onMouseEnter={() => hover && setH(true)}
      onMouseLeave={() => hover && setH(false)}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: padded ? "var(--pad-card)" : 0,
        transition: "border-color var(--dur-fast), box-shadow var(--dur-fast)",
        ...(h ? { borderColor: "var(--border-strong)", boxShadow: "var(--shadow-sm)" } : {}),
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * KpiCard — dashboard metric tile.
 */
export function KpiCard({ label, value, delta = null, deltaUp = true, icon = null, style = {} }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "var(--text-sm)", color: "var(--ink-mid)", fontWeight: "var(--weight-medium)" }}>{label}</span>
        {icon ? <span style={{ color: "var(--ink-soft)", display: "inline-flex" }}>{icon}</span> : null}
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontSize: "28px", fontWeight: "var(--weight-semibold)", color: "var(--ink)", lineHeight: 1.1 }}>{value}</span>
      {delta != null ? (
        <span style={{ fontSize: "var(--text-xs)", fontWeight: "var(--weight-medium)", color: deltaUp ? "var(--success)" : "var(--danger)" }}>
          {deltaUp ? "▲" : "▼"} {delta}
        </span>
      ) : null}
    </div>
  );
}
