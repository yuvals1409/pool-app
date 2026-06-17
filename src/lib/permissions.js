import { ADMIN_EMAIL } from "./config.js";

export const isOwner = (p) => !!p && p.email?.toLowerCase() === ADMIN_EMAIL;
export const canManage = (p) => isOwner(p) || p?.role === "admin";
export const canCreateLesson = (p) => isOwner(p) || p?.role === "admin" || p?.role === "instructor";
export const canScan = (p) => isOwner(p) || p?.role === "admin" || p?.role === "instructor" || p?.role === "guard";
export const canViewSchedule = (p) => canScan(p);
export const canEditSchedule = (p) => canCreateLesson(p);
export const canViewAllInstructors = (p) => canManage(p) || p?.role === "guard";
export const canMarkPayment = (p) => isOwner(p) || p?.role === "admin" || p?.role === "office";
export const canAccessOffice = (p) => canMarkPayment(p);
export const canManageEnrollments = (p) => canManage(p);

export const ACTIVE_USER_ROLE_ORDER = ["admin", "office", "instructor", "guard"];

export const assignableRoles = (p) => {
  if (isOwner(p)) return ["admin", "office", "instructor", "guard"];
  if (p?.role === "admin") return ["instructor", "guard"];
  return [];
};

export const canRevokeUser = (actor, target) => {
  if (!target || isOwner(target)) return false;
  if (target.role === "admin" && !isOwner(actor)) return false;
  return canManage(actor);
};

export function canEditLesson(profile, lesson) {
  if (!canEditSchedule(profile)) return false;
  if (lesson.used || lesson.cancelled) return false;
  if (canManage(profile)) return true;
  return lesson.instructor_id === profile.id;
}
