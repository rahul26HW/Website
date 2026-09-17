/* =====================================================================
   Home Weavers — Cloudflare Worker (free plan is enough)
   ---------------------------------------------------------------------
   Keeps every secret key OFF your public website. Routes:

     POST /ai        Claude text for the Marketing studio   (admins only)
     POST /image     AI images via OpenAI (optional)         (admins only)
     POST /welcome   Newsletter welcome email via Brevo (optional)
     POST /snipcart  Snipcart "order.completed" webhook → saves the order (optional)
     POST /checkout/session     Stripe Checkout page for a placed order (shoppers)
     POST /stripe               Stripe webhook → marks the order paid, sends it to ShipStation
     POST /shipstation/push     Send one order to ShipStation again           (admins only)
     POST /shipstation/setup    Register the "order shipped" webhook          (admins only)
     POST /shipstation/webhook  ShipStation SHIP_NOTIFY → saves carrier + tracking number
     GET  /          Health check (lists which features are set up — never the keys)

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
   Card payments (Stripe) — also need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY:
     STRIPE_SECRET_KEY          sk_test_… / sk_live_… (Stripe → Developers → API keys)
     STRIPE_WEBHOOK_SECRET      whsec_… (Stripe → Developers → Webhooks → your endpoint)
   ShipStation (API v1) — also need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY:
     SHIPSTATION_API_KEY, SHIPSTATION_API_SECRET   (ShipStation → Settings → Account → API Settings)
     SHIPSTATION_WEBHOOK_TOKEN  any long random text; it proves shipment calls come from your ShipStation webhook
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
    if (request.method === "GET" && url.pathname === "/") return json({ ok: true, service: "home-weavers-worker", features: features(env) }, 200, cors);
    if (request.method !== "POST") return json({ error: "Use POST" }, 405, cors);

    try {
      switch (url.pathname.replace(/\/+$/, "")) {
        case "/ai": return await handleAI(request, env, cors);
        case "/image": return await handleImage(request, env, cors);
        case "/welcome": return await handleWelcome(request, env, cors);
        case "/snipcart": return await handleSnipcart(request, env);
        case "/checkout/session": return await handleCheckoutSession(request, env, cors);
        case "/stripe": return await handleStripeWebhook(request, env);
        case "/shipstation/push": return await handleShipstationPush(request, env, cors);
        case "/shipstation/setup": return await handleShipstationSetup(request, env, cors);
        case "/shipstation/webhook": return await handleShipstationWebhook(request, env);
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

/* ================================================================ *
 * Payments (Stripe Checkout) and shipping (ShipStation API v1)
 * ================================================================ */
function features(env) {
  const db = !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
  const ss = !!(db && env.SHIPSTATION_API_KEY && env.SHIPSTATION_API_SECRET);
  return {
    ai: !!(env.ANTHROPIC_API_KEY && env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY),
    stripe: !!(db && env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET),
    stripeMode: env.STRIPE_SECRET_KEY ? (/^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY) ? "live" : "test") : null,
    shipstation: ss,
    shipstationWebhook: !!(ss && env.SHIPSTATION_WEBHOOK_TOKEN),
  };
}

const cents = (n) => Math.round(Number(n || 0) * 100);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* Compares secrets without leaking timing. */
function safeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function db(env, path, init = {}) {
  const res = await fetch(env.SUPABASE_URL + "/rest/v1/" + path, { ...init, headers: { ...serviceHeaders(env), ...(init.headers || {}) } });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error("Database error " + res.status + ": " + String((data && data.message) || text).slice(0, 200));
  return data;
}

