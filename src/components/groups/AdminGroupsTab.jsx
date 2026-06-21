import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../../lib/supabase.js";
import { generateCourseSeriesSessions } from "../../lib/summerCourse.js";
import { formatProductLabel } from "../../lib/productLabel.js";
import { collectAgeOptions, collectGradeOptions, filterProducts } from "../../lib/productFilters.js";
import { fetchActiveEnrollmentCounts } from "../../lib/groupOccupancy.js";
import {
  createEmptyFormState,
  formStateToProductPayload,
  productToFormState,
} from "../../lib/groupModel.js";
import {
  classifyAudienceKind,
  mergeAudienceOptions,
  validateCustomAudience,
  GROUP_TYPE_SUMMER,
} from "../../lib/groupConstants.js";
import { useLang } from "../../i18n.jsx";
import { useIsDesktop } from "../../lib/useBreakpoint.js";
import { seasonOptionLabel } from "../../lib/bidi.js";
import { getPlanningSeason, seasonLifecycle } from "../../lib/seasonPlanning.js";
import GroupFormCard from "../GroupFormCard.jsx";
import GroupEnrollmentsPanel from "./GroupEnrollmentsPanel.jsx";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  SegmentedControl,
  Select,
  Spinner,
} from "../ui/ds/index.js";

const TEMPLATE_CODES = ["annual_section", "summer_course"];
const HISTORY_FILTERS = ["active", "all", "cancelled"];

const ENROLLMENT_SELECT = `
  id, payment_status, valid_from, valid_until, active,
  participant:participants(id, full_name, birth_date, gender, grade, family:families(id, phone, parent_name)),
  product:products(id, name, day_of_week, start_time, end_time, instructor_name, level, level_label, target_audience, gender, schedule_pattern, product_templates(code))
`;

function normalizePhone(phone) {
  return phone.replace(/\s/g, "").trim();
}

