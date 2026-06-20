import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabase.js";
import { useLang } from "../i18n.jsx";
import { formatProductLabel } from "../lib/productLabel.js";
import { useIsDesktop } from "../lib/useBreakpoint.js";
import { PARTICIPANT_GRADES, genderLabel } from "../lib/participantFields.js";
import { useStudentProfile } from "../lib/StudentProfileContext.jsx";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  SegmentedControl,
  Select,
  Spinner,
} from "./ui/ds/index.js";

const PAYMENT_BADGE_VARIANT = { paid: "success", unpaid: "warn", waived: "neutral" };
const ENROLLMENT_FILTERS = ["all", "active", "none", "cancelled"];
const PAYMENT_FILTERS = ["any", "unpaid", "all_paid", "waived"];
const EMAIL_FILTERS = ["any", "has", "missing"];
const CHILDREN_FILTERS = ["any", "one", "multiple"];
const WAITLIST_FILTERS = ["any", "yes", "no"];
const SORT_OPTIONS = ["newest", "oldest", "parent_name", "phone", "most_children"];

function normalizePhone(phone) {
  return (phone || "").replace(/\s/g, "").trim();
}

function calcAge(birthDate) {
  if (!birthDate) return null;
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

function flattenEnrollments(family) {
  const rows = [];
  for (const participant of family.participants || []) {
    for (const enrollment of participant.enrollments || []) {
      rows.push({ participant, enrollment });
    }
  }
  return rows;
}

function hasActiveEnrollment(family) {
  return flattenEnrollments(family).some(({ enrollment }) => enrollment.active);
}

function hasCancelledOnly(family) {
  const rows = flattenEnrollments(family);
  return rows.length > 0 && rows.every(({ enrollment }) => !enrollment.active);
}

function paymentSummary(family) {
  const statuses = flattenEnrollments(family)
    .filter(({ enrollment }) => enrollment.active)
    .map(({ enrollment }) => enrollment.payment_status);
  return {
    hasUnpaid: statuses.includes("unpaid"),
    allPaid: statuses.length > 0 && statuses.every((s) => s === "paid"),
    hasWaived: statuses.includes("waived"),
  };
}

function matchesSearch(family, query) {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  const phoneNorm = normalizePhone(query);
  const haystack = [
    family.parent_name,
    family.phone,
    family.email,
    ...(family.participants || []).flatMap((p) => [
      p.full_name,
      p.external_client_id,
      p.gender,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (haystack.includes(q)) return true;
  if (phoneNorm && normalizePhone(family.phone).includes(phoneNorm)) return true;
  return false;
}

function matchesAgeRange(participants, minAge, maxAge) {
  if (!minAge && !maxAge) return true;
  const min = minAge ? Number(minAge) : null;
  const max = maxAge ? Number(maxAge) : null;
  return (participants || []).some((p) => {
    const age = calcAge(p.birth_date);
    if (age == null) return false;
    if (min != null && age < min) return false;
    if (max != null && age > max) return false;
    return true;
  });
}

function matchesCreatedRange(createdAt, from, to) {
  if (!from && !to) return true;
  const created = createdAt?.slice(0, 10);
  if (!created) return false;
  if (from && created < from) return false;
  if (to && created > to) return false;
  return true;
}

export default function AdminCustomersTab({ toast }) {
  const { t, days, fmtDateDay } = useLang();
  const { openProfile } = useStudentProfile();
  const isDesktop = useIsDesktop();
  const [families, setFamilies] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [products, setProducts] = useState([]);
  const [waitlistPhones, setWaitlistPhones] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [showFilters, setShowFilters] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [enrollmentFilter, setEnrollmentFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("any");
  const [productId, setProductId] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [gender, setGender] = useState("");
  const [emailFilter, setEmailFilter] = useState("any");
  const [childrenFilter, setChildrenFilter] = useState("any");
  const [waitlistFilter, setWaitlistFilter] = useState("any");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [editingParticipantId, setEditingParticipantId] = useState(null);
  const [editGender, setEditGender] = useState("");
  const [editGrade, setEditGrade] = useState("");
  const [editBirthDate, setEditBirthDate] = useState("");
  const [savingParticipantId, setSavingParticipantId] = useState(null);

  const paymentLabel = (status) => ({
    paid: t("paymentPaid"),
    unpaid: t("paymentUnpaid"),
    waived: t("paymentWaived"),
  }[status] || status);

  const familySelect = `
    id, phone, email, parent_name, created_at,
    participants(
      id, full_name, birth_date, gender, grade, external_client_id, created_at, first_enrolled_at,
      enrollments(
        id, payment_status, valid_from, valid_until, active, created_at,
        product:products(
          id, name, day_of_week, start_time, end_time, instructor_name,
          level, level_label, season_id, schedule_pattern,
          product_templates(code)
        )
      )
    )
  `;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: familyRows, error }, { data: seasonRows }, { data: waitlistRows }] = await Promise.all([
        supabase.from("families").select(familySelect).order("created_at", { ascending: false }),
        supabase.from("seasons").select("id, name, active").order("start_date", { ascending: false }),
        supabase
          .from("waitlist_entries")
          .select("phone, family_id")
          .in("status", ["waiting", "notified"]),
      ]);
      if (error) throw error;
      setFamilies(familyRows || []);
      setSeasons(seasonRows || []);
      const phones = new Set(
        (waitlistRows || []).map((row) => normalizePhone(row.phone)).filter(Boolean),
      );
      setWaitlistPhones(phones);
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setLoading(false);
  }, [toast, t]);

  useEffect(() => { load(); }, [load]);

  const startEditParticipant = (participant) => {
    setEditingParticipantId(participant.id);
    setEditGender(participant.gender || "");
    setEditGrade(participant.grade || "");
    setEditBirthDate(participant.birth_date || "");
  };

  const cancelEditParticipant = () => {
    setEditingParticipantId(null);
    setEditGender("");
    setEditGrade("");
    setEditBirthDate("");
  };

  const saveParticipant = async (participantId) => {
    setSavingParticipantId(participantId);
    try {
      let prevGender = null;
      for (const fam of families) {
        const p = (fam.participants || []).find((row) => row.id === participantId);
        if (p) { prevGender = p.gender; break; }
      }
      const genderChanged = editGender && editGender !== prevGender;
      const { error } = await supabase.from("participants").update({
        gender: editGender || null,
        grade: editGrade || null,
        birth_date: editBirthDate || null,
        ...(genderChanged ? { gender_manual_at: new Date().toISOString() } : {}),
      }).eq("id", participantId);
      if (error) throw error;
      toast.show(t("save"));
      cancelEditParticipant();
      await load();
    } catch (e) {
      toast.show(e.message || t("systemError"));
    }
    setSavingParticipantId(null);
  };

  useEffect(() => {
    if (!seasonId) {
      setProducts([]);
      setProductId("");
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, day_of_week, start_time, season_id, schedule_pattern, product_templates(code)")
        .eq("season_id", seasonId)
        .order("name");
      if (error) toast.show(error.message);
      else {
        setProducts(data || []);
        if (productId && !(data || []).some((p) => p.id === productId)) setProductId("");
      }
    })();
  }, [seasonId, productId, toast]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchQuery.trim()) count += 1;
    if (enrollmentFilter !== "all") count += 1;
    if (paymentFilter !== "any") count += 1;
    if (productId) count += 1;
    if (seasonId) count += 1;
    if (gender) count += 1;
    if (emailFilter !== "any") count += 1;
    if (childrenFilter !== "any") count += 1;
    if (waitlistFilter !== "any") count += 1;
    if (createdFrom || createdTo) count += 1;
    if (ageMin || ageMax) count += 1;
    if (sortBy !== "newest") count += 1;
    return count;
  }, [
    searchQuery, enrollmentFilter, paymentFilter, productId, seasonId, gender,
    emailFilter, childrenFilter, waitlistFilter, createdFrom, createdTo, ageMin, ageMax, sortBy,
  ]);

  const filteredFamilies = useMemo(() => {
    let rows = [...families];

    rows = rows.filter((family) => {
      if (!matchesSearch(family, searchQuery)) return false;

      const active = hasActiveEnrollment(family);
      const cancelledOnly = hasCancelledOnly(family);
      if (enrollmentFilter === "active" && !active) return false;
      if (enrollmentFilter === "none" && flattenEnrollments(family).length > 0) return false;
      if (enrollmentFilter === "cancelled" && !cancelledOnly) return false;

      const pay = paymentSummary(family);
      if (paymentFilter === "unpaid" && !pay.hasUnpaid) return false;
      if (paymentFilter === "all_paid" && !pay.allPaid) return false;
      if (paymentFilter === "waived" && !pay.hasWaived) return false;

      if (productId) {
        const hasProduct = flattenEnrollments(family).some(
          ({ enrollment }) => enrollment.product?.id === productId && enrollment.active,
        );
        if (!hasProduct) return false;
      }

      if (seasonId) {
        const hasSeason = flattenEnrollments(family).some(
          ({ enrollment }) => enrollment.product?.season_id === seasonId,
        );
        if (!hasSeason) return false;
      }

      if (gender) {
        const hasGender = (family.participants || []).some(
          (p) => (p.gender || "").toLowerCase() === gender.toLowerCase(),
        );
        if (!hasGender) return false;
      }

      if (emailFilter === "has" && !family.email?.trim()) return false;
      if (emailFilter === "missing" && family.email?.trim()) return false;

      const childCount = (family.participants || []).length;
      if (childrenFilter === "one" && childCount !== 1) return false;
      if (childrenFilter === "multiple" && childCount < 2) return false;

      const onWaitlist = waitlistPhones.has(normalizePhone(family.phone));
      if (waitlistFilter === "yes" && !onWaitlist) return false;
      if (waitlistFilter === "no" && onWaitlist) return false;

      if (!matchesCreatedRange(family.created_at, createdFrom, createdTo)) return false;
      if (!matchesAgeRange(family.participants, ageMin, ageMax)) return false;

      return true;
    });

    rows.sort((a, b) => {
      if (sortBy === "oldest") return (a.created_at || "").localeCompare(b.created_at || "");
      if (sortBy === "parent_name") {
        return (a.parent_name || "").localeCompare(b.parent_name || "", "he");
      }
      if (sortBy === "phone") {
        return normalizePhone(a.phone).localeCompare(normalizePhone(b.phone));
      }
      if (sortBy === "most_children") {
        return (b.participants?.length || 0) - (a.participants?.length || 0);
      }
      return (b.created_at || "").localeCompare(a.created_at || "");
    });

    return rows;
  }, [
    families, searchQuery, enrollmentFilter, paymentFilter, productId, seasonId, gender,
    emailFilter, childrenFilter, waitlistFilter, waitlistPhones, createdFrom, createdTo,
    ageMin, ageMax, sortBy,
  ]);

  const resetFilters = () => {
    setSearchQuery("");
    setEnrollmentFilter("all");
    setPaymentFilter("any");
    setProductId("");
    setSeasonId("");
    setGender("");
    setEmailFilter("any");
    setChildrenFilter("any");
    setWaitlistFilter("any");
    setCreatedFrom("");
    setCreatedTo("");
    setAgeMin("");
    setAgeMax("");
    setSortBy("newest");
  };

  const toggleExpanded = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const enrollmentFilterOptions = ENROLLMENT_FILTERS.map((id) => ({
    value: id,
    label: t(`customersEnrollmentFilter_${id}`),
  }));

  const paymentFilterOptions = PAYMENT_FILTERS.map((id) => ({
    value: id,
    label: t(`customersPaymentFilter_${id}`),
  }));

  const emailFilterOptions = EMAIL_FILTERS.map((id) => ({
    value: id,
    label: t(`customersEmailFilter_${id}`),
  }));

  const childrenFilterOptions = CHILDREN_FILTERS.map((id) => ({
    value: id,
    label: t(`customersChildrenFilter_${id}`),
  }));

  const waitlistFilterOptions = WAITLIST_FILTERS.map((id) => ({
    value: id,
    label: t(`customersWaitlistFilter_${id}`),
  }));

  const sortOptions = SORT_OPTIONS.map((id) => ({
    value: id,
    label: t(`customersSort_${id}`),
  }));

  return (
    <div>
      {!isDesktop && (
        <div className="page-header">
          <h1 className="page-title">{t("tabCustomers")}</h1>
          <p className="page-sub">{t("customersSub")}</p>
        </div>
      )}

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: showFilters ? 16 : 0 }}>
          <Field label={t("customersSearchLabel")} style={{ flex: 1, minWidth: 220, marginBottom: 0 }}>
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("customersSearchPlaceholder")}
            />
          </Field>
          <Button variant="ghost" size="sm" onClick={() => setShowFilters((v) => !v)}>
            {showFilters ? t("customersHideFilters") : t("customersShowFilters")}
            {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </Button>
          {activeFilterCount > 0 && (
            <Button variant="outline" size="sm" onClick={resetFilters}>{t("customersResetFilters")}</Button>
          )}
        </div>

        {showFilters && (
          <div style={{ display: "grid", gap: 16 }}>
            <Field label={t("customersEnrollmentFilterLabel")}>
              <SegmentedControl
                options={enrollmentFilterOptions}
                value={enrollmentFilter}
                onChange={setEnrollmentFilter}
                size="sm"
              />
            </Field>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              <Field label={t("customersPaymentFilterLabel")}>
                <Select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}>
                  {paymentFilterOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label={t("tabSeasons")}>
                <Select value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
                  <option value="">{t("customersAnySeason")}</option>
                  {seasons.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}{s.active ? ` (${t("active")})` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("selectClass")}>
                <Select value={productId} onChange={(e) => setProductId(e.target.value)} disabled={!seasonId}>
                  <option value="">{t("customersAnyProduct")}</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {formatProductLabel(p, days, p.product_templates?.code)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("customersGenderLabel")}>
                <Select value={gender} onChange={(e) => setGender(e.target.value)}>
                  <option value="">{t("customersAnyGender")}</option>
                  <option value="male">{t("customersGenderMale")}</option>
                  <option value="female">{t("customersGenderFemale")}</option>
                </Select>
              </Field>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              <Field label={t("customersEmailFilterLabel")}>
                <Select value={emailFilter} onChange={(e) => setEmailFilter(e.target.value)}>
                  {emailFilterOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label={t("customersChildrenFilterLabel")}>
                <Select value={childrenFilter} onChange={(e) => setChildrenFilter(e.target.value)}>
                  {childrenFilterOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label={t("customersWaitlistFilterLabel")}>
                <Select value={waitlistFilter} onChange={(e) => setWaitlistFilter(e.target.value)}>
                  {waitlistFilterOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label={t("customersSortLabel")}>
                <Select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                  {sortOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </Select>
              </Field>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
              <Field label={t("customersCreatedFrom")}>
                <Input type="date" value={createdFrom} onChange={(e) => setCreatedFrom(e.target.value)} />
              </Field>
              <Field label={t("customersCreatedTo")}>
                <Input type="date" value={createdTo} onChange={(e) => setCreatedTo(e.target.value)} />
              </Field>
              <Field label={t("customersAgeMin")}>
                <Input type="number" min="0" max="120" value={ageMin} onChange={(e) => setAgeMin(e.target.value)} placeholder="0" />
              </Field>
              <Field label={t("customersAgeMax")}>
                <Input type="number" min="0" max="120" value={ageMax} onChange={(e) => setAgeMax(e.target.value)} placeholder="18" />
              </Field>
            </div>
          </div>
        )}
      </Card>

      <div className="section-sub" style={{ marginBottom: 12 }}>
        {t("customersResultsCount", { count: filteredFamilies.length, total: families.length })}
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
          <Spinner />
        </div>
      ) : filteredFamilies.length === 0 ? (
        <EmptyState title={t("customersEmpty")} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filteredFamilies.map((family) => {
            const expanded = expandedIds.has(family.id);
            const childCount = family.participants?.length || 0;
            const activeCount = flattenEnrollments(family).filter(({ enrollment }) => enrollment.active).length;
            const onWaitlist = waitlistPhones.has(normalizePhone(family.phone));
            const displayName = family.parent_name || family.phone || t("customersUnnamed");

            return (
              <Card key={family.id} style={{ padding: 0, overflow: "hidden" }}>
                <button
                  type="button"
                  onClick={() => toggleExpanded(family.id)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "14px 16px",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "start",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontWeight: 600, color: "var(--ink)" }}>
                      {displayName}
                      {onWaitlist && <Badge variant="warn">{t("tabWaitlist")}</Badge>}
                      {activeCount > 0 && (
                        <Badge variant="success">{t("customersActiveEnrollments", { count: activeCount })}</Badge>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 4 }} dir="ltr">
                      {family.phone}
                      {family.email ? ` · ${family.email}` : ""}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 2 }}>
                      {t("customersChildrenCount", { count: childCount })}
                      {family.created_at ? ` · ${t("customersJoined")} ${fmtDateDay(family.created_at.slice(0, 10))}` : ""}
                    </div>
                  </div>
                  <span style={{ color: "var(--ink-soft)", transform: expanded ? "rotate(180deg)" : "none" }} aria-hidden>▼</span>
                </button>

                {expanded && (
                  <div style={{ borderTop: "1px solid var(--border)", padding: "12px 16px 16px" }}>
                    <div className="lesson-info" style={{ marginBottom: 16 }}>
                      <div className="lesson-info-row">
                        <span className="li-key">{t("parentName")}</span>
                        <span className="li-val">{family.parent_name || "—"}</span>
                      </div>
                      <div className="lesson-info-row">
                        <span className="li-key">{t("parentPhone")}</span>
                        <span className="li-val" dir="ltr">{family.phone || "—"}</span>
                      </div>
                      <div className="lesson-info-row">
                        <span className="li-key">{t("customersEmailLabel")}</span>
                        <span className="li-val" dir="ltr">{family.email || "—"}</span>
                      </div>
                      <div className="lesson-info-row">
                        <span className="li-key">{t("customersJoined")}</span>
                        <span className="li-val">
                          {family.created_at ? fmtDateDay(family.created_at.slice(0, 10)) : "—"}
                        </span>
                      </div>
                    </div>

                    {(family.participants || []).length === 0 ? (
                      <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>{t("customersNoChildren")}</div>
                    ) : (
                      (family.participants || []).map((participant) => {
                        const age = calcAge(participant.birth_date);
                        const enrollments = [...(participant.enrollments || [])].sort(
                          (a, b) => Number(b.active) - Number(a.active),
                        );
                        return (
                          <div key={participant.id} style={{ marginBottom: 14, paddingTop: 10, borderTop: "1px solid var(--border-soft)" }}>
                            <div style={{ fontWeight: 600, marginBottom: 8 }}>{participant.full_name}</div>
                            <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 8 }}>
                              {age != null ? `${t("childAge")}: ${age}` : t("customersAgeUnknown")}
                              {participant.gender ? ` · ${genderLabel(t, participant.gender)}` : ""}
                              {participant.grade ? ` · ${t("participantGradeLabel")}: ${participant.grade}` : ""}
                              {participant.external_client_id ? ` · ${t("customersExternalId")}: ${participant.external_client_id}` : ""}
                              {participant.birth_date ? ` · ${fmtDateDay(participant.birth_date)}` : ""}
                              {participant.first_enrolled_at ? ` · ${t("customersFirstEnrolled")}: ${fmtDateDay(participant.first_enrolled_at)}` : ""}
                            </div>
                            {editingParticipantId === participant.id ? (
                              <div style={{ display: "grid", gap: 8, maxWidth: 360, marginBottom: 12 }}>
                                <Field label={t("participantGenderLabel")}>
                                  <Select value={editGender} onChange={(e) => setEditGender(e.target.value)}>
                                    <option value="">{t("participantGenderLabel")}</option>
                                    <option value="male">{t("participantGender_male")}</option>
                                    <option value="female">{t("participantGender_female")}</option>
                                  </Select>
                                </Field>
                                <Field label={t("participantBirthDateLabel")}>
                                  <Input type="date" dir="ltr" value={editBirthDate} onChange={(e) => setEditBirthDate(e.target.value)} />
                                </Field>
                                <Field label={t("participantGradeLabel")}>
                                  <Select value={editGrade} onChange={(e) => setEditGrade(e.target.value)}>
                                    <option value="">{t("participantGradeLabel")}</option>
                                    {PARTICIPANT_GRADES.map((g) => (
                                      <option key={g} value={g}>{g}</option>
                                    ))}
                                  </Select>
                                </Field>
                                <div style={{ display: "flex", gap: 8 }}>
                                  <Button
                                    size="sm"
                                    disabled={savingParticipantId === participant.id}
                                    onClick={() => saveParticipant(participant.id)}
                                  >
                                    {t("save")}
                                  </Button>
                                  <Button size="sm" variant="secondary" onClick={cancelEditParticipant}>
                                    {t("cancel")}
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div style={{ marginBottom: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <Button size="sm" variant="outline" onClick={() => startEditParticipant(participant)}>
                                  {t("edit")}
                                </Button>
                                <Button size="sm" variant="secondary" onClick={() => openProfile(participant.id)}>
                                  {t("openFullProfile")}
                                </Button>
                              </div>
                            )}
                            {enrollments.length === 0 ? (
                              <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>{t("customersNoEnrollments")}</div>
                            ) : (
                              enrollments.map((enrollment) => {
                                const product = enrollment.product;
                                const templateCode = product?.product_templates?.code;
                                return (
                                  <div
                                    key={enrollment.id}
                                    style={{
                                      display: "flex",
                                      flexWrap: "wrap",
                                      gap: 8,
                                      alignItems: "center",
                                      marginBottom: 6,
                                      fontSize: 13,
                                    }}
                                  >
                                    <Badge variant={enrollment.active ? "success" : "neutral"}>
                                      {enrollment.active ? t("active") : t("customersCancelled")}
                                    </Badge>
                                    <Badge variant={PAYMENT_BADGE_VARIANT[enrollment.payment_status] || "neutral"}>
                                      {paymentLabel(enrollment.payment_status)}
                                    </Badge>
                                    <span>{formatProductLabel(product, days, templateCode)}</span>
                                    {product?.instructor_name && (
                                      <span style={{ color: "var(--ink-soft)" }}>· {product.instructor_name}</span>
                                    )}
                                    <span style={{ color: "var(--ink-soft)" }} dir="ltr">
                                      {fmtDateDay(enrollment.valid_from)} – {fmtDateDay(enrollment.valid_until)}
                                    </span>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
