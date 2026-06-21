import { supabase } from "./supabase.js";

const SESSION_PREFIX = "portal_session_";

export function parseChildPortalToken() {
  const m = window.location.pathname.match(/\/k\/([0-9a-f-]{36})\/?$/i);
  return m ? m[1] : null;
}

export function getChildPortalUrl(portalToken) {
  const base = `${window.location.origin}${window.location.pathname.replace(/\/$/, "")}`;
  return `${base}/k/${portalToken}`;
}

function sessionKey(portalToken) {
  return `${SESSION_PREFIX}${portalToken}`;
}

export function loadPortalSession(portalToken) {
  try {
    const raw = localStorage.getItem(sessionKey(portalToken));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.nonce) return null;
    if (parsed.expiresAt && new Date(parsed.expiresAt) <= new Date()) {
      localStorage.removeItem(sessionKey(portalToken));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function savePortalSession(portalToken, { nonce, expiresAt }) {
  localStorage.setItem(sessionKey(portalToken), JSON.stringify({ nonce, expiresAt }));
}

export function clearPortalSession(portalToken) {
  localStorage.removeItem(sessionKey(portalToken));
}

export async function verifyPortalPin(portalToken, pin) {
  const { data, error } = await supabase.rpc("verify_portal_pin", {
    p_token: portalToken,
    p_pin: String(pin).trim(),
  });
  if (error) throw error;
  return data;
}

export async function fetchPortalDashboard(portalToken, sessionNonce) {
  const { data, error } = await supabase.rpc("get_portal_dashboard", {
    p_token: portalToken,
    p_nonce: sessionNonce,
  });
  if (error) throw error;
  return data;
}

export async function updatePortalProfile(portalToken, sessionNonce, payload) {
  const { data, error } = await supabase.rpc("update_portal_profile", {
    p_token: portalToken,
    p_nonce: sessionNonce,
    p_payload: payload,
  });
  if (error) throw error;
  return data;
}

export async function setPortalPhoto(portalToken, sessionNonce, photoBase64, mime = "image/jpeg") {
  const { data, error } = await supabase.rpc("set_portal_photo", {
    p_token: portalToken,
    p_nonce: sessionNonce,
    p_photo_base64: photoBase64,
    p_mime: mime,
  });
  if (error) throw error;
  return data;
}

export async function ensureParticipantPortal(participantId) {
  const { data, error } = await supabase.rpc("ensure_participant_portal", {
    p_participant_id: participantId,
  });
  if (error) throw error;
  return data;
}

export async function staffGetPortalCredentials(participantId) {
  const { data, error } = await supabase.rpc("staff_get_portal_credentials", {
    p_participant_id: participantId,
  });
  if (error) throw error;
  return data;
}

export async function staffResetPortalPin(participantId) {
  const { data, error } = await supabase.rpc("staff_reset_portal_pin", {
    p_participant_id: participantId,
  });
  if (error) throw error;
  return data;
}

export async function staffSetParticipantPhoto(participantId, photoBase64, mime = "image/jpeg") {
  const { data, error } = await supabase.rpc("staff_set_participant_photo", {
    p_participant_id: participantId,
    p_photo_base64: photoBase64,
    p_mime: mime,
  });
  if (error) throw error;
  return data;
}

export async function redeemLessonQr(qrToken) {
  const { data, error } = await supabase.rpc("redeem_lesson_qr", { p_qr_token: qrToken });
  if (error) throw error;
  return normalizeScanResult(data);
}

export function normalizeScanResult(data) {
  if (!data) return { ok: false, result: "not_found" };
  if (data.result === "ok") {
    return {
      ok: true,
      result: "ok",
      childName: data.child_name,
      sessionDate: data.session_date || data.lesson_date,
      startTime: data.start_time,
      endTime: data.end_time,
      productName: data.product_name,
      instructorName: data.instructor_name,
      photoUrl: data.photo_url || null,
      photoMissing: !!data.photo_missing,
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
    photoUrl: data.photo_url || null,
    photoMissing: !!data.photo_missing,
  };
}

export function portalBlockedMessage(blocked, t) {
  const map = {
    unpaid: t("portalBlockedUnpaid"),
    too_early: t("portalBlockedTooEarly"),
    too_late: t("portalBlockedTooLate"),
    already_used: t("portalBlockedUsed"),
    cancelled: t("portalBlockedCancelled"),
    inactive: t("portalBlockedInactive"),
    expired: t("portalBlockedExpired"),
    season_inactive: t("portalBlockedSeason"),
  };
  return map[blocked] || t("portalBlockedGeneric");
}

export async function fileToBase64(file) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

export async function copyPortalCredentials(portalToken, pin, toast, t) {
  const url = getChildPortalUrl(portalToken);
  const text = `${t("portalCopyIntro")}\n${t("portalLink")}: ${url}\n${t("portalPin")}: ${pin}`;
  try {
    await navigator.clipboard.writeText(text);
    toast?.show(t("portalCopied"));
  } catch {
    toast?.show(text);
  }
}

export async function copyChildPortalLink(participantId, toast, t) {
  const data = await staffGetPortalCredentials(participantId);
  if (data?.result !== "ok") {
    toast?.show(t("portalNotFound"));
    return;
  }
  await copyPortalCredentials(data.portal_token, data.portal_pin, toast, t);
}

export function buildPortalWhatsAppUrl(phone, portalToken, pin, t) {
  const digits = String(phone || "").replace(/\D/g, "").replace(/^0/, "972");
  const url = getChildPortalUrl(portalToken);
  const text = `${t("portalWaIntro")}\n${url}\n${t("portalPin")}: ${pin}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
