import React from "react";

/**
 * Stream Line — Badge
 * Soft-tint status & role pills. Subtle, warm, low-chroma fills.
 */
export function Badge({ children, variant = "neutral", dot = false, style = {}, ...rest }) {
  const map = {
    neutral:    { bg: "var(--badge-neutral-bg)", fg: "var(--badge-neutral-fg)" },
    success:    { bg: "var(--success-bg)", fg: "var(--success)" },
    danger:     { bg: "var(--danger-bg)", fg: "var(--danger)" },
    warn:       { bg: "var(--warn-bg)", fg: "var(--warn)" },
    info:       { bg: "var(--info-bg)", fg: "var(--info)" },
    /* role variants */
    owner:      { bg: "var(--badge-owner-bg)", fg: "var(--badge-owner-fg)" },
    admin:      { bg: "var(--badge-admin-bg)", fg: "var(--badge-admin-fg)" },
    instructor: { bg: "var(--badge-instructor-bg)", fg: "var(--badge-instructor-fg)" },
    guard:      { bg: "var(--badge-guard-bg)", fg: "var(--badge-guard-fg)" },
    office:     { bg: "var(--badge-office-bg)", fg: "var(--badge-office-fg)" },
    parent:     { bg: "var(--badge-parent-bg)", fg: "var(--badge-parent-fg)" },
  };
  const c = map[variant] || map.neutral;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "2px 9px",
        fontSize: "var(--text-xs)",
        fontWeight: "var(--weight-medium)",
        lineHeight: 1.55,
        color: c.fg,
        background: c.bg,
        borderRadius: "var(--radius-pill)",
        letterSpacing: "var(--tracking-tight)",
        whiteSpace: "nowrap",
        ...style,
      }}
      {...rest}
    >
      {dot ? <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} /> : null}
      {children}
    </span>
  );
}