export default function AdminGroupsTab({ toast }) {
  const { t, days } = useLang();
  const isDesktop = useIsDesktop();

  const [seasons, setSeasons] = useState([]);
  const [seasonId, setSeasonId] = useState("");
  const [season, setSeason] = useState(null);
  const [planningSeason, setPlanningSeason] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [products, setProducts] = useState([]);
  const [occupancyMap, setOccupancyMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dbAudienceOptions, setDbAudienceOptions] = useState([]);
  const [instructors, setInstructors] = useState([]);

  const [selectedProductId, setSelectedProductId] = useState("");
  const [detailTab, setDetailTab] = useState("enrollments");
  const [mobileView, setMobileView] = useState("list");
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formState, setFormState] = useState(createEmptyFormState);

  const [filterInstructorId, setFilterInstructorId] = useState("");
  const [filterDay, setFilterDay] = useState("");
  const [filterGrade, setFilterGrade] = useState("");
  const [filterAge, setFilterAge] = useState("");
  const [filterTemplate, setFilterTemplate] = useState("");
  const [filterSearch, setFilterSearch] = useState("");

  const [historyFilter, setHistoryFilter] = useState("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchRows, setSearchRows] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchMode, setSearchMode] = useState(false);

  const seasonIsLive = Boolean(season?.active);

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

  const selectedProduct = products.find((p) => p.id === selectedProductId) || null;

  const productLabel = (p) => formatProductLabel(
    { ...p, schedule_pattern: p.schedule_pattern },
    days,
    p?.product_templates?.code,
  );

  const formatOccupancy = (p) => {
    const active = occupancyMap[p.id] || 0;
    if (p.capacity != null) return t("groupOccupancy", { active, capacity: p.capacity });
    return String(active);
  };

  const refreshOccupancy = useCallback(async (productList) => {
    const list = productList || products;
    if (!list.length) {
      setOccupancyMap({});
      return;
    }
    try {
      const counts = await fetchActiveEnrollmentCounts(list.map((p) => p.id));
      setOccupancyMap(counts);
    } catch {
      setOccupancyMap({});
    }
  }, [products]);

  const loadAudienceOptions = useCallback(async () => {
    const { data, error } = await supabase
      .from("target_audience_options")
      .select("kind, label")
      .order("label");
    if (!error) setDbAudienceOptions(data || []);
  }, []);

  const loadMeta = useCallback(async () => {
    const [{ data: seasonRows }, { data: templateRows }, { data: instructorRows }, planning] = await Promise.all([
      supabase.from("seasons").select("id, name, active, start_date, end_date").order("start_date", { ascending: false }),
      supabase.from("product_templates").select("id, code, name").in("code", TEMPLATE_CODES),
      supabase.from("profiles").select("id, full_name, email").eq("role", "instructor").eq("status", "approved").order("full_name"),
      getPlanningSeason(),
    ]);
    setSeasons(seasonRows || []);
    setTemplates(templateRows || []);
    setInstructors(instructorRows || []);
    setPlanningSeason(planning);
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
      .select("id, name, day_of_week, start_time, end_time, instructor_name, instructor_id, capacity, level, level_label, target_audience, gender, schedule_pattern, template_id, product_templates(code)")
      .eq("season_id", sid)
      .order("name");
    if (error) {
      toast.show(error.message);
      setProducts([]);
    } else {
      const list = data || [];
      setProducts(list);
      await refreshOccupancy(list);
      setSelectedProductId((prev) => (prev && list.some((p) => p.id === prev) ? prev : ""));
    }
    setLoading(false);
  }, [toast, refreshOccupancy]);

  useEffect(() => {
    (async () => {
      await loadMeta();
      await loadAudienceOptions();
    })();
  }, [loadMeta, loadAudienceOptions]);

  useEffect(() => {
    const row = seasons.find((s) => s.id === seasonId);
    setSeason(row || null);
    if (seasonId) loadProducts(seasonId);
  }, [seasonId, seasons, loadProducts]);

  useEffect(() => {
    setFilterInstructorId("");
    setFilterDay("");
    setFilterGrade("");
    setFilterAge("");
    setFilterTemplate("");
    setFilterSearch("");
    setSearchMode(false);
    setSearchQuery("");
    setSearchRows([]);
    setMobileView("list");
  }, [seasonId]);

  const clearFilters = () => {
    setFilterInstructorId("");
    setFilterDay("");
    setFilterGrade("");
    setFilterAge("");
    setFilterTemplate("");
    setFilterSearch("");
  };

  const resetForm = () => {
    setEditingId(null);
    setFormState(createEmptyFormState());
    setShowForm(false);
  };

  const selectProduct = (p) => {
    setSelectedProductId(p.id);
    setDetailTab("enrollments");
    setEditingId(p.id);
    setFormState(productToFormState(p));
    setShowForm(true);
    if (!isDesktop) setMobileView("detail");
  };

  const startNewGroup = () => {
    resetForm();
    setSelectedProductId("");
    setDetailTab("settings");
    setShowForm(true);
    setFormState(createEmptyFormState());
    if (!isDesktop) setMobileView("detail");
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

  const saveProduct = async () => {
    if (!seasonId) return toast.show(t("fillAllFields"));

    const result = formStateToProductPayload(formState, { days });
    if (!result.ok) return toast.show(t(result.errorKey));

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
      setShowForm(true);
      setEditingId(productId);
      setSelectedProductId(productId);
      setDetailTab("enrollments");
      await loadProducts(seasonId);
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setSaving(false);
  };

  const runSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearchMode(true);
    setSearchLoading(true);
    try {
      const participantIds = new Set();
      const phoneNorm = normalizePhone(q);

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
        setSearchRows([]);
        setSearchLoading(false);
        return;
      }

      let eq = supabase
        .from("enrollments")
        .select(ENROLLMENT_SELECT)
        .in("participant_id", [...participantIds])
        .order("valid_until", { ascending: true });
      if (historyFilter === "active") eq = eq.eq("active", true);
      else if (historyFilter === "cancelled") eq = eq.eq("active", false);
      const { data: enrollments, error } = await eq;
      if (error) throw error;
      setSearchRows(enrollments || []);
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setSearchLoading(false);
  }, [searchQuery, historyFilter, toast, t]);

  const clearSearch = () => {
    setSearchMode(false);
    setSearchQuery("");
    setSearchRows([]);
  };

  const handleEnrollmentChange = () => {
    refreshOccupancy();
  };

  const historyFilterOptions = HISTORY_FILTERS.map((f) => ({
    value: f,
    label: t(`enrollmentFilter${f.charAt(0).toUpperCase()}${f.slice(1)}`),
  }));

  const detailTabOptions = [
    { value: "enrollments", label: t("groupPanelEnrollments") },
    { value: "settings", label: t("groupPanelSettings") },
  ];

  const renderGroupList = () => (
    <div className="groups-list-panel">
      {!loading && products.length > 0 && (
        <div className="groups-list-filters">
          <Field label={t("instructor")} style={{ marginBottom: 0 }}>
            <Select value={filterInstructorId} onChange={(e) => setFilterInstructorId(e.target.value)}>
              <option value="">{t("allInstructors")}</option>
              {instructorFilterOptions.map((inst) => (
                <option key={inst.id} value={inst.id}>{inst.full_name || inst.email}</option>
              ))}
            </Select>
          </Field>
          <Field label={t("dayOfWeek")} style={{ marginBottom: 0 }}>
            <Select value={filterDay} onChange={(e) => setFilterDay(e.target.value)}>
              <option value="">{t("allDays")}</option>
              {days.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </Select>
          </Field>
          {gradeOptions.length > 0 && (
            <Field label={t("filterByGrade")} style={{ marginBottom: 0 }}>
              <Select value={filterGrade} onChange={(e) => setFilterGrade(e.target.value)}>
                <option value="">{t("allGrades")}</option>
                {gradeOptions.map((g) => <option key={g} value={g}>{g}</option>)}
              </Select>
            </Field>
          )}
          {ageOptions.length > 0 && (
            <Field label={t("filterByAge")} style={{ marginBottom: 0 }}>
              <Select value={filterAge} onChange={(e) => setFilterAge(e.target.value)}>
                <option value="">{t("allAges")}</option>
                {ageOptions.map((a) => <option key={a} value={a}>{a}</option>)}
              </Select>
            </Field>
          )}
          <Field label={t("productType")} style={{ marginBottom: 0 }}>
            <Select value={filterTemplate} onChange={(e) => setFilterTemplate(e.target.value)}>
              <option value="">{t("allTypes")}</option>
              <option value="annual_section">{t("productTypeAnnual")}</option>
              <option value="summer_course">{t("productTypeSummer")}</option>
            </Select>
          </Field>
          <Field label={t("search")} style={{ marginBottom: 0 }}>
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

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
          <Spinner />
        </div>
      ) : products.length === 0 ? (
        <EmptyState title={t("noProducts")} />
      ) : filteredProducts.length === 0 ? (
        <EmptyState title={t("noResults")} />
      ) : (
        <div className="groups-list">
          {filteredProducts.map((p) => (
            <button
              type="button"
              key={p.id}
              className={`groups-list-item${selectedProductId === p.id ? " groups-list-item--selected" : ""}`}
              onClick={() => selectProduct(p)}
            >
              <div className="groups-list-item__label">{productLabel(p)}</div>
              <div className="groups-list-item__meta">
                <span>{p.instructor_name}</span>
                <span className="groups-occupancy" dir="ltr">{formatOccupancy(p)}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const renderDetailPanel = () => {
    if (!selectedProductId && !showForm) {
      return (
        <EmptyState title={t("groupSelectPrompt")} />
      );
    }

    return (
      <div className="groups-detail-panel">
        {selectedProduct && (
          <div className="groups-detail-header">
            <h2 className="groups-detail-title">{productLabel(selectedProduct)}</h2>
            <span className="groups-occupancy" dir="ltr">{formatOccupancy(selectedProduct)}</span>
          </div>
        )}

        <SegmentedControl
          options={detailTabOptions}
          value={detailTab}
          onChange={setDetailTab}
          size="sm"
        />

        {detailTab === "settings" && showForm && (
          <div style={{ marginTop: 16 }}>
            <GroupFormCard
              formState={formState}
              setFormState={setFormState}
              instructors={instructors}
              days={days}
              t={t}
              audienceOptions={audienceOptions}
              onAddAudience={addAudienceOption}
              saving={saving}
              onSave={saveProduct}
              onCancel={resetForm}
            />
          </div>
        )}

        {detailTab === "enrollments" && selectedProductId && (
          <div style={{ marginTop: 16 }}>
            <GroupEnrollmentsPanel
              toast={toast}
              season={season}
              seasonIsLive={seasonIsLive}
              products={products}
              productId={selectedProductId}
              historyFilter={historyFilter}
              onEnrollmentChange={handleEnrollmentChange}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="groups-tab">
      {!isDesktop && mobileView === "list" && (
        <div className="page-header">
          <h1 className="page-title">{t("tabProducts")}</h1>
        </div>
      )}

      {(!isDesktop && mobileView === "list") || isDesktop ? (
        <div className="groups-top-bar">
          <Select value={seasonId} onChange={(e) => setSeasonId(e.target.value)} style={{ minWidth: 160 }}>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {seasonOptionLabel(s.name, {
                  active: s.active,
                  activeLabel: t("active"),
                  planningLabel: seasonLifecycle(s) === "ended" ? t("seasonEnded") : t("seasonPlanning"),
                  lifecycle: seasonLifecycle(s),
                })}
              </option>
            ))}
          </Select>
          {planningSeason && seasonId !== planningSeason.id && (
            <Button variant="secondary" size="sm" onClick={() => setSeasonId(planningSeason.id)}>
              {t("seasonSwitchToPlanning", { name: planningSeason.name })}
            </Button>
          )}
          <Button type="button" variant="primary" size="sm" onClick={startNewGroup}>
            {t("addProduct")}
          </Button>
          <div className="groups-top-bar__search">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("searchByPhoneOrChild")}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
            />
            <Button variant="primary" size="sm" onClick={runSearch} disabled={searchLoading}>
              {searchLoading ? "..." : t("search")}
            </Button>
            {searchMode && (
              <Button variant="secondary" size="sm" onClick={clearSearch}>
                {t("clearSearch")}
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {!seasonIsLive && season && (isDesktop || mobileView === "list") && (
        <Card style={{ marginBottom: 16, borderColor: "var(--warn-border, var(--border))" }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{t("seasonPlanningBannerTitle")}</div>
          <p className="page-sub" style={{ margin: 0 }}>{t("seasonPlanningBannerBody")}</p>
        </Card>
      )}

      {(isDesktop || mobileView === "list") && (
        <div style={{ marginBottom: 16 }}>
          <SegmentedControl
            options={historyFilterOptions}
            value={historyFilter}
            onChange={setHistoryFilter}
            size="sm"
          />
        </div>
      )}

      {searchMode ? (
        <GroupEnrollmentsPanel
          toast={toast}
          season={season}
          seasonIsLive={seasonIsLive}
          products={products}
          productId={null}
          searchMode
          searchRows={searchRows}
          searchLoading={searchLoading}
          onSearchRefresh={runSearch}
          historyFilter={historyFilter}
          showClassColumn
          onEnrollmentChange={handleEnrollmentChange}
        />
      ) : isDesktop ? (
        <div className="groups-master-detail">
          {renderGroupList()}
          {renderDetailPanel()}
        </div>
      ) : mobileView === "list" ? (
        renderGroupList()
      ) : (
        <div className="groups-mobile-detail">
          <div className="groups-mobile-detail-header">
            <Button variant="secondary" size="sm" onClick={() => setMobileView("list")}>
              {t("groupBackToList")}
            </Button>
            {selectedProduct && (
              <span className="groups-detail-title">{productLabel(selectedProduct)}</span>
            )}
          </div>
          {renderDetailPanel()}
        </div>
      )}
    </div>
  );
}
