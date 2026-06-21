import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (!VERIFY_TOKEN) {
      return new Response("WHATSAPP_VERIFY_TOKEN secret is not set — add it in Edge Functions → Secrets, then redeploy", { status: 503 });
    }
    if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden — verify_token does not match WHATSAPP_VERIFY_TOKEN secret", { status: 403 });
  }

  if (req.method === "POST") {
    const body = await req.json();
    console.log("WhatsApp webhook:", JSON.stringify(body));
    return new Response("OK", { status: 200 });
  }

  return new Response("Method not allowed", { status: 405 });
});
