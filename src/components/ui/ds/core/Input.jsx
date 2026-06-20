import React from "react";

/**
 * Stream Line — Field, Input, Select, Textarea
 * Notion-flat form controls. Label above, 1px border, focus ring.
 */
export function Field({ label, hint, required = false, children, style = {} }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, ...style }}>
      {label ? (
        <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)", color: "var(--ink-mid)" }}>
          {label}{required ? <span style={{ color: "var(--danger)", marginInlineStart: 3 }}>*</span> : null}
        </span>
      ) : null}
      {children}
      {hint ? <span style={{ fontSize: "var(--text-xs)", color: "var(--ink-soft)" }}>{hint}</span> : null}
    </label>
  );
}

const baseControl = {
  width: "100%",
  height: 38,
  padding: "0 12px",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-base)",
  color: "var(--ink)",
  background: "var(--surface)",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius)",
  outline: "none",
  transition: "border-color var(--dur-fast), box-shadow var(--dur-fast)",
};

function useFocusRing() {
  const [f, setF] = React.useState(false);
  return {
    focused: f,
    bind: { onFocus: () => setF(true), onBlur: () => setF(false) },
    ring: f ? { borderColor: "var(--border-focus)", boxShadow: "var(--ring)" } : {},
  };
}

export function Input({ style = {}, invalid = false, ...rest }) {
  const { bind, ring } = useFocusRing();
  return <input {...bind} style={{ ...baseControl, ...(invalid ? { borderColor: "var(--danger)" } : {}), ...ring, ...style }} {...rest} />;
}

export function Textarea({ style = {}, rows = 3, ...rest }) {
  const { bind, ring } = useFocusRing();
  return <textarea rows={rows} {...bind} style={{ ...baseControl, height: "auto", padding: "9px 12px", resize: "vertical", lineHeight: 1.5, ...ring, ...style }} {...rest} />;
}

export function Select({ children, style = {}, ...rest }) {
  const { bind, ring } = useFocusRing();
  return (
    <select
      {...bind}
      style={{
        ...baseControl,
        appearance: "none",
        cursor: "pointer",
        backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B675F' stroke-width='2.5'><polyline points='6 9 12 15 18 9'/></svg>\")",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 12px center",
        paddingInlineEnd: 32,
        ...ring,
        ...style,
      }}
      {...rest}
    >
      {children}
    </select>
  );
}
