import React from "react";

const PALETTE = ["#0077B6", "#2E9E6B", "#6C5CE7", "#E8722E", "#0984E3", "#C9881E", "#8E7CFF", "#15B4AC"];
function hueFor(name = "") {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

/**
 * Stream Line — Avatar
 * Circular. Image if provided, else deterministic colored initials.
 */
export function Avatar({ name = "", src = null, size = 32, color = null, style = {}, ...rest }) {
  const bg = color || hueFor(name);
  return (
    <span
      title={name}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        flex: "none",
        borderRadius: "var(--radius-pill)",
        background: src ? "var(--surface-sunk)" : bg,
        color: "#fff",
        fontSize: Math.round(size * 0.4),
        fontWeight: "var(--weight-semibold)",
        letterSpacing: "0.01em",
        overflow: "hidden",
        userSelect: "none",
        ...style,
      }}
      {...rest}
    >
      {src
        ? <img src={src} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : initials(name)}
    </span>
  );
}
