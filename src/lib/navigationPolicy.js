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
  "enrollments",
  "products",
  "seasons",
  "assessment",
  "attendance",
  "utilization",
  "waitlist",
  "dashboard",
  "payroll",
  "sheets",
];

export const PERSONAL_SECTION_IDS = [
  "schedule",
  "payroll",
  "assessments",
  "pending",
];

const ADMIN_MOBILE_SECTION_IDS = [
  "customers",
  "users",
  "enrollments",
  "attendance",
  "waitlist",
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
  const sections = getAdminSections(profile, isDesktop);
  if (sections.includes(currentSection)) return currentSection;
  return sections[0] || "customers";
}
