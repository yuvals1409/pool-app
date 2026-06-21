import { supabase } from "./supabase.js";
import { dateToDayOfWeek, toLocalDateStr, parseDateStr } from "./lessonDates.js";
import { notifyLessonCancel, notifyLessonUpdate, notifyNewLesson } from "./lessonNotify.js";
import { markLessonNotified } from "./supabase.js";
import { suggestPrivateLessonPrice } from "./pricing.js";
import { consumePackageSession } from "./privatePackages.js";
import { recordBillingPayment } from "./billing.js";
import { ensureParticipantPortal } from "./childPortal.js";

function normalizePhone(phone) {
  return String(phone || "").replace(/\s/g, "").trim();
}

async function findOrCreateFamily(phone, name) {
  const { data: existing } = await supabase
    .from("families")
    .select("id, parent_name")
    .eq("phone", phone)
    .maybeSingle();
  if (existing) {
    if (name && name !== existing.parent_name) {
      await supabase.from("families").update({ parent_name: name }).eq("id", existing.id);
    }
    return existing.id;
  }
  const { data: created, error } = await supabase
    .from("families")
    .insert({ phone, parent_name: name || null })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

async function findOrCreateParticipant(familyId, fullName) {
  const trimmed = String(fullName || "").trim();
  const { data: siblings } = await supabase
    .from("participants")
    .select("id, full_name")
    .eq("family_id", familyId);
  const match = (siblings || []).find(
    (p) => p.full_name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  if (match) return match.id;
  const { data: created, error } = await supabase
    .from("participants")
    .insert({ family_id: familyId, full_name: trimmed })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

async function ensureLessonParticipant(parentPhone, childName) {
  let participantId = await resolveParticipantId(parentPhone, childName);
  const phone = normalizePhone(parentPhone);
  if (!phone || !String(childName || "").trim()) return null;
  if (!participantId) {
    const familyId = await findOrCreateFamily(phone, null);
    participantId = await findOrCreateParticipant(familyId, childName);
  }
  const portal = await ensureParticipantPortal(participantId);
  if (portal?.result !== "ok") throw new Error(portal?.result || "portal_error");
  return participantId;
}

export const RECURRING_SCOPE = { SINGLE: "single", FORWARD: "forward" };

async function fetchFutureSeriesLessons(recurringId, fromDate) {
  const { data } = await supabase.from("lessons").select("*")
    .eq("recurring_lesson_id", recurringId)
    .gte("lesson_date", fromDate)
    .eq("cancelled", false)
    .eq("used", false)
    .order("lesson_date")
    .order("start_time");
  return data || [];
}

function shiftDateByWeeks(baseDateStr, targetDateStr, lessonDateStr) {
  const base = parseDateStr(baseDateStr);
  const target = parseDateStr(targetDateStr);
  const lesson = parseDateStr(lessonDateStr);
  const weekDiff = Math.round((lesson - base) / (7 * 24 * 60 * 60 * 1000));
  const result = new Date(target);
  result.setDate(result.getDate() + weekDiff * 7);
  return toLocalDateStr(result);
}

export async function resolveParticipantId(parentPhone, childName) {
  const phone = String(parentPhone || "").replace(/\s/g, "").trim();
  const name = String(childName || "").trim();
  if (!phone || !name) return null;

  const { data: family } = await supabase
    .from("families")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();
  if (!family) return null;

  const { data: siblings } = await supabase
    .from("participants")
    .select("id, full_name")
    .eq("family_id", family.id);

  const match = (siblings || []).find(
    (p) => p.full_name.trim().toLowerCase() === name.toLowerCase(),
  );
  return match?.id || null;
}

async function resolveLessonPricing(form) {
  const {
    child_name, parent_phone, lesson_format = "single",
    private_package_id, payment_status,
  } = form;

  if (lesson_format === "package_session" && private_package_id) {
    return {
      price: 0,
      payment_status: payment_status || "paid",
      lesson_format: "package_session",
      private_package_id,
      pricing: null,
      participantId: await resolveParticipantId(parent_phone, child_name),
    };
  }

  const participantId = await resolveParticipantId(parent_phone, child_name);
  if (!participantId) {
    return {
      price: null,
      payment_status: payment_status || "unpaid",
      lesson_format: lesson_format === "double" ? "double" : "single",
      private_package_id: null,
      pricing: null,
      participantId: null,
    };
  }

  const format = lesson_format === "double" ? "double" : "single";
  const pricing = await suggestPrivateLessonPrice(participantId, format);
  return {
    price: pricing?.suggested_amount != null ? Number(pricing.suggested_amount) : null,
    payment_status: payment_status || "unpaid",
    lesson_format: format,
    private_package_id: null,
    pricing,
    participantId,
  };
}

export async function createLesson({ profile, instructor, form }) {
  const {
    child_name, lesson_date, start_time, parent_phone, lesson_type,
  } = form;
  const inst = instructor || profile;

  const pricingInfo = await resolveLessonPricing(form);
  const lessonBase = {
    child_name,
    lesson_date,
    start_time,
    end_time: start_time,
    instructor_name: inst.full_name,
    instructor_id: inst.id,
    parent_phone,
    price: pricingInfo.price,
    payment_status: pricingInfo.payment_status,
    lesson_format: pricingInfo.lesson_format,
    private_package_id: pricingInfo.private_package_id,
  };

  try {
    const participantId = await ensureLessonParticipant(parent_phone, child_name);
    if (participantId) lessonBase.participant_id = participantId;
  } catch (e) {
    return { error: e };
  }

  if (lesson_type === "recurring") {
    const day_of_week = dateToDayOfWeek(lesson_date);
    const { data: recurring, error: recErr } = await supabase.from("recurring_lessons")
      .insert([{
        child_name, day_of_week, start_time, parent_phone,
        instructor_name: inst.full_name, instructor_id: inst.id,
      }])
      .select().single();
    if (recErr) return { error: recErr };

    const { data, error } = await supabase.from("lessons")
      .insert([{ ...lessonBase, recurring_lesson_id: recurring.id }])
      .select().single();
    if (error) return { error };

    if (pricingInfo.private_package_id) {
      await consumePackageSession(pricingInfo.private_package_id);
    } else if (pricingInfo.participantId && pricingInfo.price != null && pricingInfo.payment_status === "paid") {
      await recordBillingPayment({
        participantId: pricingInfo.participantId,
        billingType: "private_lesson",
        amount: pricingInfo.price,
        paymentStatus: "paid",
        lessonId: data.id,
        productCode: pricingInfo.pricing?.product_code,
        tier: pricingInfo.pricing?.tier,
        priceListVersionId: pricingInfo.pricing?.price_list_version_id,
      });
    }

    return { data: { ...data, parent_phone, isRecurring: true } };
  }

  const { data, error } = await supabase.from("lessons")
    .insert([lessonBase])
    .select().single();
  if (error) return { error };

  if (pricingInfo.private_package_id) {
    await consumePackageSession(pricingInfo.private_package_id);
  } else if (pricingInfo.participantId && pricingInfo.price != null && pricingInfo.payment_status === "paid") {
    await recordBillingPayment({
      participantId: pricingInfo.participantId,
      billingType: "private_lesson",
      amount: pricingInfo.price,
      paymentStatus: "paid",
      lessonId: data.id,
      productCode: pricingInfo.pricing?.product_code,
      tier: pricingInfo.pricing?.tier,
      priceListVersionId: pricingInfo.pricing?.price_list_version_id,
    });
  }

  return { data: { ...data, parent_phone } };
}

export async function updateLesson({
  lesson,
  updates,
  scope = RECURRING_SCOPE.SINGLE,
  toast,
  i18n,
  phone,
}) {
  const parentPhone = phone || updates.parent_phone || lesson.parent_phone;
  const newDate = updates.lesson_date ?? lesson.lesson_date;
  const newTime = (updates.start_time ?? lesson.start_time)?.slice(0, 5);

  if (lesson.recurring_lesson_id && scope === RECURRING_SCOPE.SINGLE && newDate !== lesson.lesson_date) {
    const msg = i18n?.t?.("recurringSingleDateError") || "Cannot change date for a single occurrence";
    return { error: { message: msg } };
  }

  if (lesson.recurring_lesson_id && scope === RECURRING_SCOPE.FORWARD) {
    const day_of_week = dateToDayOfWeek(newDate);
    await supabase.from("recurring_lessons")
      .update({
        start_time: newTime,
        day_of_week,
        child_name: updates.child_name ?? lesson.child_name,
        parent_phone: parentPhone,
      })
      .eq("id", lesson.recurring_lesson_id);

    const future = await fetchFutureSeriesLessons(lesson.recurring_lesson_id, lesson.lesson_date);
    const updatedLessons = [];

    for (const l of future) {
      const lessonDate = l.id === lesson.id
        ? newDate
        : shiftDateByWeeks(lesson.lesson_date, newDate, l.lesson_date);

      const { data, error } = await supabase.from("lessons")
        .update({
          lesson_date: lessonDate,
          start_time: newTime,
          end_time: newTime,
          qr_token: crypto.randomUUID(),
          ...(updates.child_name ? { child_name: updates.child_name } : {}),
          ...(updates.parent_phone ? { parent_phone: updates.parent_phone } : {}),
        })
        .eq("id", l.id)
        .select()
        .single();
      if (error) return { error };
      updatedLessons.push(data);
    }

    for (const l of updatedLessons) {
      if (l.parent_phone) await notifyLessonUpdate(l, l.parent_phone, toast, i18n);
    }
    return { data: updatedLessons.find(l => l.id === lesson.id) || updatedLessons[0], updatedLessons };
  }

  const singleDate = lesson.recurring_lesson_id ? lesson.lesson_date : newDate;

  const { data, error } = await supabase.from("lessons")
    .update({
      child_name: updates.child_name ?? lesson.child_name,
      lesson_date: singleDate,
      start_time: newTime,
      end_time: newTime,
      parent_phone: parentPhone,
      qr_token: crypto.randomUUID(),
    })
    .eq("id", lesson.id)
    .select()
    .single();
  if (error) return { error };

  if (parentPhone) await notifyLessonUpdate(data, parentPhone, toast, i18n);
  return { data };
}

export async function cancelLesson({
  lesson,
  scope = RECURRING_SCOPE.SINGLE,
  phone,
  i18n,
}) {
  const now = new Date().toISOString();

  if (lesson.recurring_lesson_id && scope === RECURRING_SCOPE.FORWARD) {
    const future = await fetchFutureSeriesLessons(lesson.recurring_lesson_id, lesson.lesson_date);
    const cancelled = [];

    for (const l of future) {
      const { data, error } = await supabase.from("lessons")
        .update({
          cancelled: true,
          cancelled_at: now,
          ...(phone && l.id === lesson.id ? { parent_phone: phone } : {}),
        })
        .eq("id", l.id)
        .select()
        .single();
      if (error) return { error };
      cancelled.push(data);
      if (data.parent_phone) await notifyLessonCancel(data, data.parent_phone, i18n);
    }

    const { data: remaining } = await supabase.from("lessons").select("id")
      .eq("recurring_lesson_id", lesson.recurring_lesson_id)
      .eq("cancelled", false)
      .eq("used", false)
      .gte("lesson_date", lesson.lesson_date);
    if (!remaining?.length) {
      await supabase.from("recurring_lessons").update({ active: false }).eq("id", lesson.recurring_lesson_id);
    }
    return { data: cancelled.find(l => l.id === lesson.id), cancelled };
  }

  const { data, error } = await supabase.from("lessons")
    .update({
      cancelled: true,
      cancelled_at: now,
      ...(phone ? { parent_phone: phone } : {}),
    })
    .eq("id", lesson.id)
    .select()
    .single();
  if (error) return { error };

  const notifyPhone = phone || data.parent_phone;
  if (notifyPhone) await notifyLessonCancel(data, notifyPhone, i18n);
  return { data };
}

export async function createAndNotify({ profile, instructor, form, toast, i18n }) {
  const result = await createLesson({ profile, instructor, form });
  if (result.error) return result;
  if (result.data.parent_phone) {
    await notifyNewLesson(result.data, result.data.parent_phone, toast, i18n);
    await markLessonNotified(result.data.id);
  }
  return result;
}
