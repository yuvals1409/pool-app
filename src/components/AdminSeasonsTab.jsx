import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { useLang } from "../i18n.jsx";

export default function AdminSeasonsTab({ toast }) {
  const { t, fmtDateDay } = useLang();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [active, setActive] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("seasons").select("*").order("start_date", { ascending: false });
    if (error) toast.show(error.message);
    else setRows(data || []);
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setStartDate("");
    setEndDate("");
    setActive(false);
    setShowForm(false);
  };

  const startEdit = (s) => {
    setEditingId(s.id);
    setName(s.name);
    setStartDate(s.start_date);
    setEndDate(s.end_date);
    setActive(s.active);
    setShowForm(true);
  };

  const save = async () => {
    if (!name.trim() || !startDate || !endDate) return toast.show(t("seasonFieldsRequired"));
    setSaving(true);
    try {
      if (active) {
        await supabase.from("seasons").update({ active: false }).neq("id", editingId || "00000000-0000-0000-0000-000000000000");
      }
      const payload = { name: name.trim(), start_date: startDate, end_date: endDate, active };
      if (editingId) {
        const { error } = await supabase.from("seasons").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("seasons").insert(payload);
        if (error) throw error;
      }
      toast.show(t("seasonSaved"));
      resetForm();
      await load();
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setSaving(false);
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{t("tabSeasons")}</h1>
      </div>

      <div className="filter-bar">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => { resetForm(); setShowForm(true); }}>
          {t("addSeason")}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="field">
            <label className="label">{t("seasonName")}</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="2025/26" />
          </div>
          <div className="field">
            <label className="label">{t("seasonDates")}</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} dir="ltr" />
              <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} dir="ltr" />
            </div>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            {t("seasonActive")}
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? <><div className="spinner" /> {t("saving")}</> : t("saveSeason")}
            </button>
            <button type="button" className="btn btn-outline" onClick={resetForm}>{t("cancel")}</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 24, color: "var(--ink-soft)" }}>{t("loading")}</div>
      ) : rows.length === 0 ? (
        <div className="empty"><div className="empty-icon">📅</div><div className="empty-text">{t("noSeasons")}</div></div>
      ) : (
        <div className="grouped-list">
          {rows.map((s) => (
            <div className="user-row" key={s.id} style={{ flexWrap: "wrap", gap: 8 }}>
              <div className="user-info" style={{ flex: 1 }}>
                <div className="user-display">
                  {s.name}
                  {s.active && <span className="badge badge-active" style={{ marginInlineStart: 8 }}>{t("active")}</span>}
                </div>
                <div className="user-email">{fmtDateDay(s.start_date)} – {fmtDateDay(s.end_date)}</div>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => startEdit(s)}>{t("editSeason")}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
