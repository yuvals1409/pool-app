import { supabase } from "./supabase.js";

export async function suggestPaymentAmount({
  participantId,
  billingType,
  enrollmentId = null,
  billingMonth = null,
  asOf = null,
}) {
  const { data, error } = await supabase.rpc("suggest_payment_amount", {
    p_participant_id: participantId,
    p_billing_type: billingType,
    p_enrollment_id: enrollmentId,
    p_billing_month: billingMonth,
    p_as_of: asOf || new Date().toISOString().slice(0, 10),
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function recordBillingPayment({
  participantId,
  billingType,
  amount,
  paymentStatus,
  enrollmentId = null,
  billingMonth = null,
  seasonId = null,
  productCode = null,
  tier = null,
  siblingDiscountPct = 0,
  priceListVersionId = null,
  privatePackageId = null,
  lessonId = null,
  notes = null,
}) {
  const { data, error } = await supabase.rpc("record_billing_payment", {
    p_participant_id: participantId,
    p_billing_type: billingType,
    p_amount: Number(amount),
    p_payment_status: paymentStatus,
    p_enrollment_id: enrollmentId,
    p_billing_month: billingMonth,
    p_season_id: seasonId,
    p_product_code: productCode,
    p_tier: tier,
    p_sibling_discount_pct: siblingDiscountPct,
    p_price_list_version_id: priceListVersionId,
    p_private_package_id: privatePackageId,
    p_lesson_id: lessonId,
    p_notes: notes,
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export function billingTypeForTemplate(templateCode) {
  if (templateCode === "summer_course") return "swim_course";
  if (templateCode === "annual_section") return "annual_monthly";
  if (templateCode === "adult_style_improvement") return "annual_monthly";
  return null;
}
