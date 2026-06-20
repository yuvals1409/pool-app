// Stream Line — Dashboard (KPIs + simple charts). window.SL_Dashboard
(function () {
  const { KpiCard, Card, Badge } = window.StreamLineDesignSystem_132b60;
  const D = window.SL_DATA;

  function Bars() {
    const max = Math.max(...D.weekly);
    return (
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 150, padding: "8px 4px 0" }}>
        {D.weekly.map((v, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, height: "100%", justifyContent: "flex-end" }}>
            <span className="num" style={{ fontSize: 11, color: "var(--ink-soft)" }}>{v}%</span>
            <div style={{ width: "100%", maxWidth: 38, height: `${v / max * 100}%`, background: i === D.weekly.length - 1 ? "var(--pool)" : "var(--pool-light)", borderRadius: "var(--radius-xs) var(--radius-xs) 0 0" }} />
            <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>{D.days[i]}</span>
          </div>
        ))}
      </div>
    );
  }

  function Donut() {
    const total = D.products.reduce((s, p) => s + p.value, 0);
    let acc = 0;
    const segs = D.products.map(p => {
      const start = acc / total * 360; acc += p.value;
      const end = acc / total * 360;
      return `${p.color} ${start}deg ${end}deg`;
    }).join(", ");
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        <div style={{ width: 120, height: 120, borderRadius: "50%", background: `conic-gradient(${segs})`, position: "relative", flex: "none" }}>
          <div style={{ position: "absolute", inset: 26, borderRadius: "50%", background: "var(--surface)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <span className="num" style={{ fontSize: 22, fontWeight: 600, color: "var(--ink)" }}>{total}</span>
            <span style={{ fontSize: 10, color: "var(--ink-soft)" }}>total</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {D.products.map(p => (
            <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: p.color, flex: "none" }} />
              <span style={{ color: "var(--ink-mid)", flex: 1 }}>{p.name}</span>
              <span className="num" style={{ color: "var(--ink)", fontWeight: 500 }}>{p.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function SL_Dashboard() {
    return (
      <div style={{ padding: "20px 24px 28px", display: "flex", flexDirection: "column", gap: 16, maxWidth: 980 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          <KpiCard label="Active enrollments" value="284" delta="+12 this week" deltaUp />
          <KpiCard label="Lessons this week" value="96" delta="+8" deltaUp />
          <KpiCard label="Attendance rate" value="92%" delta="+4%" deltaUp />
          <KpiCard label="Outstanding" value="₪ 4,180" delta="-₪620" deltaUp={false} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
          <Card>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>Weekly attendance</span>
              <Badge variant="success" dot>Trending up</Badge>
            </div>
            <Bars />
          </Card>
          <Card>
            <span style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", display: "block", marginBottom: 16 }}>Enrollments by product</span>
            <Donut />
          </Card>
        </div>
      </div>
    );
  }
  window.SL_Dashboard = SL_Dashboard;
})();