async function loadOrder(env, filter) {
  const rows = await db(env, "orders?" + filter + "&select=*,order_items(*)&limit=1");
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function patchOrder(env, filter, patch) {
  return db(env, "orders?" + filter, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
}

async function siteUrl(env) {
  const rows = await db(env, "store?id=eq.main&select=data");
  const s = String((rows && rows[0] && rows[0].data && rows[0].data.settings && rows[0].data.settings.siteUrl) || "").trim();
  if (!/^https:\/\//.test(s)) throw new Error("Set “Live site address” in Admin › Storefront first");
  return s.replace(/\/?$/, "/");
}

/* Stripe takes form encoding: a[b][0][c]=1 */
function formEncode(obj, prefix, out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") formEncode(v, key, out);
    else out.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(v)));
  }
  return out.join("&");
}

async function stripe(env, path, params, idempotencyKey) {
  const headers = { Authorization: "Bearer " + env.STRIPE_SECRET_KEY, "Content-Type": "application/x-www-form-urlencoded" };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch("https://api.stripe.com/v1/" + path, { method: "POST", headers, body: formEncode(params) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.error && data.error.message) || "Stripe error " + res.status);
  return data;
}

/* ---------------------------------------------------------------- *
 * POST /checkout/session  { order_number, pay_token }  →  { url }
 * Amounts come from the saved order (already priced by place_order), never from the request.
 * ---------------------------------------------------------------- */
async function handleCheckoutSession(request, env, cors) {
  if (!features(env).stripe) return json({ error: "Card payments aren’t set up yet." }, 501, cors);
  const body = await readJson(request);
  const number = String(body.order_number || "").trim().toUpperCase();
  const token = String(body.pay_token || "").trim();
  if (!/^[A-Z]{2,4}-\d{1,12}$/.test(number) || !UUID.test(token)) return json({ error: "Order not found" }, 404, cors);

  const order = await loadOrder(env, "order_number=eq." + encodeURIComponent(number));
  if (!order || !safeEqual(order.pay_token, token)) return json({ error: "Order not found" }, 404, cors);
  if (order.payment_status === "paid") return json({ error: "This order is already paid.", paid: true }, 409, cors);
  if (order.status !== "new" || order.payment_status !== "unpaid") return json({ error: "This order can’t be paid online. Please contact us." }, 409, cors);
  if (Date.now() - new Date(order.created_at).getTime() > 7 * 24 * 3600 * 1000) return json({ error: "This order is too old to pay online. Please place it again." }, 409, cors);

  const items = order.order_items || [];
  if (!items.length || items.reduce((s, i) => s + cents(i.unit_price) * i.qty, 0) !== cents(order.subtotal)) {
    return json({ error: "This order’s total doesn’t add up. Please contact us." }, 409, cors);
  }
  const site = await siteUrl(env);
  const orderPage = site + "order/" + encodeURIComponent(order.order_number);
  const currency = order.currency || "usd";

  const params = {
    mode: "payment",
    customer_email: order.email,
    client_reference_id: order.order_number,
    success_url: orderPage + "?payment=success",
    cancel_url: orderPage + "?payment=cancelled",
    expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
    metadata: { order_id: order.id, order_number: order.order_number },
    payment_intent_data: { description: "Order " + order.order_number, metadata: { order_id: order.id, order_number: order.order_number } },
    line_items: items.map((i) => ({
      quantity: i.qty,
      price_data: {
        currency,
        unit_amount: cents(i.unit_price),
        product_data: {
          name: (String(i.name) + (i.variant ? " — " + i.variant : "")).slice(0, 250),
          images: /^https:\/\//.test(i.image || "") ? [i.image] : undefined,
          metadata: { sku: i.sku || "" },
        },
      },
    })),
    shipping_options: [{
      shipping_rate_data: {
        type: "fixed_amount",
        display_name: cents(order.shipping) ? "Standard shipping" : "Free shipping",
        fixed_amount: { amount: cents(order.shipping), currency },
      },
    }],
  };
  if (cents(order.discount) > 0) {
    // A one-use coupon for exactly the discount place_order worked out.
    const coupon = await stripe(env, "coupons", {
      amount_off: cents(order.discount), currency, duration: "once", max_redemptions: 1,
      name: ("Discount " + (order.promo_code || "")).trim().slice(0, 40),
    }, "coupon-" + order.id);
    params.discounts = [{ coupon: coupon.id }];
  }

  const session = await stripe(env, "checkout/sessions", params);
  await patchOrder(env, "id=eq." + order.id + "&payment_status=eq.unpaid", { payment_ref: session.id });
  return json({ url: session.url }, 200, cors);
}

