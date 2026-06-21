import {
  isOwner,
  canCreateLesson,
  canMarkAttendance,
  canScan,
  canViewSchedule,
  canAccessOffice,
  canManage,
} from "./permissions.js";

export const ADMIN_SECTION_IDS = [
  "customers",
  "users",
  "products",
  "pricelist",
  "seasons",
  "assessment",
  "marketing",
  "attendance",
  "alerts",
  "operations",
  "utilization",
  "dashboard",
  "finance",
  "payroll",
  "sheets",
];

export const ADMIN_NAV_GROUPS = [
  { id: "crm", labelKey: "adminGroupCrm", sectionIds: ["customers"] },
  { id: "catalog", labelKey: "adminGroupCatalog", sectionIds: ["products", "seasons", "pricelist", "assessment"] },
  { id: "operations", labelKey: "adminGroupOperations", sectionIds: ["operations", "attendance", "utilization", "alerts"] },
  { id: "insights", labelKey: "adminGroupInsights", sectionIds: ["dashboard"] },
  { id: "finance", labelKey: "adminGroupFinance", sectionIds: ["finance", "payroll"] },
  { id: "team", labelKey: "adminGroupTeam", sectionIds: ["users"] },
  { id: "system", labelKey: "adminGroupSystem", sectionIds: ["marketing", "sheets"] },
];

const ADMIN_SECTION_LABEL_KEYS = {
  customers: "tabCustomers",
  users: "adminSectionUsers",
  products: "tabProducts",
  pricelist: "tabPriceList",
  seasons: "tabSeasons",
  assessment: "tabAssessment",
  marketing: "tabMarketing",
  attendance: "tabAttendance",
  alerts: "tabAlerts",
  operations: "tabOperations",
  utilization: "tabUtilization",
  dashboard: "tabDashboard",
  finance: "tabFinance",
  payroll: "tabPayroll",
  sheets: "tabSheetSync",
};

export const PERSONAL_SECTION_IDS = [
  "schedule",
  "payroll",
  "assessments",
  "pending",
];

const ADMIN_MOBILE_SECTION_IDS = [
  "customers",
  "users",
  "products",
  "attendance",
  "assessment",
];

const TAB_LABEL_KEYS = {
  instructor: "tabLesson",
  attendance: "tabAttendance",
  guard: "tabScan",
  schedule: "tabSchedule",
  office: "tabOffice",
  admin: "tabAdmin",
  personal: "tabPersonal",
};

const PERSONAL_SECTION_LABEL_KEYS = {
  schedule: "personalSectionSchedule",
  payroll: "personalSectionPayroll",
  assessments: "personalSectionAssessments",
  pending: "personalSectionPending",
};

export function isFullAccess(profile) {
  return isOwner(profile);
}

export function getPlatformGate(profile, isDesktop) {
  if (isFullAccess(profile)) return null;
  const role = profile?.role;
  if (role === "instructor" && isDesktop) return "mobile_only";
  if (role === "office" && !isDesktop) return "desktop_only";
  return null;
}

function permissionTabIds(profile) {
  const ids = [];
  if (canCreateLesson(profile)) ids.push("instructor");
  if (canMarkAttendance(profile)) ids.push("attendance");
  if (canScan(profile)) ids.push("guard");
  if (canViewSchedule(profile)) ids.push("schedule");
  if (canAccessOffice(profile)) ids.push("office");
  if (canManage(profile)) ids.push("admin");
  if (profile?.role === "instructor") ids.push("personal");
  return ids;
}

function roleTabIds(role, isDesktop) {
  switch (role) {
    case "instructor":
      if (isDesktop) return [];
      return ["attendance", "instructor", "guard", "personal"];
    case "guard":
      return ["guard", "schedule"];
    case "office":
      if (!isDesktop) return [];
      return ["office"];
    case "admin":
      if (isDesktop) return ["admin", "schedule", "office"];
      return ["guard", "schedule", "admin"];
    default:
      return [];
  }
}

export function getEligibleTabIds(profile, isDesktop) {
  if (!profile) return [];
  if (isFullAccess(profile)) return permissionTabIds(profile);
  return roleTabIds(profile.role, isDesktop);
}

export function getVisibleTabs(profile, isDesktop, t) {
  return getEligibleTabIds(profile, isDesktop).map((id) => ({
    id,
    label: t(TAB_LABEL_KEYS[id] || id),
  }));
}

export function getAdminSections(profile, isDesktop) {
  if (!profile) return [];
  if (isFullAccess(profile) || isDesktop) return [...ADMIN_SECTION_IDS];
  if (profile.role === "admin") return [...ADMIN_MOBILE_SECTION_IDS];
  return [...ADMIN_SECTION_IDS];
}

export function getVisibleSectionsInGroup(groupId, profile, isDesktop) {
  const allowed = new Set(getAdminSections(profile, isDesktop));
  const group = ADMIN_NAV_GROUPS.find((g) => g.id === groupId);
  if (!group) return [];
  return group.sectionIds.filter((id) => allowed.has(id));
}

export function getAdminNavGroups(profile, isDesktop) {
  return ADMIN_NAV_GROUPS
    .map((group) => ({
      ...group,
      sectionIds: getVisibleSectionsInGroup(group.id, profile, isDesktop),
    }))
    .filter((group) => group.sectionIds.length > 0);
}

export function getAdminGroupForSection(sectionId) {
  const group = ADMIN_NAV_GROUPS.find((g) => g.sectionIds.includes(sectionId));
  return group?.id ?? null;
}

export function adminGroupLabel(groupId, t) {
  const group = ADMIN_NAV_GROUPS.find((g) => g.id === groupId);
  return t(group?.labelKey || groupId);
}

export function adminSectionLabel(sectionId, t) {
  return t(ADMIN_SECTION_LABEL_KEYS[sectionId] || sectionId);
}

export function getPersonalSections() {
  return [...PERSONAL_SECTION_IDS];
}

export function getDefaultTab(profile, isDesktop) {
  if (!profile) return "schedule";
  if (isFullAccess(profile)) {
    if (canManage(profile)) return isDesktop ? "admin" : "guard";
    if (canMarkAttendance(profile)) return "attendance";
    if (canScan(profile)) return "guard";
    return "schedule";
  }
  switch (profile.role) {
    case "instructor":
      return "attendance";
    case "guard":
      return "guard";
    case "office":
      return "office";
    case "admin":
      return isDesktop ? "admin" : "guard";
    default:
      return "schedule";
  }
}

export function personalSectionLabel(sectionId, t) {
  return t(PERSONAL_SECTION_LABEL_KEYS[sectionId] || sectionId);
}

export function sanitizeActiveTab(currentTab, profile, isDesktop) {
  const ids = getEligibleTabIds(profile, isDesktop);
  if (ids.includes(currentTab)) return currentTab;
  return getDefaultTab(profile, isDesktop);
}

export function sanitizeAdminSection(currentSection, profile, isDesktop) {
  if (currentSection === "enrollments") return "products";
  if (currentSection === "waitlist") return "customers";
  if (currentSection === "revenue_forecast") return "finance";
  if (currentSection === "season_planning") return "seasons";
  if (currentSection === "health" || currentSection === "students" || currentSection === "instructors") return "dashboard";
  const sections = getAdminSections(profile, isDesktop);
  if (sections.includes(currentSection)) return currentSection;
  return sections[0] || "customers";
}
