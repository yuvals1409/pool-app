import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GRAPH_API_VERSION = Deno.env.get("WHATSAPP_GRAPH_API_VERSION") ?? "v25.0";
const ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
const PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const SEND_SECRET = Deno.env.get("WHATSAPP_SEND_SECRET") ?? "";

type SendTemplateBody = {
  to: string;
  template: string;
  language?: string;
  components?: unknown[];
};

function normalizeIsraeliPhone(raw: string): string {
  const digits = String(raw).replace(/\D/g, "");
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  return digits;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function sendTemplateMessage(payload: SendTemplateBody) {
  if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
    throw new Error("WhatsApp API credentials are not configured");
  }

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalizeIsraeliPhone(payload.to),
        type: "template",
        template: {
          name: payload.template,
          language: { code: payload.language ?? "en_US" },
          ...(payload.components ? { components: payload.components } : {}),
        },
      }),
    },
  );

  const data = await res.json();
  if (!res.ok) {
    const metaMsg = data?.error?.message ?? `WhatsApp API error (${res.status})`;
    const metaCode = data?.error?.code;
    const metaType = data?.error?.type;
    const hint = metaMsg.includes("does not exist") || metaMsg.includes("permissions")
      ? " Regenerate Access Token in Meta → API Setup and copy Phone number ID from the same page."
      : "";
    throw new Error(
      [metaMsg, metaCode ? `code=${metaCode}` : "", metaType ? `type=${metaType}` : ""]
        .filter(Boolean)
        .join(" | ") + hint,
    );
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const auth = req.headers.get("Authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!SEND_SECRET || bearer !== SEND_SECRET) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const body = (await req.json()) as SendTemplateBody;
    if (!body?.to || !body?.template) {
      return jsonResponse({ error: "Missing to or template" }, 400);
    }

    const result = await sendTemplateMessage(body);
    return jsonResponse({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed";
    console.error("send-whatsapp:", message);
    return jsonResponse({ error: message }, 500);
  }
});
