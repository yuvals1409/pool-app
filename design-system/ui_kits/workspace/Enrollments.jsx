// Stream Line — Enrollments (table). window.SL_Enrollments
(function () {
  const { Badge, Avatar, Button, Input, SegmentedControl } = window.StreamLineDesignSystem_132b60;
  const D = window.SL_DATA;

  const payBadge = { paid: ["success", "Paid"], unpaid: ["warn", "Unpaid"], waived: ["neutral", "Waived"] };

  function SL_Enrollments() {
    const [filter, setFilter] = React.useState("Active");
    const [q, setQ] = React.useState("");
    const rows = D.enrollments.filter(r =>
      !q || r.child.toLowerCase().includes(q.toLowerCase()) || r.parent.toLowerCase().includes(q.toLowerCase()));

    const th = { textAlign: "start", padding: "10px 14px", fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--ink-soft)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
    const td = { padding: "11px 14px", fontSize: 14, color: "var(--ink)", borderBottom: "1px solid var(--border)", verticalAlign: "middle" };

    return (
      <div style={{ padding: "20px 24px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
          <SegmentedControl options={["Active", "All", "Cancelled"]} value={filter} onChange={setFilter} size="sm" />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ width: 220 }}><Input placeholder="Search child or parent…" value={q} onChange={e => setQ(e.target.value)} /></div>
            <Button variant="primary" size="md">Add enrollment</Button>
          </div>
        </div>

        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden", background: "var(--surface)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Child</th>
                <th style={th}>Parent</th>
                <th style={th}>Phone</th>
                <th style={th}>Product</th>
                <th style={th}>Instructor</th>
                <th style={th}>Sessions</th>
                <th style={th}>Payment</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const [variant, label] = payBadge[r.pay];
                const last = i === rows.length - 1;
                const cell = last ? { ...td, borderBottom: "none" } : td;
                return (
                  <tr key={i} className="sl-row">
                    <td style={cell}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <Avatar name={r.child} size={28} />
                        <span style={{ fontWeight: 500 }}>{r.child}</span>
                      </div>
                    </td>
                    <td style={{ ...cell, color: "var(--ink-mid)" }}>{r.parent}</td>
                    <td style={cell}><span className="num" style={{ fontSize: 13, color: "var(--ink-mid)" }}>{r.phone}</span></td>
                    <td style={{ ...cell, color: "var(--ink-mid)" }}>{r.product}</td>
                    <td style={{ ...cell, color: "var(--ink-mid)" }}>{r.instr}</td>
                    <td style={cell}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="num" style={{ fontSize: 13, color: "var(--ink-mid)" }}>{r.used}/{r.total}</span>
                        <span style={{ width: 54, height: 5, borderRadius: 999, background: "var(--surface-sunk)", overflow: "hidden" }}>
                          <span style={{ display: "block", height: "100%", width: `${r.used / r.total * 100}%`, background: "var(--pool)" }} />
                        </span>
                      </div>
                    </td>
                    <td style={cell}><Badge variant={variant} dot={r.pay !== "waived"}>{label}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: "var(--ink-soft)" }}>{rows.length} active enrollments · Summer 2026</div>
      </div>
    );
  }
  window.SL_Enrollments = SL_Enrollments;
})();
