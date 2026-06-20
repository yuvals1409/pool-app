import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { useLang } from "../i18n.jsx";
import { useIsDesktop } from "../lib/useBreakpoint.js";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Spinner,
} from "./ui/ds/index.js";

export default function AdminSeasonsTab({ toast }) {
  const { t, fmtDateDay } = useLang();
  const isDesktop = useIsDesktop();
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
  }, []);

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
      {!isDesktop && (
        <div className="page-header">
          <h1 className="page-title">{t("tabSeasons")}</h1>
        </div>
      )}

      <div className="filter-bar">
        <Button type="button" variant="primary" size="sm" onClick={() => { resetForm(); setShowForm(true); }}>
          {t("addSeason")}
        </Button>
      </div>

      {showForm && (
        <Card style={{ marginBottom: 20 }}>
          <Field label={t("seasonName")}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="2025/26" />
          </Field>
          <Field label={t("seasonDates")}>
            <div style={{ display: "flex", gap: 8 }}>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} dir="ltr" />
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} dir="ltr" />
            </div>
          </Field>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            {t("seasonActive")}
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <Button type="button" variant="primary" onClick={save} disabled={saving}>
              {saving ? <><Spinner size={14} color="var(--on-primary)" /> {t("saving")}</> : t("saveSeason")}
            </Button>
            <Button type="button" variant="secondary" onClick={resetForm}>{t("cancel")}</Button>
          </div>
        </Card>
      )}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title={t("noSeasons")} />
      ) : (
        <div className="grouped-list">
          {rows.map((s) => (
            <div className="user-row" key={s.id} style={{ flexWrap: "wrap", gap: 8 }}>
              <div className="user-info" style={{ flex: 1 }}>
                <div className="user-display" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {s.name}
                  {s.active && <Badge variant="success">{t("active")}</Badge>}
                </div>
                <div className="user-email">{fmtDateDay(s.start_date)} – {fmtDateDay(s.end_date)}</div>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={() => startEdit(s)}>{t("editSeason")}</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
