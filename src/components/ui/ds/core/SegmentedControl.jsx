import React from "react";

/**
 * Stream Line — SegmentedControl
 * Inset track, white selected pill. Used for view switches
 * (Day / Week / Month) and filters.
 */
export function SegmentedControl({ options = [], value, onChange, size = "md", style = {} }) {
  const pad = size === "sm" ? "5px 12px" : "7px 16px";
  const fs = size === "sm" ? "var(--text-sm)" : "var(--text-base)";
  return (
    <div
      style={{
        display: "inline-flex",
        padding: 3,
        gap: 2,
        background: "var(--surface-sunk)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        ...style,
      }}
    >
      {options.map((opt) => {
        const val = typeof opt === "string" ? opt : opt.value;
        const label = typeof opt === "string" ? opt : opt.label;
        const sel = val === value;
        return (
          <button
            key={val}
            type="button"
            onClick={() => onChange && onChange(val)}
            style={{
              padding: pad,
              fontSize: fs,
              fontFamily: "var(--font-sans)",
              fontWeight: "var(--weight-medium)",
              letterSpacing: "var(--tracking-tight)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              color: sel ? "var(--ink)" : "var(--ink-mid)",
              background: sel ? "var(--surface)" : "transparent",
              boxShadow: sel ? "var(--shadow-xs)" : "none",
              transition: "background var(--dur-fast), color var(--dur-fast)",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
