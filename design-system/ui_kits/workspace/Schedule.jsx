// Stream Line — Schedule (week view). window.SL_Schedule
(function () {
  const { SegmentedControl, Button, Badge } = window.StreamLineDesignSystem_132b60;
  const D = window.SL_DATA;
  const START_H = 9, END_H = 19, ROW = 54;
  const instrById = Object.fromEntries(D.instructors.map(i => [i.id, i]));

  function toMin(t) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }

  function LessonBlock({ l }) {
    const ins = instrById[l.instr];
    const top = (toMin(l.start) - START_H * 60) / 60 * ROW;
    const height = l.dur / 60 * ROW - 3;
    return (
      <div style={{
        position: "absolute", insetInline: 3, top: top + 1, height,
        background: "var(--surface)",
        borderInlineStart: `3px solid ${ins.color}`,
        border: "1px solid var(--border)",
        borderInlineStartWidth: 3,
        borderRadius: "var(--radius-sm)",
        padding: "4px 7px", overflow: "hidden", cursor: "pointer",
        boxShadow: "var(--shadow-xs)",
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.child}</div>
        <div style={{ fontSize: 11, color: "var(--ink-soft)", display: "flex", alignItems: "center", gap: 4 }}>
          <span className="num" style={{ fontSize: 11 }}>{l.start}</span>
          <span style={{ color: ins.color }}>· {ins.name.split(" ")[0]}</span>
        </div>
      </div>
    );
  }

  function SL_Schedule() {
    const [view, setView] = React.useState("Week");
    const hours = [];
    for (let h = START_H; h <= END_H; h++) hours.push(h);
    const todayIdx = 3; // Wed highlighted

    return (
      <div style={{ padding: "20px 24px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>15&ndash;21 June 2026</span>
            <div style={{ display: "flex", gap: 4 }}>
              {D.instructors.map(i => (
                <span key={i.id} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--ink-mid)", padding: "2px 8px", border: "1px solid var(--border)", borderRadius: "var(--radius-pill)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: i.color }} />{i.name.split(" ")[0]}
                </span>
              ))}
            </div>
          </div>
          <SegmentedControl options={["Day", "Week", "Month"]} value={view} onChange={setView} size="sm" />
        </div>

        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden", background: "var(--surface)" }}>
          {/* header row */}
          <div style={{ display: "grid", gridTemplateColumns: "56px repeat(7, 1fr)", borderBottom: "1px solid var(--border)" }}>
            <div style={{ borderInlineEnd: "1px solid var(--border)" }} />
            {D.days.map((d, i) => (
              <div key={d} style={{ padding: "8px 0", textAlign: "center", borderInlineEnd: i < 6 ? "1px solid var(--border)" : "none", background: i === todayIdx ? "var(--pool-wash)" : "transparent" }}>
                <div style={{ fontSize: 11, color: i === todayIdx ? "var(--pool)" : "var(--ink-soft)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{d}</div>
                <div className="num" style={{ fontSize: 15, color: i === todayIdx ? "var(--pool)" : "var(--ink)", fontWeight: 600, marginTop: 1 }}>{15 + i}</div>
              </div>
            ))}
          </div>
          {/* grid body */}
          <div style={{ display: "grid", gridTemplateColumns: "56px repeat(7, 1fr)", position: "relative" }}>
            {/* time axis */}
            <div style={{ borderInlineEnd: "1px solid var(--border)" }}>
              {hours.map(h => (
                <div key={h} style={{ height: ROW, position: "relative" }}>
                  <span className="num" style={{ position: "absolute", top: -7, right: 8, fontSize: 10, color: "var(--ink-faint)" }}>{String(h).padStart(2, "0")}:00</span>
                </div>
              ))}
            </div>
            {D.days.map((d, di) => (
              <div key={d} style={{ position: "relative", borderInlineEnd: di < 6 ? "1px solid var(--border)" : "none", background: di === todayIdx ? "rgba(0,119,182,0.022)" : "transparent" }}>
                {hours.map((h, hi) => (
                  <div key={h} style={{ height: ROW, borderBottom: hi < hours.length - 1 ? "1px solid var(--border)" : "none" }} />
                ))}
                {D.lessons.filter(l => l.day === di).map((l, idx) => <LessonBlock key={idx} l={l} />)}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  window.SL_Schedule = SL_Schedule;
})();
