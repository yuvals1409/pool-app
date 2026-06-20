import React from "react";

/**
 * Stream Line — Button
 * Notion-flat: solid pool-blue primary, bordered white secondary,
 * quiet ghost. Small radius, no gradients, faint press feedback.
 */
export function Button({
  children,
  variant = "primary",
  size = "md",
  icon = null,
  iconRight = null,
  fullWidth = false,
  disabled = false,
  style = {},
  ...rest
}) {
  const sizes = {
    sm: { padding: "5px 10px", fontSize: "13px", height: 30, gap: 6, radius: "var(--radius)" },
    md: { padding: "7px 14px", fontSize: "14px", height: 36, gap: 7, radius: "var(--radius)" },
    lg: { padding: "10px 18px", fontSize: "15px", height: 44, gap: 8, radius: "var(--radius-md)" },
  };
  const s = sizes[size] || sizes.md;

  const variants = {
    primary:   { background: "var(--pool)", color: "var(--on-primary)", border: "1px solid var(--pool)" },
    secondary: { background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--border-strong)" },
    ghost:     { background: "transparent", color: "var(--ink-mid)", border: "1px solid transparent" },
    danger:    { background: "var(--danger)", color: "var(--on-danger)", border: "1px solid var(--danger)" },
    success:   { background: "var(--success)", color: "var(--on-success)", border: "1px solid var(--success)" },
    outline:   { background: "var(--surface)", color: "var(--pool)", border: "1px solid var(--pool)" },
  };
  const v = variants[variant] || variants.primary;

  const [hover, setHover] = React.useState(false);
  const [active, setActive] = React.useState(false);

  const hoverBg = {
    primary: "var(--pool-press)",
    secondary: "var(--surface-hover)",
    ghost: "var(--surface-hover)",
    danger: "#BC3838",
    success: "#268A5C",
    outline: "var(--pool-wash)",
  }[variant];

  return (
    <button
      type="button"
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setActive(false); }}
      onMouseDown={() => setActive(true)}
      onMouseUp={() => setActive(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: s.gap,
        width: fullWidth ? "100%" : "auto",
        height: s.height,
        padding: s.padding,
        fontSize: s.fontSize,
        fontFamily: "var(--font-sans)",
        fontWeight: "var(--weight-medium)",
        letterSpacing: "var(--tracking-tight)",
        borderRadius: s.radius,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        transform: active && !disabled ? "translateY(0.5px)" : "none",
        transition: "background var(--dur-fast) var(--ease-standard), opacity var(--dur-fast)",
        whiteSpace: "nowrap",
        ...v,
        ...(hover && !disabled ? { background: hoverBg } : {}),
        ...style,
      }}
      {...rest}
    >
      {icon ? <span style={{ display: "inline-flex", marginInlineStart: -2 }}>{icon}</span> : null}
      {children}
      {iconRight ? <span style={{ display: "inline-flex", marginInlineEnd: -2 }}>{iconRight}</span> : null}
    </button>
  );
}
