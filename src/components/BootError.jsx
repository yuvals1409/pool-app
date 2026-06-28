export default function BootError({ title, message, details }) {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      background: "var(--canvas, #f7f6f3)",
      color: "var(--ink, #1a1a1a)",
      fontFamily: "var(--font-sans, system-ui, sans-serif)",
    }}>
      <div style={{
        maxWidth: 420,
        width: "100%",
        background: "var(--surface, #fff)",
        border: "1px solid var(--border, #e8e8e8)",
        borderRadius: 12,
        padding: 24,
        lineHeight: 1.6,
      }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 14, color: "var(--ink-mid, #555)", marginBottom: details ? 16 : 0 }}>{message}</div>
        {details ? (
          <pre style={{
            margin: 0,
            padding: 12,
            borderRadius: 8,
            background: "var(--surface-hover, #f3f3f3)",
            fontSize: 12,
            overflow: "auto",
            direction: "ltr",
            textAlign: "left",
            whiteSpace: "pre-wrap",
          }}>
            {details}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
