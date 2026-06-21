/**
 * Recharts category ticks with correct Hebrew inside LTR chart canvas.
 * SVG text ignores page RTL; foreignObject + HTML renders bidi correctly.
 */

const TICK_STYLE = {
  fontSize: 10,
  lineHeight: 1.25,
  color: "var(--ink-mid)",
  fontFamily: "var(--font-sans, 'IBM Plex Sans', sans-serif)",
  direction: "rtl",
  unicodeBidi: "plaintext",
};

function RtlLabel({ label, align }) {
  return (
    <div
      xmlns="http://www.w3.org/1999/xhtml"
      style={{
        ...TICK_STYLE,
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: align === "end" ? "flex-end" : "center",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
      title={label}
    >
      {label}
    </div>
  );
}

export function makeRtlCategoryYAxisTick(labelWidth = 110) {
  const width = Math.max(72, labelWidth - 4);

  function RtlCategoryYAxisTick({ x, y, payload }) {
    const label = String(payload?.value ?? "");
    const h = 20;
    return (
      <g transform={`translate(${x},${y})`}>
        <foreignObject x={-width} y={-h / 2} width={width} height={h} style={{ overflow: "visible" }}>
          <RtlLabel label={label} align="end" />
        </foreignObject>
      </g>
    );
  }

  RtlCategoryYAxisTick.displayName = "RtlCategoryYAxisTick";
  return RtlCategoryYAxisTick;
}

export function RtlCategoryXAxisTick({ x, y, payload }) {
  const label = String(payload?.value ?? "");
  const width = 88;
  const h = 36;
  return (
    <g transform={`translate(${x},${y})`}>
      <foreignObject x={-width / 2} y={2} width={width} height={h} style={{ overflow: "visible" }}>
        <RtlLabel label={label} align="center" />
      </foreignObject>
    </g>
  );
}