/* Stripe-Signature: t=…,v1=… — HMAC-SHA256 of "t.body" with the webhook secret, at most 5 minutes old. */
async function verifyStripe(env, header, payload) {
  const parts = {};
  String(header || "").split(",").forEach((p) => { const i = p.indexOf("="); if (i > 0) (parts[p.slice(0, i)] = parts[p.slice(0, i)] || []).push(p.slice(i + 1)); });
  const t = parts.t && parts.t[0];
  if (!t || !parts.v1 || !(Math.abs(Date.now() / 1000 - Number(t)) <= 300)) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(t + "." + payload));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return parts.v1.some((v) => safeEqual(v, hex));
}

/* ---------------------------------------------------------------- *
 * POST /stripe — Stripe webhook. Events: checkout.session.completed,
 * checkout.session.async_payment_succeeded, checkout.session.expired, charge.refunded
 * ---------------------------------------------------------------- */
async function handleStripeWebhook(request, env) {
  if (!features(env).stripe) return json({ error: "Stripe isn’t set up" }, 501);
  const payload = await request.text();
  if (!(await verifyStripe(env, request.headers.get("Stripe-Signature"), payload))) return json({ error: "Bad signature" }, 400);
  const event = JSON.parse(payload);
  const obj = (event.data && event.data.object) || {};
  const orderId = obj.metadata && obj.metadata.order_id;

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    if (obj.payment_status !== "paid") return json({ ok: true, waiting: obj.payment_status });
    if (!UUID.test(orderId || "")) return json({ ok: true, ignored: "no order" });
    const order = await loadOrder(env, "id=eq." + orderId);
    if (!order) return json({ ok: true, ignored: "order missing" });
    if (order.payment_status !== "paid") {
      const mismatch = obj.amount_total !== cents(order.total);
      const rows = await patchOrder(env, "id=eq." + orderId + "&payment_status=neq.paid", {
        payment_status: "paid",
        paid_at: new Date().toISOString(),
        payment_ref: obj.payment_intent || obj.id,
        payment_livemode: !!obj.livemode,
        status: order.status === "cancelled" ? "new" : order.status,
        admin_note: mismatch
          ? (order.admin_note ? order.admin_note + "\n" : "") + "⚠ Stripe charged $" + (obj.amount_total / 100).toFixed(2) + " but the order total is $" + Number(order.total).toFixed(2) + ". Check before shipping."
          : order.admin_note,
      });
      if (Array.isArray(rows) && rows[0]) Object.assign(order, rows[0]);
    }
    // A ShipStation problem is saved on the order (shipstation_error) and must not make Stripe retry the payment event.
    if (features(env).shipstation && !order.shipstation_order_id) await pushToShipstation(env, order).catch(() => {});
    return json({ ok: true });
  }

  if (event.type === "checkout.session.expired") {
    if (!UUID.test(orderId || "")) return json({ ok: true });
    // Only the latest payment attempt cancels the order; its promo code becomes usable again.
    const rows = await patchOrder(env, "id=eq." + orderId + "&payment_status=eq.unpaid&status=eq.new&payment_ref=eq." + encodeURIComponent(obj.id), { status: "cancelled" });
    const cancelled = Array.isArray(rows) && rows.length > 0;
    if (cancelled) await db(env, "promo_redemptions?order_id=eq." + orderId, { method: "DELETE" });
    return json({ ok: true, cancelled });
  }

  if (event.type === "charge.refunded" && obj.payment_intent && obj.refunded) {
    await patchOrder(env, "payment_ref=eq." + encodeURIComponent(obj.payment_intent), { payment_status: "refunded" });
    return json({ ok: true });
  }
  return json({ ok: true, ignored: event.type });
}

