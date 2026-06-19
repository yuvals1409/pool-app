import { useState, useEffect, useCallback } from "react";
import { useLang } from "../i18n.jsx";
import {
  listWaitlist,
  listPendingWaitlistNotifications,
  markWaitlistNotified,
  getWaitlistOfferUrl,
} from "../lib/waitlist.js";
import { buildWaitlistOfferMessage, shareWaitlistOfferViaWhatsApp } from "../lib/lessonNotify.js";

export default function AdminWaitlistTab({ toast }) {
  const { t, fmtDateDay } = useLang();
  const [entries, setEntries] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [all, notifs] = await Promise.all([
        listWaitlist(),
        listPendingWaitlistNotifications(),
      ]);
      setEntries(all);
      setPending(notifs);
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setLoading(false);
  }, [toast, t]);

  useEffect(() => { load(); }, [load]);

  const sendWhatsApp = async (row) => {
    setSendingId(row.id);
    try {
      const type = row.register_path === "summer" ? "summer" : "assessment";
      const offerUrl = getWaitlistOfferUrl(row.offer_token, type);
      const targetLabel = row.product_name
        || (row.slot_date ? fmtDateDay(row.slot_date) : "");
      const message = buildWaitlistOfferMessage(
        {
          childName: row.child_name,
          offerUrl,
          targetLabel,
          expiresAt: row.offer_expires_at,
        },
        { t, fmtDateDay },
      );
      await shareWaitlistOfferViaWhatsApp(row.phone, message);
      await markWaitlistNotified(row.id);
      toast.show(t("waitlistNotified"));
      await load();
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setSendingId(null);
  };

  const statusLabel = (status) => ({
    waiting: t("waitlistStatusWaiting"),
    notified: t("waitlistStatusNotified"),
  }[status] || status);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{t("tabWaitlist")}</h1>
      </div>

      {pending.length > 0 && (
        <div className="card" style={{ marginBottom: 20, borderColor: "var(--accent)" }}>
          <div className="section-sub" style={{ marginBottom: 12 }}>{t("waitlistPendingNotify")} ({pending.length})</div>
          <div className="grouped-list">
            {pending.map((row) => (
              <div className="user-row" key={row.id} style={{ flexWrap: "wrap", gap: 8 }}>
                <div className="user-info" style={{ flex: 1 }}>
                  <div className="user-display">{row.child_name}</div>
                  <div className="user-email">
                    {row.product_name || (row.slot_date ? fmtDateDay(row.slot_date) : "")}
                    {" · "}{row.phone}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-whatsapp btn-sm"
                  disabled={sendingId === row.id}
                  onClick={() => sendWhatsApp(row)}
                >
                  {sendingId === row.id ? "..." : t("sendWhatsApp")}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="section-sub" style={{ marginBottom: 12 }}>{t("waitlistAllEntries")}</div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 24, color: "var(--ink-soft)" }}>{t("loading")}</div>
      ) : entries.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">📋</div>
          <div className="empty-text">{t("waitlistEmpty")}</div>
        </div>
      ) : (
        <div className="grouped-list">
          {entries.map((row) => (
            <div className="user-row" key={row.id} style={{ flexWrap: "wrap", gap: 8 }}>
              <div className="user-info" style={{ flex: 1 }}>
                <div className="user-display">
                  {row.child_name}
                  <span className="badge" style={{ marginInlineStart: 8 }}>{statusLabel(row.status)}</span>
                </div>
                <div className="user-email">
                  {row.target_label} · {t("waitlistPosition", { n: row.position })}
                  {" · "}{row.phone}
                </div>
              </div>
              {row.status === "notified" && !row.notified_at && row.offer_token && (
                <button
                  type="button"
                  className="btn btn-whatsapp btn-sm"
                  disabled={sendingId === row.id}
                  onClick={() => sendWhatsApp({
                    ...row,
                    register_path: row.target_type === "product" ? "summer" : "assessment",
                    slot_date: row.target_type === "assessment_slot" ? row.target_label?.split(" ")[0] : null,
                    product_name: row.target_type === "product" ? row.target_label : null,
                  })}
                >
                  {sendingId === row.id ? "..." : t("sendWhatsApp")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
