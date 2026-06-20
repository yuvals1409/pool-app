import { useState, useEffect } from "react";
import { useLang } from "../i18n.jsx";
import { suggestPaymentAmount, recordBillingPayment, billingTypeForTemplate } from "../lib/billing.js";
import { Button, Field, Input, Select, Spinner } from "./ui/ds/index.js";

export default function BillingPaymentModal({
  open,
  onClose,
  onSaved,
  toast,
  participantId,
  enrollmentId,
  templateCode,
  seasonId,
  initialPaymentStatus = "paid",
}) {
  const { t } = useLang();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [amount, setAmount] = useState("");
  const [paymentStatus, setPaymentStatus] = useState(initialPaymentStatus);
  const [billingMonth, setBillingMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [notes, setNotes] = useState("");

  const billingType = billingTypeForTemplate(templateCode);

  useEffect(() => {
    if (!open || !participantId || !billingType) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await suggestPaymentAmount({
          participantId,
          billingType,
          enrollmentId,
          billingMonth: billingType === "annual_monthly" ? billingMonth : null,
        });
        if (!cancelled) {
          setSuggestion(data);
          setAmount(String(data?.suggested_amount ?? ""));
        }
      } catch (e) {
        if (!cancelled) {
          toast?.show(e.message || t("systemError"));
          setSuggestion(null);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, participantId, enrollmentId, billingType, billingMonth]);

  if (!open) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await recordBillingPayment({
        participantId,
        billingType,
        amount: paymentStatus === "waived" ? 0 : Number(amount),
        paymentStatus,
        enrollmentId,
        billingMonth: billingType === "annual_monthly" ? billingMonth : null,
        seasonId,
        productCode: suggestion?.product_code,
        tier: suggestion?.tier,
        siblingDiscountPct: suggestion?.sibling_discount_pct ?? 0,
        priceListVersionId: suggestion?.price_list_version_id,
        notes: notes.trim() || null,
      });
      toast?.show(t("billingSaved"));
      onSaved?.();
      onClose?.();
    } catch (e) {
      toast?.show(e.message || t("systemError"));
    }
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420, width: "100%" }}>
        <h3 style={{ margin: "0 0 16px" }}>{t("billingRecordPayment")}</h3>

        {billingType === "annual_monthly" && (
          <Field label={t("billingMonth")}>
            <Input
              type="month"
              dir="ltr"
              value={billingMonth.slice(0, 7)}
              onChange={(e) => setBillingMonth(`${e.target.value}-01`)}
            />
          </Field>
        )}

        <Field label={t("paymentStatus")}>
          <Select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
            <option value="paid">{t("paymentPaid")}</option>
            <option value="waived">{t("paymentWaived")}</option>
            <option value="unpaid">{t("paymentUnpaid")}</option>
          </Select>
        </Field>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 16 }}>
            <Spinner />
          </div>
        ) : suggestion?.error ? (
          <p className="schedule-session-hint">{t(`billingError_${suggestion.error}`) || suggestion.error}</p>
        ) : (
          <>
            {suggestion?.sibling_discount_pct > 0 && (
              <p className="schedule-session-hint">
                {t("billingSiblingDiscount", { pct: suggestion.sibling_discount_pct })}
              </p>
            )}
            <Field label={t("billingAmount")}>
              <Input
                type="number"
                dir="ltr"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={paymentStatus === "waived"}
              />
            </Field>
            {suggestion?.base_amount != null && (
              <p className="schedule-session-hint" style={{ fontSize: 13 }}>
                {t("billingSuggested")}: ₪{suggestion.base_amount}
                {suggestion.tier ? ` · ${t(`tier_${suggestion.tier}`)}` : ""}
              </p>
            )}
          </>
        )}

        <Field label={t("notes")}>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <Button variant="primary" onClick={handleSave} disabled={saving || loading}>
            {saving ? <Spinner size={14} /> : t("save")}
          </Button>
          <Button variant="secondary" onClick={onClose}>{t("cancel")}</Button>
        </div>
      </div>
    </div>
  );
}
