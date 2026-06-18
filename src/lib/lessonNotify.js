import QRCode from "qrcode";
import { VENUE_MAPS_URL } from "./config.js";
import { fmt_time } from "./lessonDates.js";

const LOGO_SRC = "/logo.png";
let logoCache = null;
let logoProcessedCache = null;

export function getLessonQrValue(lesson) {
  return lesson.qr_token || lesson.id;
}

function loadLogoImage() {
  if (logoCache) return Promise.resolve(logoCache);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { logoCache = img; resolve(img); };
    img.onerror = reject;
    img.src = LOGO_SRC;
  });
}

function processLogoRemoveBlack(img) {
  if (logoProcessedCache) return logoProcessedCache;
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 45 && data[i + 1] < 45 && data[i + 2] < 45) data[i + 3] = 0;
  }
  ctx.putImageData(new ImageData(data, canvas.width, canvas.height), 0, 0);
  logoProcessedCache = canvas;
  return canvas;
}

async function loadProcessedLogo() {
  return processLogoRemoveBlack(await loadLogoImage());
}

export function getCalendarLinkUrl(lessonId) {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}?calendar=${lessonId}`;
}

function cancellationCaption(lesson, { t, fmtDateDay }) {
  return [
    t("waHello"),
    t("waLessonCancelled", { name: lesson.child_name }),
    "",
    `${t("date")}: ${fmtDateDay(lesson.lesson_date)}`,
    `${t("startTime")}: ${fmt_time(lesson.start_time)}`,
    `${t("instructor")}: ${lesson.instructor_name}`,
    "",
    t("waBarcodeInvalid"),
  ].join("\n");
}

function ticketCaption(lesson, { t, fmtDateDay }, { updated = false } = {}) {
  return [
    t("waHello"),
    updated ? t("waLessonUpdated", { name: lesson.child_name }) : t("waBarcodeFor", { name: lesson.child_name }),
    "",
    `${t("date")}: ${fmtDateDay(lesson.lesson_date)}`,
    `${t("startTime")}: ${fmt_time(lesson.start_time)}`,
    `${t("instructor")}: ${lesson.instructor_name}`,
    "",
    t("waOneTimeNote"),
    "",
    t("waShowGuard"),
    "",
    t("waLocation"),
    VENUE_MAPS_URL,
    "",
    t("waAddCalendar"),
    getCalendarLinkUrl(lesson.id),
  ].join("\n");
}

async function generateTicketImage(lesson, { t, fmtDateDay, dir }) {
  const [logo] = await Promise.all([
    loadProcessedLogo(),
    document.fonts?.load?.('600 15px "IBM Plex Sans Hebrew"'),
    document.fonts?.load?.('700 16px "IBM Plex Sans Hebrew"'),
  ].filter(Boolean));

  const qrSize = 280;
  const qrCanvas = document.createElement("canvas");
  await QRCode.toCanvas(qrCanvas, getLessonQrValue(lesson), {
    width: qrSize, margin: 2, color: { dark: "#012A4A", light: "#FFFFFF" },
  });

  const W = 400, pad = 28, logoH = 56;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = W;
  canvas.height = pad + logoH + 36 + qrSize + 120 + pad;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const logoW = logo.width * (logoH / logo.height);
  ctx.drawImage(logo, (W - logoW) / 2, pad, logoW, logoH);

  let y = pad + logoH + 36;
  ctx.fillStyle = "#012A4A";
  ctx.font = '700 16px "IBM Plex Sans Hebrew", Arial, sans-serif';
  ctx.textAlign = "center";
  ctx.fillText(t("ticketTitle"), W / 2, y);
  y += 28;

  ctx.drawImage(qrCanvas, (W - qrSize) / 2, y, qrSize, qrSize);
  y += qrSize + 28;

  ctx.font = '600 15px "IBM Plex Sans Hebrew", Arial, sans-serif';
  const rtl = dir === "rtl";
  ctx.textAlign = rtl ? "right" : "left";
  const textX = rtl ? W - pad : pad;
  for (const line of [
    `${t("child")}: ${lesson.child_name}`,
    `${t("date")}: ${fmtDateDay(lesson.lesson_date)}`,
    `${t("startTime")}: ${fmt_time(lesson.start_time)}`,
    `${t("instructor")}: ${lesson.instructor_name}`,
  ]) {
    ctx.fillText(line, textX, y);
    y += 24;
  }

  ctx.font = '500 12px "IBM Plex Sans Hebrew", Arial, sans-serif';
  ctx.fillStyle = "#6BA3BE";
  ctx.textAlign = "center";
  ctx.fillText(t("ticketOneTime"), W / 2, y + 8);

  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error("image"))), "image/png");
  });
}

const isMobileDevice = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

async function shareMessageViaWhatsApp(phone, message) {
  const digits = phone.replace(/\D/g, "").replace(/^0/, "972");
  if (isMobileDevice() && navigator.share) {
    try {
      await navigator.share({ text: message });
      return;
    } catch (e) {
      if (e.name === "AbortError") return;
    }
  }
  window.open(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`, "_blank");
}

