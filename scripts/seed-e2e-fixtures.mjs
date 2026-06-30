#!/usr/bin/env node
/**
 * Seed deterministic Supabase fixtures for Playwright E2E.
 *
 * Usage: npm run seed:e2e
 * Requires SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

loadEnv();

const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

const E2E_SEARCH_PHONE = process.env.E2E_SEARCH_PHONE || "0501111999";
const E2E_QR_TOKEN = process.env.E2E_QR_TOKEN || "e2e00001-0000-4000-8000-000000000001";
const E2E_LESSON_ID = process.env.E2E_LESSON_ID || "e2e00002-0000-4000-8000-000000000002";
const E2E_PASS_TOKEN = process.env.E2E_PASS_TOKEN || "e2e00003-0000-4000-8000-000000000003";
const E2E_PASS_QR_TOKEN = process.env.E2E_PASS_QR_TOKEN || "e2e00004-0000-4000-8000-000000000004";

if (!supabaseUrl || !serviceKey) {
  console.error("Missing SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY");
  console.error(`  SUPABASE_URL/VITE_SUPABASE_URL: ${supabaseUrl ? "set" : "MISSING"}`);
  console.error(`  SUPABASE_SERVICE_ROLE_KEY: ${serviceKey ? "set" : "MISSING"}`);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function todayLocal() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function currentStartTime() {
  const d = new Date();
  // Postgres combines lesson_date::timestamptz + start_time in UTC — align with NOW().
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:00`;
}

async function getInstructorProfile() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("email", "demo.instructor@demo.streamline")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("demo.instructor@demo.streamline not found — run npm run seed:demo first");
  return data;
}

async function upsertFamilyAndParticipant() {
  let familyId;
  const { data: existingFamily } = await supabase
    .from("families")
    .select("id")
    .eq("phone", E2E_SEARCH_PHONE)
    .maybeSingle();

  if (existingFamily?.id) {
    familyId = existingFamily.id;
    await supabase.from("families").update({ parent_name: "הורה E2E" }).eq("id", familyId);
  } else {
    const { data, error } = await supabase
      .from("families")
      .insert({ phone: E2E_SEARCH_PHONE, parent_name: "הורה E2E" })
      .select("id")
      .single();
    if (error) throw error;
    familyId = data.id;
  }

  let participantId;
  const { data: existingParticipant } = await supabase
    .from("participants")
    .select("id")
    .eq("family_id", familyId)
    .ilike("full_name", "ילד E2E")
    .maybeSingle();

  if (existingParticipant?.id) {
    participantId = existingParticipant.id;
  } else {
    const { data, error } = await supabase
      .from("participants")
      .insert({
        family_id: familyId,
        full_name: "ילד E2E",
        gender: "male",
      })
      .select("id")
      .single();
    if (error) throw error;
    participantId = data.id;
  }

  return { familyId, participantId };
}

async function upsertLesson(instructor, participantId) {
  const lessonDate = todayLocal();
  const startTime = currentStartTime();
  const payload = {
    id: E2E_LESSON_ID,
    qr_token: E2E_QR_TOKEN,
    child_name: "ילד E2E",
    lesson_date: lessonDate,
    start_time: startTime,
    end_time: startTime,
    instructor_id: instructor.id,
    instructor_name: instructor.full_name,
    parent_phone: E2E_SEARCH_PHONE,
    payment_status: "paid",
    used: false,
    used_at: null,
    cancelled: false,
    participant_id: participantId,
    price: 0,
    lesson_format: "single",
  };

  const { error } = await supabase.from("lessons").upsert(payload, { onConflict: "id" });
  if (error) throw error;
}

async function ensureEnrollment(participantId) {
  const { data: existing } = await supabase
    .from("enrollments")
    .select("id, product_id")
    .eq("participant_id", participantId)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from("enrollments")
      .update({ payment_status: "paid", valid_until: "2099-12-31" })
      .eq("id", existing.id);
    return existing;
  }

  const { data: season } = await supabase
    .from("seasons")
    .select("id")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (!season?.id) {
    console.warn("No active season — skipping enrollment/access_pass fixtures");
    return null;
  }

  let productId;
  const { data: product } = await supabase
    .from("products")
    .select("id")
    .eq("season_id", season.id)
    .limit(1)
    .maybeSingle();

  if (product?.id) {
    productId = product.id;
  } else {
    const { data: created, error } = await supabase
      .from("products")
      .insert({
        season_id: season.id,
        name: "E2E חוג",
        instructor_name: "מדריך E2E",
        day_of_week: new Date().getDay(),
        start_time: "16:00:00",
        end_time: "16:30:00",
        target_audience: "גילאי 6-8",
        gender: "mixed",
      })
      .select("id")
      .single();
    if (error) throw error;
    productId = created.id;
  }

  const { data: enrollment, error } = await supabase
    .from("enrollments")
    .insert({
      product_id: productId,
      participant_id: participantId,
      payment_status: "paid",
      valid_from: todayLocal(),
      valid_until: "2099-12-31",
      active: true,
    })
    .select("id, product_id")
    .single();
  if (error) throw error;
  return enrollment;
}

async function upsertAccessPass(enrollment, participantId) {
  if (!enrollment) return;

  const sessionDate = todayLocal();
  const startTime = currentStartTime();
  const endTime = "23:59:00";

  let sessionId;
  const { data: existingSession } = await supabase
    .from("scheduled_sessions")
    .select("id")
    .eq("product_id", enrollment.product_id)
    .eq("session_date", sessionDate)
    .limit(1)
    .maybeSingle();

  if (existingSession?.id) {
    sessionId = existingSession.id;
    await supabase
      .from("scheduled_sessions")
      .update({ start_time: startTime, end_time: endTime, status: "scheduled" })
      .eq("id", sessionId);
  } else {
    const { data, error } = await supabase
      .from("scheduled_sessions")
      .insert({
        product_id: enrollment.product_id,
        session_date: sessionDate,
        start_time: startTime,
        end_time: endTime,
        status: "scheduled",
      })
      .select("id")
      .single();
    if (error) throw error;
    sessionId = data.id;
  }

  const validFrom = new Date(`${sessionDate}T${startTime}`).toISOString();
  const validUntil = new Date(`${sessionDate}T${endTime}`).toISOString();

  const { data: existingPass } = await supabase
    .from("access_passes")
    .select("id")
    .eq("enrollment_id", enrollment.id)
    .eq("session_id", sessionId)
    .maybeSingle();

  const passPayload = {
    session_id: sessionId,
    enrollment_id: enrollment.id,
    participant_id: participantId,
    public_token: E2E_PASS_TOKEN,
    qr_token: E2E_PASS_QR_TOKEN,
    status: "active",
    valid_from: validFrom,
    valid_until: validUntil,
    used_at: null,
  };

  if (existingPass?.id) {
    const { error } = await supabase.from("access_passes").update(passPayload).eq("id", existingPass.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("access_passes").insert(passPayload);
    if (error) throw error;
  }
}

async function main() {
  console.log("Seeding E2E fixtures...\n");
  const instructor = await getInstructorProfile();
  const { participantId } = await upsertFamilyAndParticipant();
  await upsertLesson(instructor, participantId);
  const enrollment = await ensureEnrollment(participantId);
  await upsertAccessPass(enrollment, participantId);

  console.log("Done. Add to .env / GitHub Secrets:\n");
  console.log(`E2E_SEARCH_PHONE=${E2E_SEARCH_PHONE}`);
  console.log(`E2E_QR_TOKEN=${E2E_QR_TOKEN}`);
  console.log(`E2E_LESSON_ID=${E2E_LESSON_ID}`);
  console.log(`E2E_PASS_TOKEN=${E2E_PASS_TOKEN}`);
  console.log(`E2E_PASS_QR_TOKEN=${E2E_PASS_QR_TOKEN}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
