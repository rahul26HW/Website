/* =====================================================================
   Home Weavers — Cloudflare Worker (free plan is enough)
   ---------------------------------------------------------------------
   Keeps every secret key OFF your public website. Routes:

     POST /ai        Claude text for the Marketing studio   (admins only)
     POST /image     AI images via OpenAI (optional)         (admins only)
     POST /welcome   Newsletter welcome email via Brevo (optional)
     POST /snipcart  Snipcart "order.completed" webhook → saves the order (optional)
     GET  /          Health check

   "Admins only" = the request must carry the signed-in admin's Supabase
   session, and that email must be in the admins table. Anyone else gets 401.

   ----- SECRETS (Worker → Settings → Variables and Secrets) -----
   Required for /ai:
     ANTHROPIC_API_KEY          your Anthropic key (console.anthropic.com)
     SUPABASE_URL               https://xxxx.supabase.co
     SUPABASE_PUBLISHABLE_KEY   sb_publishable_… (the public key from js/config.js)
   Optional:
     ALLOWED_ORIGINS            comma list, e.g. https://rahul26hw.github.io,http://localhost:8080
     OPENAI_API_KEY             enables /image
     SUPABASE_SERVICE_ROLE_KEY  needed by /welcome and /snipcart (secret key — never put it in the website)
     BREVO_API_KEY, FROM_EMAIL, FROM_NAME   enables /welcome
     SNIPCART_SECRET_KEY        enables /snipcart (validates each webhook with Snipcart)
     CLAUDE_EFFORT              low | medium | high (default medium)
   Full click-by-click setup: README.md → "AI worker".
   ===================================================================== */

const CLAUDE_MODEL = "claude-opus-5";
const DEFAULT_ORIGINS = ["https://rahul26hw.github.io", "http://localhost:8080"];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method === "GET" && url.pathname === "/") return json({ ok: true, service: "home-weavers-worker" }, 200, cors);
    if (request.method !== "POST") return json({ error: "Use POST" }, 405, cors);

    try {
      switch (url.pathname.replace(/\/+$/, "")) {
        case "/ai": return await handleAI(request, env, cors);
        case "/image": return await handleImage(request, env, cors);
        case "/welcome": return await handleWelcome(request, env, cors);
        case "/snipcart": return await handleSnipcart(request, env);
        default: return json({ error: "Not found" }, 404, cors);
      }
    } catch (e) {
      return json({ error: "Worker error: " + (e && e.message ? e.message : "unknown") }, 500, cors);
    }
  },
};

/* ---------------------------------------------------------------- *
 * Helpers
 * ---------------------------------------------------------------- */
function corsHeaders(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(",") : DEFAULT_ORIGINS).map((s) => s.trim()).filter(Boolean);
  const h = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  if (allowed.includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...extra } });
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > 200000) throw new Error("Request too large");
  try { return JSON.parse(text || "{}"); } catch { throw new Error("Invalid JSON"); }
}

/* Confirms the caller is a signed-in Home Weavers admin. */
async function requireAdmin(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return "Worker is missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY";
  const auth = request.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+/.test(auth)) return "Sign in to the admin first";
  const headers = { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: auth, "Content-Type": "application/json" };
  const user = await fetch(env.SUPABASE_URL + "/auth/v1/user", { headers });
  if (!user.ok) return "Your admin session expired — sign in again";
  const check = await fetch(env.SUPABASE_URL + "/rest/v1/rpc/is_admin", { method: "POST", headers, body: "{}" });
  if (!check.ok || (await check.json()) !== true) return "This account isn’t an admin";
  return null;
}

function serviceHeaders(env) {
  return { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY, "Content-Type": "application/json" };
}

/* ---------------------------------------------------------------- *
 * POST /ai  { system, prompt }  →  { text }
 * ---------------------------------------------------------------- */