/* ---------------------------------------------------------------- *
 * ShipStation (API v1)
 * ---------------------------------------------------------------- */
async function shipstation(env, path, init = {}) {
  const res = await fetch(/^https:\/\//.test(path) ? path : "https://ssapi.shipstation.com/" + path, {
    ...init,
    headers: { Authorization: "Basic " + btoa(env.SHIPSTATION_API_KEY + ":" + env.SHIPSTATION_API_SECRET), "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error("ShipStation " + res.status + ": " + String((data && (data.ExceptionMessage || data.Message || data.message)) || text || res.statusText).slice(0, 200));
  return data;
}

function shipstationOrder(order) {
  const a = order.shipping_address || {};
  const paid = order.payment_status === "paid";
  const items = (order.order_items || []).map((i) => ({
    lineItemKey: i.id,
    sku: i.sku || undefined,
    name: String(i.name || "Item").slice(0, 200),
    imageUrl: /^https:\/\//.test(i.image || "") ? i.image : undefined,
    quantity: i.qty,
    unitPrice: Number(i.unit_price),
    options: i.variant ? [{ name: "Option", value: i.variant }] : [],
  }));
  if (Number(order.discount) > 0) {
    items.push({ lineItemKey: "discount", name: "Discount" + (order.promo_code ? " (" + order.promo_code + ")" : ""), quantity: 1, unitPrice: -Number(order.discount), adjustment: true });
  }
  return {
    orderNumber: order.order_number,
    orderKey: order.id, // ShipStation updates the same order when this is sent again
    orderDate: order.created_at,
    paymentDate: order.paid_at || undefined,
    orderStatus: paid ? "awaiting_shipment" : "awaiting_payment",
    customerUsername: order.email,
    customerEmail: order.email,
    billTo: { name: order.name },
    shipTo: {
      name: order.name, street1: a.line1 || "", street2: a.line2 || "", city: a.city || "", state: a.state || "",
      postalCode: a.zip || "", country: String(a.country || "US").slice(0, 2).toUpperCase(), phone: order.phone || "", residential: true,
    },
    items,
    amountPaid: paid ? Number(order.total) : 0,
    taxAmount: Number(order.tax || 0),
    shippingAmount: Number(order.shipping || 0),
    customerNotes: order.customer_note || undefined,
    internalNotes: order.admin_note || undefined,
    advancedOptions: { source: "Home Weavers website" },
  };
}

async function pushToShipstation(env, order) {
  try {
    const res = await shipstation(env, "orders/createorder", { method: "POST", body: JSON.stringify(shipstationOrder(order)) });
    const patch = { shipstation_order_id: String(res.orderId), shipstation_synced_at: new Date().toISOString(), shipstation_error: null };
    await patchOrder(env, "id=eq." + order.id, patch);
    return { ok: true, ...patch };
  } catch (e) {
    await patchOrder(env, "id=eq." + order.id, { shipstation_error: String(e.message).slice(0, 500) }).catch(() => {});
    throw e;
  }
}

/* POST /shipstation/push { order_id } — admins only */
async function handleShipstationPush(request, env, cors) {
  const denied = await requireAdmin(request, env);
  if (denied) return json({ error: denied }, 401, cors);
  if (!features(env).shipstation) return json({ error: "ShipStation isn’t set up in the worker." }, 501, cors);
  const body = await readJson(request);
  if (!UUID.test(body.order_id || "")) return json({ error: "Missing order" }, 400, cors);
  const order = await loadOrder(env, "id=eq." + body.order_id);
  if (!order) return json({ error: "Order not found" }, 404, cors);
  if (order.status === "cancelled") return json({ error: "This order is cancelled." }, 409, cors);
  try { return json(await pushToShipstation(env, order), 200, cors); }
  catch (e) { return json({ error: e.message }, 502, cors); }
}

/* POST /shipstation/setup — admins only. Points ShipStation's SHIP_NOTIFY webhook at this worker (once). */
async function handleShipstationSetup(request, env, cors) {
  const denied = await requireAdmin(request, env);
  if (denied) return json({ error: denied }, 401, cors);
  if (!features(env).shipstationWebhook) return json({ error: "Add SHIPSTATION_API_KEY, SHIPSTATION_API_SECRET and SHIPSTATION_WEBHOOK_TOKEN to the worker first." }, 501, cors);
  const base = new URL(request.url).origin + "/shipstation/webhook";
  const target = base + "?token=" + encodeURIComponent(env.SHIPSTATION_WEBHOOK_TOKEN);
  const list = await shipstation(env, "webhooks");
  const hooks = ((list && list.webhooks) || []).filter((h) => String(h.Url || h.url || "").split("?")[0] === base);
  if (hooks.some((h) => (h.Url || h.url) === target && (h.HookType || h.hookType) === "SHIP_NOTIFY")) return json({ ok: true, already: true }, 200, cors);
  for (const h of hooks) await shipstation(env, "webhooks/" + (h.WebHookID || h.webHookId), { method: "DELETE" }).catch(() => {}); // e.g. an old token
  const res = await shipstation(env, "webhooks/subscribe", { method: "POST", body: JSON.stringify({ target_url: target, event: "SHIP_NOTIFY", store_id: null, friendly_name: "Home Weavers tracking" }) });
  return json({ ok: true, id: res && res.id }, 200, cors);
}

const CARRIERS = { stamps_com: "USPS", usps: "USPS", endicia: "USPS", ups: "UPS", ups_walleted: "UPS", fedex: "FedEx", fedex_walleted: "FedEx", dhl_express: "DHL", dhl_express_worldwide: "DHL", ontrac: "OnTrac" };

/* POST /shipstation/webhook?token=… — ShipStation SHIP_NOTIFY: { resource_url, resource_type } */
async function handleShipstationWebhook(request, env) {
  if (!features(env).shipstationWebhook) return json({ error: "Not set up" }, 501);
  const token = new URL(request.url).searchParams.get("token") || "";
  if (!safeEqual(token, env.SHIPSTATION_WEBHOOK_TOKEN)) return json({ error: "Forbidden" }, 403);
  const body = await readJson(request);
  if (body.resource_type !== "SHIP_NOTIFY") return json({ ok: true, ignored: body.resource_type || "unknown" });
  let resource;
  try { resource = new URL(String(body.resource_url || "")); } catch { return json({ error: "Bad resource_url" }, 400); }
  // The ShipStation key goes with this request, so only ever call ShipStation itself.
  if (resource.protocol !== "https:" || resource.hostname !== "ssapi.shipstation.com") return json({ error: "Bad resource_url" }, 400);

  let updated = 0, page = 1, pages = 1;
  do {
    resource.searchParams.set("page", String(page));
    const data = await shipstation(env, resource.toString());
    pages = Math.min(Number(data && data.pages) || 1, 20);
    for (const s of (data && data.shipments) || []) {
      if (s.voided || !UUID.test(s.orderKey || "") || !s.trackingNumber) continue;
      const rows = await patchOrder(env, "id=eq." + s.orderKey + "&status=in.(new,packed,shipped)", {
        status: "shipped",
        carrier: CARRIERS[s.carrierCode] || String(s.carrierCode || "").toUpperCase() || null,
        tracking_number: String(s.trackingNumber).slice(0, 100),
        shipped_at: s.shipDate ? new Date(s.shipDate).toISOString() : new Date().toISOString(),
      });
      updated += Array.isArray(rows) ? rows.length : 0;
    }
    page++;
  } while (page <= pages);
  return json({ ok: true, updated });
}
