export const E2E_SEARCH_PHONE =
  process.env.E2E_SEARCH_PHONE || "0501111999";
export const E2E_QR_TOKEN =
  process.env.E2E_QR_TOKEN || "e2e00001-0000-4000-8000-000000000001";
export const E2E_LESSON_ID =
  process.env.E2E_LESSON_ID || "e2e00002-0000-4000-8000-000000000002";
export const E2E_PASS_TOKEN =
  process.env.E2E_PASS_TOKEN || "e2e00003-0000-4000-8000-000000000003";
export const E2E_GROUP_SESSION_ID =
  process.env.E2E_GROUP_SESSION_ID || "e2e00005-0000-4000-8000-000000000005";

export function hasRealSupabase() {
  const url = process.env.VITE_SUPABASE_URL || "";
  return url.length > 0 && !url.includes("placeholder");
}