export async function shareCancellationViaWhatsApp(lesson, phone, i18n) {
  await shareMessageViaWhatsApp(phone, cancellationCaption(lesson, i18n));
}

export async function shareTextViaWhatsApp(phone, message) {
  await shareMessageViaWhatsApp(phone, message);
}

export function buildWaitlistOfferMessage({ childName, offerUrl, targetLabel, expiresAt }, { t, fmtDateDay }) {
  const expiry = expiresAt ? fmtDateDay(String(expiresAt).slice(0, 10)) : "";
  return [
    t("waHello"),
    t("waWaitlistSpotOpen", { name: childName }),
    targetLabel ? `${t("waitlistTarget")}: ${targetLabel}` : "",
    "",
    t("waWaitlistRegisterLink"),
    offerUrl,
    expiry ? `${t("waitlistOfferExpires")}: ${expiry}` : "",
  ].filter(Boolean).join("\n");
}

export async function shareWaitlistOfferViaWhatsApp(phone, message) {
  await shareMessageViaWhatsApp(phone, message);
}

export async function shareTicketViaWhatsApp(lesson, phone, toast, i18n, { updated = false } = {}) {
  const blob = await generateTicketImage(lesson, i18n);
  const file = new File([blob], `ticket-${lesson.child_name}.png`, { type: "image/png" });
  const caption = ticketCaption(lesson, i18n, { updated });
  const digits = phone.replace(/\D/g, "").replace(/^0/, "972");

  if (isMobileDevice() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: caption });
      return;
    } catch (e) {
      if (e.name === "AbortError") return;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `כרטיס-${lesson.child_name}.png`;
  a.click();
  URL.revokeObjectURL(url);

  toast.show(i18n.t("imageDownloaded"));
  setTimeout(() => {
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(caption)}`, "_blank");
  }, 600);
}

export async function notifyLessonUpdate(lesson, phone, toast, i18n) {
  if (!phone) return false;
  try {
    await shareTicketViaWhatsApp(lesson, phone, toast, i18n, { updated: true });
    return true;
  } catch {
    toast.show(i18n.t("shareError"));
    return false;
  }
}

export async function notifyLessonCancel(lesson, phone, i18n) {
  if (!phone) return false;
  try {
    await shareCancellationViaWhatsApp(lesson, phone, i18n);
    return true;
  } catch {
    return false;
  }
}

export async function notifyNewLesson(lesson, phone, toast, i18n) {
  if (!phone) return false;
  try {
    await shareTicketViaWhatsApp(lesson, phone, toast, i18n);
    return true;
  } catch {
    toast.show(i18n.t("shareError"));
    return false;
  }
}
