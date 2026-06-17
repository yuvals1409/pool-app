import { supabase } from "./supabase.js";

export function getPublicPassUrl(publicToken) {
  const base = `${window.location.origin}${window.location.pathname.replace(/\/$/, "")}`;
  return `${base}/t/${publicToken}`;
}

export function parsePublicPathToken() {
  const m = window.location.pathname.match(/\/t\/([0-9a-f-]{36})\/?$/i);
  return m ? m[1] : null;
}

export function normalizePublicPass(data) {
  if (!data || data.result !== "ok") return { ok: false, result: data?.result || "not_found", raw: data };
  return {
    ok: true,
    result: "ok",
    qrToken: data.qr_token,
    publicToken: data.public_token,
    status: data.status,
    validFrom: data.valid_from,
    validUntil: data.valid_until,
    usedAt: data.used_at,
    childName: data.child_name,
    sessionDate: data.session_date,
    startTime: data.start_time,
    endTime: data.end_time,
    productName: data.product_name,
    instructorName: data.instructor_name,
    paymentStatus: data.payment_status,
    enrollmentActive: data.enrollment_active,
  };
}

export function normalizeRedeemResult(data) {
  if (!data) return { ok: false, result: "not_found" };
  if (data.result === "ok") {
    return {
      ok: true,
      result: "ok",
      childName: data.child_name,
      sessionDate: data.session_date,
      startTime: data.start_time,
      endTime: data.end_time,
      productName: data.product_name,
      instructorName: data.instructor_name,
      paymentStatus: data.payment_status,
    };
  }
  return {
    ok: false,
    result: data.result,
    childName: data.child_name,
    productName: data.product_name,
    usedAt: data.used_at,
    validFrom: data.valid_from,
    validUntil: data.valid_until,
  };
}

export async function fetchPublicPass(publicToken) {
  const { data, error } = await supabase.rpc("get_public_pass", { p_public_token: publicToken });
  if (error) throw error;
  return normalizePublicPass(data);
}

export async function lookupAndRedeemPass(qrToken) {
  const { data, error } = await supabase.rpc("redeem_access_pass", { p_qr_token: qrToken });
  if (error) throw error;
  return normalizeRedeemResult(data);
}

export function parseAccessLogReason(reason) {
  if (!reason) return null;
  try {
    return JSON.parse(reason);
  } catch {
    return null;
  }
}
