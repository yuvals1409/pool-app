import React from "react";

/**
 * Stream Line — Spinner
 */
export function Spinner({ size = 20, color = "var(--pool)", style = {} }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        border: `${Math.max(2, Math.round(size / 10))}px solid var(--border-strong)`,
        borderTopColor: color,
        borderRadius: "50%",
        animation: "sl-spin 0.7s linear infinite",
        ...style,
      }}
    >
      <style>{`@keyframes sl-spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}
