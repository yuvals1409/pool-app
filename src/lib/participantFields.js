/** Grade and gender field helpers for participant forms. */

export const PARTICIPANT_GRADES = [
  "גן",
  "א'",
  "ב'",
  "ג'",
  "ד'",
  "ה'",
  "ו'",
  "ז'",
  "ח'",
  "ט'",
  'י\'-י"ב',
];

export const PARTICIPANT_GENDERS = ["male", "female"];

export const ADULT_AGE_THRESHOLD = 18;

export function calcAge(birthDate) {
  if (!birthDate) return null;
  const today = new Date();
  const birth = new Date(`${birthDate}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

export function calcAgeFromYears(childAge) {
  const n = Number(childAge);
  if (!Number.isFinite(n) || n <= 0 || n >= 120) return null;
  return n;
}

export function birthDateFromAge(childAge) {
  const age = calcAgeFromYears(childAge);
  if (age == null) return null;
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  return d.toISOString().slice(0, 10);
}

/**
 * @param {{ birthDate?: string, childAge?: string|number }} [params]
 */
export function gradeRequired({ birthDate, childAge } = {}) {
  const age = birthDate ? calcAge(birthDate) : calcAgeFromYears(childAge);
  if (age == null) return true;
  return age < ADULT_AGE_THRESHOLD;
}

/**
 * @param {{ birthDate?: string, childAge?: string|number }} [params]
 */
export function resolveBirthDate({ birthDate, childAge } = {}) {
  if (birthDate) return birthDate;
  return birthDateFromAge(childAge);
}

/**
 * @param {{ gender?: string, grade?: string, birthDate?: string, childAge?: string|number }} fields
 * @param {{ t?: (key: string) => string }} [options]
 */
export function validateParticipantFields({ gender, grade, birthDate, childAge }, { t } = {}) {
  const err = (key) => (t ? t(key) : key);
  if (!gender || !PARTICIPANT_GENDERS.includes(gender)) {
    return err("participantGenderRequired");
  }
  if (gradeRequired({ birthDate, childAge }) && !grade) {
    return err("participantGradeRequired");
  }
  if (grade && !PARTICIPANT_GRADES.includes(grade)) {
    return err("participantGradeInvalid");
  }
  return null;
}

export function genderLabel(t, gender) {
  if (!gender) return "—";
  return t(`customersGender_${gender}`) || t(`participantGender_${gender}`) || gender;
}

/** Sheet gender: ז'/זכר → male; נ'/נקבה → female */
export function normalizeSheetGender(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (["male", "m", "ז'", "זכר", "ז"].includes(s)) return "male";
  if (["female", "f", "נ'", "נקבה", "נ"].includes(s)) return "female";
  return null;
}

export function gradeLabel(grade) {
  return grade || "—";
}
