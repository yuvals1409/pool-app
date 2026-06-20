import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { generateCourseSeriesSessions } from "../lib/summerCourse.js";
import { formatProductLabel } from "../lib/productLabel.js";
import { useLang } from "../i18n.jsx";
import { useIsDesktop } from "../lib/useBreakpoint.js";
import { seasonOptionLabel } from "../lib/bidi.js";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Select,
  Spinner,
} from "./ui/ds/index.js";

const TEMPLATE_CODES = ["annual_section", "summer_course"];

export default function AdminProductsTab({ toast }) {
  const { t, days } = useLang();
  const isDesktop = useIsDesktop();
  const [seasons, setSeasons] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [seasonId, setSeasonId] = useState("");
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [templateCode, setTemplateCode] = useState("annual_section");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [startTime, setStartTime] = useState("16:00");
  const [endTime, setEndTime] = useState("16:45");
  const [instructorName, setInstructorName] = useState("");
  const [instructorId, setInstructorId] = useState("");
  const [instructors, setInstructors] = useState([]);
  const [capacity, setCapacity] = useState("");
  const [price, setPrice] = useState("");
  const [weekdays, setWeekdays] = useState([2, 4]);
  const [courseStart, setCourseStart] = useState("");
  const [courseEnd, setCourseEnd] = useState("");
  const [levelLabel, setLevelLabel] = useState("");

  const loadMeta = useCallback(async () => {
    const [{ data: seasonRows }, { data: templateRows }, { data: instructorRows }] = await Promise.all([
      supabase.from("seasons").select("id, name, active").order("start_date", { ascending: false }),
      supabase.from("product_templates").select("id, code, name").in("code", TEMPLATE_CODES),
      supabase.from("profiles").select("id, full_name, email").eq("role", "instructor").eq("status", "approved").order("full_name"),
    ]);
    setSeasons(seasonRows || []);
    setTemplates(templateRows || []);
    setInstructors(instructorRows || []);
    if (!seasonId && seasonRows?.length) {
      const active = seasonRows.find((s) => s.active) || seasonRows[0];
      setSeasonId(active.id);
    }
  }, [seasonId]);

  const loadProducts = useCallback(async (sid) => {
    if (!sid) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select("id, name, day_of_week, start_time, end_time, instructor_name, instructor_id, capacity, price, level_label, schedule_pattern, template_id, product_templates(code)")
      .eq("season_id", sid)
      .order("name");
    if (error) toast.show(error.message);
    else setProducts(data || []);
    setLoading(false);
  }, [toast]);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { if (seasonId) loadProducts(seasonId); }, [seasonId, loadProducts]);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setTemplateCode("annual_section");
    setDayOfWeek("1");
    setStartTime("16:00");
    setEndTime("16:45");
    setInstructorName("");
    setInstructorId("");
    setCapacity("");
    setPrice("");
    setWeekdays([2, 4]);
    setCourseStart("");
    setCourseEnd("");
    setLevelLabel("");
    setShowForm(false);
  };

  const startEdit = (p) => {
    const code = p.product_templates?.code || "annual_section";
    setEditingId(p.id);
    setName(p.name);
    setTemplateCode(code);
    setDayOfWeek(String(p.day_of_week ?? 1));
    setStartTime(String(p.start_time).slice(0, 5));
    setEndTime(String(p.end_time).slice(0, 5));
    setInstructorName(p.instructor_name || "");
    setInstructorId(p.instructor_id || "");
    setCapacity(p.capacity != null ? String(p.capacity) : "");
    setPrice(p.price != null ? String(p.price) : "");
    const sp = p.schedule_pattern || {};
    setWeekdays(Array.isArray(sp.weekdays) ? sp.weekdays : [2, 4]);
    setCourseStart(sp.course_start || "");
    setCourseEnd(sp.course_end || "");
    setLevelLabel(p.level_label || "");
    setShowForm(true);
  };

  const toggleWeekday = (d) => {
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  };

  const pickInstructor = (id) => {
    setInstructorId(id);
    const inst = instructors.find((x) => x.id === id);
    setInstructorName(inst ? (inst.full_name || inst.email || "") : "");
  };

  const save = async () => {
    if (!seasonId || !name.trim() || !instructorId) {
      return toast.show(t("fillAllFields"));
    }
    const template = templates.find((x) => x.code === templateCode);
    if (!template) return toast.show(t("systemError"));

    const cap = capacity.trim() ? Number(capacity) : null;
    const priceVal = price.trim() ? Number(price) : null;
    const payload = {
      season_id: seasonId,
      template_id: template.id,
      name: name.trim(),
      instructor_id: instructorId,
      instructor_name: instructorName.trim(),
      capacity: Number.isInteger(cap) ? cap : null,
      price: priceVal != null && priceVal >= 0 ? priceVal : null,
      level_label: levelLabel.trim() || null,
    };

    if (templateCode === "summer_course") {
      if (!courseStart || !courseEnd || weekdays.length === 0) {
        return toast.show(t("summerCourseDatesRequired"));
      }
      payload.day_of_week = null;
      payload.start_time = startTime;
      payload.end_time = endTime;
      payload.schedule_pattern = {
        type: "course_series",
        weekdays,
        course_start: courseStart,
        course_end: courseEnd,
      };
    } else {
      payload.day_of_week = Number(dayOfWeek);
      payload.start_time = startTime;
      payload.end_time = endTime;
      payload.schedule_pattern = {};
    }

    setSaving(true);
    try {
      let productId = editingId;
      if (editingId) {
        const { error } = await supabase.from("products").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("products").insert(payload).select("id").single();
        if (error) throw error;
        productId = data.id;
      }
      if (templateCode === "summer_course") {
        await generateCourseSeriesSessions(productId);
      }
      toast.show(t("productSaved"));
      resetForm();
      await loadProducts(seasonId);
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setSaving(false);
  };

  return (
    <div>
      {!isDesktop && (
        <div className="page-header">
          <h1 className="page-title">{t("tabProducts")}</h1>
        </div>
      )}

      <div className="filter-bar">
        <Select value={seasonId} onChange={(e) => setSeasonId(e.target.value)} style={{ minWidth: 160 }}>
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>{seasonOptionLabel(s.name, { active: s.active, activeLabel: t("active") })}</option>
          ))}
        </Select>
        <Button type="button" variant="primary" size="sm" onClick={() => { resetForm(); setShowForm(true); }}>
          {t("addProduct")}
        </Button>
      </div>

      {showForm && (
        <Card style={{ marginBottom: 20 }}>
          <Field label={t("productType")}>
            <Select value={templateCode} onChange={(e) => setTemplateCode(e.target.value)}>
              <option value="annual_section">{t("productTypeAnnual")}</option>
              <option value="summer_course">{t("productTypeSummer")}</option>
            </Select>
          </Field>
          <Field label={t("productName")}>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t("instructor")}>
            <Select value={instructorId} onChange={(e) => pickInstructor(e.target.value)}>
              <option value="">{t("selectInstructor")}</option>
              {instructors.map((inst) => (
                <option key={inst.id} value={inst.id}>{inst.full_name || inst.email}</option>
              ))}
            </Select>
          </Field>
          {templateCode === "annual_section" ? (
            <Field label={t("dayOfWeek")}>
              <Select value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)}>
                {days.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </Select>
            </Field>
          ) : (
            <>
              <Field label={t("courseWeekdays")}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {days.map((d, i) => (
                    <Button
                      key={d}
                      type="button"
                      size="sm"
                      variant={weekdays.includes(i) ? "primary" : "outline"}
                      onClick={() => toggleWeekday(i)}
                    >
                      {d}
                    </Button>
                  ))}
                </div>
              </Field>
              <Field label={t("courseDateRange")}>
                <div style={{ display: "flex", gap: 8 }}>
                  <Input type="date" value={courseStart} onChange={(e) => setCourseStart(e.target.value)} dir="ltr" />
                  <Input type="date" value={courseEnd} onChange={(e) => setCourseEnd(e.target.value)} dir="ltr" />
                </div>
              </Field>
            </>
          )}
          <Field label={`${t("lessonStartTime")} / ${t("endTime")}`}>
            <div style={{ display: "flex", gap: 8 }}>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} dir="ltr" />
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} dir="ltr" />
            </div>
          </Field>
          <Field label={t("productLevelLabel")}>
            <Input value={levelLabel} onChange={(e) => setLevelLabel(e.target.value)} placeholder={t("productLevelLabelPlaceholder")} />
          </Field>
          <Field label={t("assessmentCapacity")}>
            <Input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} dir="ltr" />
          </Field>
          <Field label={t("productPrice")}>
            <Input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} dir="ltr" placeholder={t("productPriceOptional")} />
          </Field>
          <div style={{ display: "flex", gap: 8 }}>
            <Button type="button" variant="primary" onClick={save} disabled={saving}>
              {saving ? <><Spinner size={14} color="var(--on-primary)" /> {t("saving")}</> : t("saveProduct")}
            </Button>
            <Button type="button" variant="secondary" onClick={resetForm}>{t("cancel")}</Button>
          </div>
        </Card>
      )}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
          <Spinner />
        </div>
      ) : products.length === 0 ? (
        <EmptyState title={t("noProducts")} />
      ) : (
        <div className="grouped-list">
          {products.map((p) => (
            <div className="user-row" key={p.id} style={{ flexWrap: "wrap", gap: 8 }}>
              <div className="user-info" style={{ flex: 1 }}>
                <div className="user-display">{formatProductLabel({ ...p, schedule_pattern: p.schedule_pattern }, days, p.product_templates?.code)}</div>
                <div className="user-email">{p.instructor_name}{p.capacity != null ? ` · ${t("assessmentCapacity")}: ${p.capacity}` : ""}{p.price != null ? ` · ${t("productPrice")}: ₪${p.price}` : ""}</div>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={() => startEdit(p)}>{t("editProduct")}</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
