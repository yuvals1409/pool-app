import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { useLang } from "../i18n.jsx";
import { copyEnrollmentTicketLink } from "../lib/accessPass.js";
import BillingPaymentModal from "./BillingPaymentModal.jsx";
import { billingTypeForTemplate } from "../lib/billing.js";
import { formatProductLabel } from "../lib/productLabel.js";
import { useIsDesktop } from "../lib/useBreakpoint.js";
import { listDueLeadTasks, completeLeadTask, updateLeadCrm } from "../lib/leadsCrm.js";
import { listOpenAlerts, acknowledgeAlert } from "../lib/operationalAlerts.js";
import { Button, Input, Card, Badge, EmptyState, Spinner } from "./ui/ds/index.js";

const PAYMENT_STATUSES = ["paid", "unpaid", "waived"];

const paymentBadgeVariant = (status) => ({
  paid: "success",
  unpaid: "danger",
  waived: "neutral",
}[status] || "neutral");

export default function OfficeTab({ toast }) {
  const { t, days, fmtDateDay } = useLang();
  const isDesktop = useIsDesktop();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [savingId, setSavingId] = useState(null);
  const [dueTasks, setDueTasks] = useState([]);
  const [openAlerts, setOpenAlerts] = useState([]);
  const [ackAlertId, setAckAlertId] = useState(null);
  const [billingRow, setBillingRow] = useState(null);

  const loadOpenAlerts = useCallback(async () => {
    try {
      const data = await listOpenAlerts(5);
      setOpenAlerts(data);
    } catch {
      // Background refresh — keep current list
    }
  }, []);

  const loadDueTasks = useCallback(async () => {
    try {
      const data = await listDueLeadTasks();
      setDueTasks(data);
    } catch {
      // Background refresh — keep current list, no toast
    }
  }, []);

  useEffect(() => {
    loadDueTasks();
    loadOpenAlerts();
    const intervalId = setInterval(() => {
      loadDueTasks();
      loadOpenAlerts();
    }, 20000);
    return () => clearInterval(intervalId);
  }, [loadDueTasks, loadOpenAlerts]);

  const handleAckAlert = async (alertId) => {
    setAckAlertId(alertId);
    try {
      await acknowledgeAlert(alertId);
      toast.show(t("alertsAcknowledged"));
      await loadOpenAlerts();
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setAckAlertId(null);
  };

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    try {
      const participantIds = new Set();
      const phoneNorm = q.replace(/\s/g, "");

      const { data: byPhone } = await supabase
        .from("families")
        .select("id")
        .ilike("phone", `%${phoneNorm}%`);
      if (byPhone?.length) {
        const familyIds = byPhone.map((f) => f.id);
        const { data: parts } = await supabase
          .from("participants")
          .select("id")
          .in("family_id", familyIds);
        parts?.forEach((p) => participantIds.add(p.id));
      }

      const { data: byName } = await supabase
        .from("participants")
        .select("id")
        .ilike("full_name", `%${q}%`);
      byName?.forEach((p) => participantIds.add(p.id));

      if (!participantIds.size) {
        setRows([]);
        setLoading(false);
        return;
      }

      const { data: enrollments, error } = await supabase
        .from("enrollments")
        .select(`
          id, payment_status, valid_until, active,
          participant:participants(id, full_name),
          product:products(id, name, day_of_week, start_time, end_time, instructor_name, level, level_label, target_audience, gender, schedule_pattern, season_id, product_templates(code))
        `)
        .in("participant_id", [...participantIds])
        .eq("active", true)
        .order("valid_until", { ascending: true });
      if (error) throw error;
      setRows(enrollments || []);
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setLoading(false);
  };

  const setPayment = async (enrollmentId, paymentStatus) => {
    if (paymentStatus === "paid" || paymentStatus === "waived") {
      const row = rows.find((r) => r.id === enrollmentId);
      if (row && billingTypeForTemplate(row.product?.product_templates?.code)) {
        setBillingRow({ ...row, targetStatus: paymentStatus });
        return;
      }
    }
    setSavingId(enrollmentId);
    const { error } = await supabase
      .from("enrollments")
      .update({ payment_status: paymentStatus })
      .eq("id", enrollmentId);
    if (error) toast.show(error.message);
    else {
      setRows((prev) => prev.map((r) => (r.id === enrollmentId ? { ...r, payment_status: paymentStatus } : r)));
      toast.show(t("save"));
    }
    setSavingId(null);
  };

  const handleCompleteTask = async (task) => {
    setSavingId(task.task_id);
    try {
      const data = await completeLeadTask(task.task_id);
      if (data?.result !== "ok") toast.show(t("systemError"));
      else {
        toast.show(t("taskCompleted"));
        await loadDueTasks();
      }
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setSavingId(null);
  };

  const handleMarkCalled = async (task) => {
    setSavingId(task.task_id);
    try {
      const data = await updateLeadCrm({ leadId: task.lead_id, status: "call" });
      if (data?.result !== "ok") toast.show(t("systemError"));
      else toast.show(t("leadMarkedCalled"));
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setSavingId(null);
  };

  const copyTicketLink = (enrollmentId) => copyEnrollmentTicketLink(enrollmentId, { toast, t });

  const paymentLabel = (status) => ({
    paid: t("paymentPaid"),
    unpaid: t("paymentUnpaid"),
    waived: t("paymentWaived"),
  }[status] || status);

  const renderPaymentActions = (row) => (
    <div className="actions-cell">
      {PAYMENT_STATUSES.map((status) => (
        <Button
          key={status}
          size="sm"
          variant={row.payment_status === status ? "primary" : "outline"}
          disabled={savingId === row.id}
          onClick={() => setPayment(row.id, status)}
        >
          {paymentLabel(status)}
        </Button>
      ))}
      <Button size="sm" variant="outline" onClick={() => copyTicketLink(row.id)}>
        {t("copyTicketLink")}
      </Button>
    </div>
  );

  return (
    <div className="office-layout">
      <div className="page-header">
        <h1 className="page-title">{t("tabOffice")}</h1>
      </div>

      <Card style={{ marginTop: 12, marginBottom: 20 }}>
        <div className="crm-card-title">{t("officeAlertsTitle")}</div>
        {openAlerts.length === 0 ? (
          <EmptyState title={t("alertsEmpty")} style={{ padding: "16px 16px 24px" }} />
        ) : (
          <div className="grouped-list">
            {openAlerts.map((alert) => (
              <div className="user-row" key={alert.id}>
                <div className="user-info">
                  <div className="user-display">{alert.title}</div>
                  <div className="user-email">
                    <Badge variant={alert.severity === "warn" ? "warn" : "info"}>{alert.severity}</Badge>
                    {alert.created_at ? ` · ${fmtDateDay(String(alert.created_at).slice(0, 10))}` : ""}
                  </div>
                </div>
                <div className="user-actions-row">
                  <Button
                    size="sm"
                    disabled={ackAlertId === alert.id}
                    onClick={() => handleAckAlert(alert.id)}
                  >
                    {ackAlertId === alert.id ? <Spinner size={14} /> : t("alertsAcknowledge")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <div className="crm-card-title">{t("dueToday")}</div>
        {dueTasks.length === 0 ? (
          <EmptyState title={t("noDueTasks")} style={{ padding: "24px 16px" }} />
        ) : (
          <div className="grouped-list">
            {dueTasks.map((task) => (
              <div className="user-row" key={task.task_id}>
                <div className="user-info">
                  <div className="user-display">{task.title}</div>
                  <div className="user-email">
                    {task.child_name || "—"}
                    {task.parent_phone ? ` · ${task.parent_phone}` : ""}
                    {task.due_date ? ` · ${fmtDateDay(task.due_date)}` : ""}
                  </div>
                </div>
                <div className="user-actions-row">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={savingId === task.task_id}
                    onClick={() => handleMarkCalled(task)}
                  >
                    {t("markLeadCalled")}
                  </Button>
                  <Button
                    size="sm"
                    disabled={savingId === task.task_id}
                    onClick={() => handleCompleteTask(task)}
                  >
                    {t("taskComplete")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="search-bar">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchByPhoneOrChild")}
          onKeyDown={(e) => e.key === "Enter" && search()}
          style={{ flex: 1, minHeight: 44, height: 44 }}
        />
        <Button size="sm" onClick={search} disabled={loading} icon={loading ? <Spinner size={16} color="#fff" /> : null}>
          {loading ? t("loading") : t("search")}
        </Button>
      </div>

      {!loading && rows.length === 0 && query.trim() && (
        <EmptyState title={t("noEnrollmentsFound")} style={{ padding: "32px 16px" }} />
      )}

      {isDesktop && rows.length > 0 ? (
        <div className="data-table-wrap office-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="col-text">{t("child")}</th>
                <th className="col-text">{t("sectionClass")}</th>
                <th className="col-badge">{t("paymentStatus")}</th>
                <th className="col-date">{t("validUntil")}</th>
                <th className="col-actions"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="col-text">{row.participant?.full_name}</td>
                  <td className="col-text col-text--mid">{formatProductLabel(row.product, days, row.product?.product_templates?.code)}</td>
                  <td className="col-badge"><Badge variant={paymentBadgeVariant(row.payment_status)}>{paymentLabel(row.payment_status)}</Badge></td>
                  <td className="col-date">{fmtDateDay(row.valid_until)}</td>
                  <td className="col-actions">{renderPaymentActions(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grouped-list" style={{ marginTop: 20 }}>
          {rows.map((row) => (
            <div className="log-item" key={row.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
              <div>
                <div className="log-name">{row.participant?.full_name}</div>
                <div className="log-meta">{formatProductLabel(row.product, days, row.product?.product_templates?.code)}</div>
                <div className="log-meta" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {t("paymentStatus")}: <Badge variant={paymentBadgeVariant(row.payment_status)}>{paymentLabel(row.payment_status)}</Badge>
                </div>
                <div className="log-meta">{t("validUntil")}: {fmtDateDay(row.valid_until)}</div>
              </div>
              {renderPaymentActions(row)}
            </div>
          ))}
        </div>
      )}
      {billingRow && (
        <BillingPaymentModal
          open
          toast={toast}
          participantId={billingRow.participant?.id}
          enrollmentId={billingRow.id}
          templateCode={billingRow.product?.product_templates?.code}
          initialPaymentStatus={billingRow.targetStatus || "paid"}
          seasonId={billingRow.product?.season_id}
          onSaved={async () => {
            const id = billingRow.id;
            setBillingRow(null);
            setRows((prev) => prev.map((r) => (
              r.id === id ? { ...r, payment_status: billingRow.targetStatus || "paid" } : r
            )));
          }}
        />
      )}
    </div>
  );
}