async function handleAI(request, env, cors) {
  const denied = await requireAdmin(request, env);
  if (denied) return json({ error: denied }, 401, cors);
  if (!env.ANTHROPIC_API_KEY) return json({ error: "Worker is missing ANTHROPIC_API_KEY" }, 500, cors);

  const body = await readJson(request);
  const prompt = String(body.prompt || "").slice(0, 20000);
  const system = String(body.system || "").slice(0, 4000);
  if (!prompt) return json({ error: "Missing prompt" }, 400, cors);

  const effort = ["low", "medium", "high"].includes(env.CLAUDE_EFFORT) ? env.CLAUDE_EFFORT : "medium";
  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      // If Claude declines a request, retry it on Anthropic's recommended fallback model.
      "anthropic-beta": "server-side-fallback-2026-07-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      fallbacks: "default",
      output_config: { effort },
      system: system || undefined,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  let data;
  try { data = await upstream.json(); } catch { data = {}; }
  if (!upstream.ok) {
    const msg = (data && data.error && data.error.message) || ("Anthropic API error " + upstream.status);
    return json({ error: msg }, upstream.status === 401 ? 500 : upstream.status, cors);
  }
  if (data.stop_reason === "refusal") return json({ error: "The AI declined this request. Try rewording it." }, 422, cors);

  const text = (data.content || []).filter((b) => b && b.type === "text").map((b) => b.text).join("\n").trim();
  if (!text) return json({ error: data.stop_reason === "max_tokens" ? "The reply was too long — try a smaller request." : "Empty reply from the AI" }, 502, cors);
  return json({ text, stop_reason: data.stop_reason }, 200, cors);
}

/* ---------------------------------------------------------------- *
 * POST /image  { prompt, size }  →  { image: dataURL }
 * ---------------------------------------------------------------- */
async function handleImage(request, env, cors) {
  const denied = await requireAdmin(request, env);
  if (denied) return json({ error: denied }, 401, cors);
  if (!env.OPENAI_API_KEY) return json({ error: "Image generation isn’t set up (worker is missing OPENAI_API_KEY)" }, 501, cors);

  const body = await readJson(request);
  const prompt = String(body.prompt || "").slice(0, 4000);
  const size = ["1024x1024", "1536x1024", "1024x1536"].includes(body.size) ? body.size : "1024x1024";
  if (!prompt) return json({ error: "Missing prompt" }, 400, cors);

  const upstream = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + env.OPENAI_API_KEY },
    body: JSON.stringify({ model: "gpt-image-1", prompt, size, n: 1 }),
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) return json({ error: (data.error && data.error.message) || "Image API error" }, upstream.status, cors);
  const first = data.data && data.data[0];
  if (first && first.b64_json) return json({ image: "data:image/png;base64," + first.b64_json }, 200, cors);
  if (first && first.url) return json({ url: first.url }, 200, cors);
  return json({ error: "No image returned" }, 502, cors);
}

/* ---------------------------------------------------------------- *
 * POST /welcome  { email }  → sends the welcome code once, right after sign-up.
 * Only emails that subscribed in the last 10 minutes get a message, and the
 * code/offer come from your store data (never from the request).
 * ---------------------------------------------------------------- */
async function handleWelcome(request, env, cors) {
  if (!env.BREVO_API_KEY || !env.FROM_EMAIL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_URL) return json({ ok: false, error: "Welcome email isn’t set up" }, 501, cors);
  const body = await readJson(request);
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false }, 400, cors);

  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const q = env.SUPABASE_URL + "/rest/v1/subscribers?select=email,created_at&email=eq." + encodeURIComponent(email) + "&created_at=gte." + encodeURIComponent(since);
  const found = await fetch(q, { headers: serviceHeaders(env) }).then((r) => r.json()).catch(() => []);
  if (!Array.isArray(found) || !found.length) return json({ ok: true }, 200, cors); // quiet: nothing to send

  const store = await fetch(env.SUPABASE_URL + "/rest/v1/store?id=eq.main&select=data", { headers: serviceHeaders(env) }).then((r) => r.json()).catch(() => []);
  const data = (store[0] && store[0].data) || {};
  const brand = (data.brand && data.brand.name) || "Home Weavers";
  const code = String((data.newsletter && data.newsletter.couponCode) || "");
  const promo = (data.promos || []).find((p) => p.active && String(p.code).toUpperCase() === code.toUpperCase());
  const offer = promo ? (promo.type === "percent" ? promo.value + "% off" : "$" + promo.value + " off") : "";
  const site = (data.settings && data.settings.siteUrl) || "";

  const html = `<div style="font-family:Arial,sans-serif;color:#2A2622;max-width:520px;margin:auto;padding:24px">
    <h1 style="font-family:Georgia,serif;font-weight:400">Welcome to ${esc(brand)}</h1>
    <p>Thanks for joining our list. You’ll be first to see new arrivals.</p>
    ${promo ? `<p>Here’s <b>${esc(offer)}</b> your first order:</p><p style="font-size:22px;letter-spacing:2px;background:#EFEAE1;padding:12px 16px;display:inline-block"><b>${esc(promo.code)}</b></p>` : ""}
    ${site ? `<p><a href="${esc(site)}" style="color:#3A5A52">Shop now</a></p>` : ""}
    <p style="color:#6C6359;font-size:12px">You received this because you signed up at ${esc(brand)}.</p></div>`;

  const sent = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { email: env.FROM_EMAIL, name: env.FROM_NAME || brand },
      to: [{ email }],
      subject: promo ? `Your ${offer} code from ${brand}` : `Welcome to ${brand}`,
      htmlContent: html,
    }),
  });
  return json({ ok: sent.ok }, sent.ok ? 200 : 502, cors);
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------------------------------------------------------------- *
 * POST /snipcart — Snipcart webhook (Snipcart dashboard → Account → Webhooks).
 * Every call is checked with Snipcart before anything is saved.
 * ---------------------------------------------------------------- */
