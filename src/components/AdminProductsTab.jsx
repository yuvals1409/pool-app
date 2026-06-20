import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabase.js";
import { generateCourseSeriesSessions } from "../lib/summerCourse.js";
import { formatProductLabel } from "../lib/productLabel.js";
import { collectAgeOptions, collectGradeOptions, filterProducts } from "../lib/productFilters.js";
import {
  createEmptyFormState,
  formStateToProductPayload,
  productToFormState,
} from "../lib/groupModel.js";
import {
  classifyAudienceKind,
  mergeAudienceOptions,
  validateCustomAudience,
  GROUP_TYPE_SUMMER,
} from "../lib/groupConstants.js";
import { useLang } from "../i18n.jsx";
import { useIsDesktop } from "../lib/useBreakpoint.js";
import { seasonOptionLabel } from "../lib/bidi.js";
import GroupFormCard from "./GroupFormCard.jsx";
import {
  Button,
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
  const [formState, setFormState] = useState(createEmptyFormState);
  const [dbAudienceOptions, setDbAudienceOptions] = useState([]);
  const [instructors, setInstructors] = useState([]);

  const [filterInstructorId, setFilterInstructorId] = useState("");
  const [filterDay, setFilterDay] = useState("");
  const [filterGrade, setFilterGrade] = useState("");
  const [filterAge, setFilterAge] = useState("");
  const [filterTemplate, setFilterTemplate] = useState("");
  const [filterSearch, setFilterSearch] = useState("");

  const audienceOptions = useMemo(
    () => mergeAudienceOptions(formState.type, dbAudienceOptions),
    [formState.type, dbAudienceOptions],
  );

  const gradeOptions = useMemo(() => collectGradeOptions(products), [products]);
  const ageOptions = useMemo(() => collectAgeOptions(products), [products]);
  const instructorFilterOptions = useMemo(() => {
    const ids = new Set(products.map((p) => p.instructor_id).filter(Boolean));
    return instructors.filter((i) => ids.has(i.id));
  }, [products, instructors]);
  const filteredProducts = useMemo(
    () => filterProducts(products, {
      instructorId: filterInstructorId,
      day: filterDay,
      grade: filterGrade,
      age: filterAge,
      templateCode: filterTemplate,
      search: filterSearch,
    }),
    [products, filterInstructorId, filterDay, filterGrade, filterAge, filterTemplate, filterSearch],
  );
  const hasActiveFilters = Boolean(
    filterInstructorId || filterDay || filterGrade || filterAge || filterTemplate || filterSearch.trim(),
  );

  const clearFilters = () => {
    setFilterInstructorId("");
    setFilterDay("");
    setFilterGrade("");
    setFilterAge("");
    setFilterTemplate("");
    setFilterSearch("");
  };

  const loadAudienceOptions = useCallback(async () => {
    const { data, error } = await supabase
      .from("target_audience_options")
      .select("kind, label")
      .order("label");
    if (!error) setDbAudienceOptions(data || []);
  }, []);

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
      .select("id, name, day_of_week, start_time, end_time, instructor_name, instructor_id, capacity, price, level, level_label, target_audience, gender, schedule_pattern, template_id, product_templates(code)")
      .eq("season_id", sid)
      .order("name");
    if (error) toast.show(error.message);
    else setProducts(data || []);
    setLoading(false);
  }, [toast]);

  useEffect(() => { loadMeta(); loadAudienceOptions(); }, [loadMeta, loadAudienceOptions]);
  useEffect(() => { if (seasonId) loadProducts(seasonId); }, [seasonId, loadProducts]);
  useEffect(() => {
    setFilterInstructorId("");
    setFilterDay("");
    setFilterGrade("");
    setFilterAge("");
    setFilterTemplate("");
    setFilterSearch("");
  }, [seasonId]);

  const resetForm = () => {
    setEditingId(null);
    setFormState(createEmptyFormState());
    setShowForm(false);
  };

  const startEdit = (p) => {
    setEditingId(p.id);
    setFormState(productToFormState(p));
    setShowForm(true);
  };

  const addAudienceOption = async (label) => {
    const err = validateCustomAudience(formState.type, label);
    if (err === "summerAgeOnly") {
      toast.show(t("summerAudienceAgeOnly"));
      throw new Error(err);
    }
    if (err) {
      toast.show(t("invalidAudience"));
      throw new Error(err);
    }
    const kind = classifyAudienceKind(label);
    if (!kind) {
      toast.show(t("invalidAudience"));
      throw new Error("invalid");
    }
    const { error } = await supabase
      .from("target_audience_options")
      .upsert({ kind, label }, { onConflict: "label" });
    if (error) {
      toast.show(error.message);
      throw error;
    }
    await loadAudienceOptions();
  };

  const save = async () => {
    if (!seasonId) {
      return toast.show(t("fillAllFields"));
    }

    const result = formStateToProductPayload(formState, { days });
    if (!result.ok) {
      return toast.show(t(result.errorKey));
    }

    const template = templates.find((x) => x.code === result.templateCode);
    if (!template) return toast.show(t("systemError"));

    const payload = {
      ...result.payload,
      season_id: seasonId,
      template_id: template.id,
    };

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
      if (formState.type === GROUP_TYPE_SUMMER) {
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
        <Button type="button" variant="primary" size="sm" onClick={() => { resetForm(); setShowForm(true); setFormState(createEmptyFormState()); }}>
          {t("addProduct")}
        </Button>
      </div>

      {!loading && products.length > 0 && (
        <div className="filter-bar" style={{ alignItems: "flex-end" }}>
          <Field label={t("instructor")} style={{ marginBottom: 0, minWidth: 140, flex: 1 }}>
            <Select value={filterInstructorId} onChange={(e) => setFilterInstructorId(e.target.value)}>
              <option value="">{t("allInstructors")}</option>
              {instructorFilterOptions.map((inst) => (
                <option key={inst.id} value={inst.id}>{inst.full_name || inst.email}</option>
              ))}
            </Select>
          </Field>
          <Field label={t("dayOfWeek")} style={{ marginBottom: 0, minWidth: 120, flex: 1 }}>
            <Select value={filterDay} onChange={(e) => setFilterDay(e.target.value)}>
              <option value="">{t("allDays")}</option>
              {days.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </Select>
          </Field>
          {gradeOptions.length > 0 && (
            <Field label={t("filterByGrade")} style={{ marginBottom: 0, minWidth: 140, flex: 1 }}>
              <Select value={filterGrade} onChange={(e) => setFilterGrade(e.target.value)}>
                <option value="">{t("allGrades")}</option>
                {gradeOptions.map((g) => <option key={g} value={g}>{g}</option>)}
              </Select>
            </Field>
          )}
          {ageOptions.length > 0 && (
            <Field label={t("filterByAge")} style={{ marginBottom: 0, minWidth: 120, flex: 1 }}>
              <Select value={filterAge} onChange={(e) => setFilterAge(e.target.value)}>
                <option value="">{t("allAges")}</option>
                {ageOptions.map((a) => <option key={a} value={a}>{a}</option>)}
              </Select>
            </Field>
          )}
          <Field label={t("productType")} style={{ marginBottom: 0, minWidth: 120, flex: 1 }}>
            <Select value={filterTemplate} onChange={(e) => setFilterTemplate(e.target.value)}>
              <option value="">{t("allTypes")}</option>
              <option value="annual_section">{t("productTypeAnnual")}</option>
              <option value="summer_course">{t("productTypeSummer")}</option>
            </Select>
          </Field>
          <Field label={t("search")} style={{ marginBottom: 0, minWidth: 160, flex: 2 }}>
            <Input
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              placeholder={t("productSearchPlaceholder")}
            />
          </Field>
          {hasActiveFilters && (
            <Button type="button" variant="secondary" size="sm" onClick={clearFilters}>
              {t("clearFilters")}
            </Button>
          )}
        </div>
      )}

      {showForm && (
        <GroupFormCard
          formState={formState}
          setFormState={setFormState}
          instructors={instructors}
          days={days}
          t={t}
          audienceOptions={audienceOptions}
          onAddAudience={addAudienceOption}
          saving={saving}
          onSave={save}
          onCancel={resetForm}
        />
      )}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
          <Spinner />
        </div>
      ) : products.length === 0 ? (
        <EmptyState title={t("noProducts")} />
      ) : filteredProducts.length === 0 ? (
        <EmptyState title={t("noResults")} />
      ) : (
        <div className="grouped-list">
          {filteredProducts.map((p) => (
            <div className="user-row" key={p.id} style={{ flexWrap: "wrap", gap: 8 }}>
              <div className="user-info" style={{ flex: 1 }}>
                <div className="user-display">
                  {formatProductLabel({ ...p, schedule_pattern: p.schedule_pattern }, days, p.product_templates?.code)}
                </div>
                <div className="user-email">
                  {p.instructor_name}
                  {p.capacity != null ? ` · ${t("assessmentCapacity")}: ${p.capacity}` : ""}
                  {p.price != null ? ` · ${t("productPrice")}: ₪${p.price}` : ""}
                </div>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={() => startEdit(p)}>{t("editProduct")}</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