async function handleSnipcart(request, env) {
  if (!env.SNIPCART_SECRET_KEY || !env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_URL) return json({ error: "Snipcart webhook isn’t set up" }, 501);
  const token = request.headers.get("X-Snipcart-RequestToken");
  if (!token) return json({ error: "Missing request token" }, 401);
  const check = await fetch("https://app.snipcart.com/api/requestvalidation/" + encodeURIComponent(token), {
    headers: { Accept: "application/json", Authorization: "Basic " + btoa(env.SNIPCART_SECRET_KEY + ":") },
  });
  if (!check.ok) return json({ error: "Request could not be validated with Snipcart" }, 401);

  const body = await readJson(request);
  if (body.eventName !== "order.completed") return json({ ok: true, ignored: body.eventName || "unknown" });
  const o = body.content || {};
  const ship = o.shippingAddress || o.billingAddress || {};
  const number = "SC-" + String(o.invoiceNumber || o.token || Date.now()).replace(/[^A-Za-z0-9-]/g, "").slice(0, 30);

  const order = {
    order_number: number,
    email: String(o.email || "").toLowerCase(),
    name: ship.fullName || ship.name || (o.user && o.user.billingAddressName) || "Snipcart customer",
    phone: ship.phone || null,
    shipping_address: {
      line1: ship.address1 || "", line2: ship.address2 || "", city: ship.city || "",
      state: ship.province || "", zip: ship.postalCode || "", country: ship.country || "",
    },
    subtotal: Number(o.subtotal || o.itemsTotal || 0),
    discount: Number(o.discountsTotal || o.rebateAmount || 0),
    shipping: Number(o.shippingFees || 0),
    tax: Number(o.taxesTotal || o.totalTaxes || 0),
    total: Number(o.grandTotal || o.finalGrandTotal || o.total || 0),
    currency: String(o.currency || "usd").toLowerCase(),
    promo_code: (o.discounts && o.discounts[0] && o.discounts[0].code) || null,
    status: "new",
    payment_status: "paid",
    source: "snipcart",
    external_id: String(o.token || number),
  };

  const ins = await fetch(env.SUPABASE_URL + "/rest/v1/orders?on_conflict=external_id", {
    method: "POST",
    headers: { ...serviceHeaders(env), Prefer: "return=representation,resolution=ignore-duplicates" },
    body: JSON.stringify(order),
  });
  const rows = await ins.json().catch(() => []);
  if (!ins.ok) return json({ error: "Could not save order", detail: rows }, 500);
  if (!Array.isArray(rows) || !rows.length) return json({ ok: true, duplicate: true });

  const items = (o.items || []).map((i) => ({
    order_id: rows[0].id,
    product_id: null,
    sku: String(i.id || ""),
    name: String(i.name || "Item"),
    variant: (i.customFields || []).map((f) => f.value).filter(Boolean).join(" / ") || null,
    unit_price: Number(i.price || 0),
    qty: Math.max(1, Number(i.quantity || 1)),
    line_total: Number(i.totalPrice || (Number(i.price || 0) * Number(i.quantity || 1))),
    image: i.image || null,
  }));
  if (items.length) {
    await fetch(env.SUPABASE_URL + "/rest/v1/order_items", { method: "POST", headers: { ...serviceHeaders(env), Prefer: "return=minimal" }, body: JSON.stringify(items) });
  }
  return json({ ok: true, order: number });
}
