# Changelog — Home Weavers rebuild

## 2026-09-22 — Order emails from the admin, and un-shipping

- **Cancelling, refunding or shipping an order from the admin now emails the customer.** A status changed in the admin went straight to the database, so the mail server never knew and the customer heard nothing. New admins-only `/orders/notify` route; the admin calls it and reports whether the email went.
- **A voided label in ShipStation puts the order back here**: status returns to Accepted, carrier, tracking number and ship date are cleared, and a private note says why. The webhook handles it, "Check ShipStation again" does it on demand, and the Orders screen re-checks recently shipped orders by itself.
- Cancelling an order has its own button, and the status list offers only the moves an order can actually make.

## 2026-09-22 — Stock keeps itself, and real analytics

- **Stock has its own table** (`public.stock`) instead of living inside the store record. An order takes its items off the shelf as it is placed; a cancelled or refunded order puts them back, through a database trigger, so it happens however the order is cancelled (customer, admin, Stripe or the scheduled job). The admin saves only the counts it actually changed, so a sale during an editing session is never undone. The "Deduct items from inventory" button is gone — there is nothing left to do by hand.
- **Analytics, measured on our own server**: visits, product views, product cards seen and clicked, add to cart, checkout reached, where the visit came from (utm tags, Google Ads and Facebook click ids, or the linking site) and phone/tablet/computer. Orders remember the source, so revenue can be set against it. No Google Analytics, no advertising cookies, no third-party script: the visit number is random, lives in one browser tab and is deleted with it, and the figures are kept for six months.
- Admin → Overview → **Analytics** shows all of it, with a range of 7, 30 or 90 days.
- The Privacy Policy and the cookie banner explain the counting.
- **Orders screen keeps itself up to date** (every 45 seconds while open, and when the window comes back), so ShipStation tracking appears without a manual refresh, with a quiet catch-up call if a webhook is ever missed.

## 2026-09-21 — CSV import: rename instead of duplicate

- The product CSV matched colors and sizes **by name**, so an edited name read as a new color: the old one stayed and a copy was added (Glamour ended up with both "Green (new)" and "Green"). The import now recognises the color and size a **SKU** already belongs to and renames those.
- A rename that would leave two colors (or sizes) with the same name is refused with a clear message, and duplicate names are reported.
- Image links with a space in the filename are encoded instead of rejected (two Dropbox photos were being skipped).
- Catalog: the 7 duplicate colors that the old import created were merged back, keeping the name that was wanted (Green, Navy, Brown).

## 2026-09-21 — QA re-audit fixes

- **Cash on delivery limit** is shown in the cart and on checkout, and blocks before the address is typed; the message no longer suggests paying by card while Stripe is off.
- **Phone** is required and checked (10 digits), so the courier has a number that works.
- **Quantity** per line is capped at 10 while stock is untracked, with wording that matches.
- **Policy pages** take {{payment_terms}}, {{tax_terms}}, {{cod_limit}}, {{cancel_minutes}}, {{free_shipping}} and {{flat_rate}}, so the Terms can no longer contradict the payment, tax and shipping settings. Terms, Privacy Policy and Shipping & returns rewritten to use them.
- **Cash-on-delivery guidance** (have the amount ready, someone over 18 at the address) on the confirmation, the tracking page, the shipping page and the order email.
- **Privacy Policy and cookie banner** describe Google sign-in loading Google's script on the sign-in page.
- A **small image that fails to load** falls back to the full photo instead of leaving an empty box.
- **SKU and UPC** are shown in the buy box.
- **Old product addresses** get their own page files, so an indexed link no longer answers 404 before the redirect.
- **Price: high to low** sorts by the highest variant price; a Type filter with a single value is hidden.
- **Search** finds rug sizes again (the normaliser was joining "17x24 18x18" into one word).
- **Info pages** have their own SEO titles and descriptions.
- **Admin:** sales tax moved from Promotions to Storefront; "Deduct items from inventory" hidden and blocked on cancelled or refunded orders; order address and phone formatting fixed.
- **Data:** 4,988 empty photo slots removed from the catalog; small images completed for all 4,238 photos.

## Live verification (signed in as admin)

- Real saves reach the database, and each one publishes the CDN copy of the store.
- **Fixed:** an out-of-date save used error code 40001, which the Supabase API retries automatically, so it looped
  instead of failing. It now uses `PT409` (HTTP 409), and the admin shows "Someone else changed the store — reload first" at once.
  Updated in `supabase-setup.sql` and on the live project.
- Marketing results auto-save to `store_private` and can be deleted.
- **Move images to Storage:** 444 images copied with 0 failures. The live store has 0 Dropbox links, and photos are about 250 KB WebP instead of 0.7–1.1 MB.

## After launch

### Rugs, accessories, curtain; product details; speed (2026-09-19)
- Towels split per COMBO: 14 listings (e.g. "Willow Bath Towels - 27x54"), variations Color × Size ("Set of 2", "3 Pieces (1 Bath, 1 Hand, 1 Wash)").
- Added Impression, Glamour, Element, Essence rugs (Micro Bath Rug = Color × 17x24…24x40; one listing per set combo, e.g. "Bath Rug Set - 17x24 + 20x32" with "2 Pieces - 17x24, 20x32"), Ashford 4-Piece Ceramic Bathroom Accessory Set, Elmstone Printed Shower Curtain - 70x72. 32 listings.
- Details tab: SKU, UPC, color, size, dimensions, pile height, backing, shape, material, origin (from the PIM). Admin variant table has a UPC column; product CSV has `upc`.
- Speed: the store sent to every page is now a light catalog (one photo per colour, no per-size photo lists, only the small images it uses): 1.84 MB → ~0.37 MB. The product page loads its full product with `public_product(slug)`.
- Catalog SQL is split in two files because the Supabase SQL editor limits query size.

### Catalog from the PIM: towel collections (2026-09-19)
- All old products removed (copy kept in `public.store_backups`). Listed one product per collection from **HW_PIM (1).xlsx**: **Willow Towel** (13 colors × 25 packs, all 325 SKUs), **Hazel Towel** (261 SKUs) and **Elegance Essentials Towel** (67 SKUs).
- Prices: marketplace price from **OVERALL SKU+PRICE(PIM)** shown crossed out, with 10 % off as the sale price. Stock: not tracked (all in stock) until an inventory file is uploaded.
- Color/pack combinations without a price are marked `off`: hidden on the site, removed from carts and refused by `place_order`. Admin › product › Variants has a "Not sold" column.
- Pack options can carry a `group` (Bath towels, Hand towels, Washcloths, sets) and show under headings on the product page.
- A variant's gallery is its own photos followed by the color's shared photos (stored once per color).
- Photos are linked from Dropbox; "Create small images" now also makes 700 px copies of linked photos (loaded as images, which the security policy allows).
- One-off SQL: `supabase/catalog-towels-2026-09-19.sql` (built by a script from the two sheets).

### Sales tax and checkout quantities (2026-09-18)
- Admin › Promotions › **Sales tax**: on/off, a rate per state, and whether shipping is taxed. Live: New Jersey 6.625 % on items and shipping.
- `place_order` works the tax out (stored in `orders.tax`), Stripe shows it as a “Sales tax” line, and emails, the confirmation page, account and admin show it. Checkout shows it once a state is chosen.
- The checkout order summary has − / + and Remove on each line.
- Admin › Products › **Columns?** explains every CSV column.

### Bulk products, swatches, photos (2026-09-18)
- Admin › Products: **Export CSV** (one row per SKU; collections one row per color × size), **Import CSV** with a preview of every change and error before saving, and a **Template**. Import never deletes; blank cells keep current values; `none` clears a sale price or text field. Reads UTF-8 or Excel's Windows-1252 CSV.
- Colour swatches on the product page and cards show the fabric photo (`…swatch…` or close-up image), falling back to the colour.
- Long descriptions: first sentence or two on top, full text in a Description tab.
- Category tiles fall back to a product photo; category and band photos set.

### QA audit fixes (report of 2026-09-18)
- **Privacy / security**
  - The `store` table is admin-only. Shoppers read `public_store()`, which leaves out hidden products and every promo except the newsletter code. Other codes are checked one at a time with `check_promo()`.
  - Tracking, cancel requests, contact, newsletter and stock alerts go through the Edge Function (`/public/*`), with per-IP rate limits (IP stored only as an HMAC). Anonymous direct access to those functions and tables is revoked.
  - Self-cancel needs proof: the tab that placed the order, the signed link in the order email (`?c=`, removed from the address bar) or the signed-in account. Knowing an order number and email is no longer enough.
  - Signing out ends the session on the server too. The daily code-attempt cap is 20. Sign-up past the cap is silent. Welcome emails are sent once.
  - `GET /` shows no feature list (the admin uses `/admin/health`). No `workers.dev` or Snipcart hosts in the CSP (`node tools/csp.js --snipcart` if Snipcart is switched on). `robots.txt` no longer names the admin. Source files are excluded from GitHub Pages (`_config.yml`).
- **Orders and payments**
  - `?payment=success` is checked against the server before showing "Thank you".
  - Stock is held for orders being paid (advisory locks), so two shoppers can't buy the last item.
  - US-only shipping with state/territory and ZIP checks. PR, GU, VI, AS, MP and APO/FPO are accepted.
  - Random order numbers. Price must be above $0. Promo limits count only real orders.
  - A late or duplicate Stripe payment on a cancelled order is released or refunded automatically. An amount mismatch is flagged for review, and a refund made in Stripe marks the order refunded.
- **Storefront**
  - Money shows as $1,234.50.
  - Out-of-stock lines don't count in the cart total. Removed products leave the cart with a message. The cart "−" stops at 1.
  - Quantity stops at 1 and at the stock level. The chosen colour and size are in the URL, and switching colour moves off a sold-out size. Out-of-stock items make no shipping promise.
  - Category filters are in the URL, empty filter options stay visible (greyed out), and card prices follow the price filter.
  - Search understands 24x40 / 24"x40", ignores one-letter queries and caps queries at 100 characters.
  - The announcement bar can use `{{free_shipping}}`.
  - Tracking steps read Received → Preparing → Shipped → Delivered.
  - The cookie notice is informational (the store uses no tracking cookies).
  - Featured and social sections hide when they'd look empty. There's no "Towels · Towels".
  - Product structured data now includes shipping, returns and priceValidUntil. Static pages carry a real H1, and meta descriptions have no bullet characters.
  - The mobile menu moves focus inside, and price sliders show keyboard focus.
- **Admin**
  - Inline field errors with focus (prices, promos, inventory whole numbers only, shipping).
  - Deleted products take their stock rows with them.
  - Order status follows a fixed path, and tracking is required for Shipped/Delivered.
  - Revenue counts paid orders only. Dates are in US format.
  - The active tab is kept in the URL. Built-in pages can't be deleted.
  - Unsaved edits survive the idle sign-out.

### Sign-in page and Continue with Google
- New sign-in page (`/account/login`, and any account page while signed out): split screen like TEENUD's — brand panel on the left, form on the right; the store header and footer are hidden there. "Continue with Google", then "or", then email (6-digit code). No password field, by design.
- **Continue with Google** without any Google script on the site: the button goes to Google's own page (OpenID Connect) and comes back with a signed ID token; the server checks Google's RSA signature, the client ID, issuer, expiry, verified email and a one-time nonce, and the browser checks a one-time state. The token is removed from the address bar immediately. First Google sign-in fills an empty name. Only a public Client ID is needed (Admin › Storefront › Customer accounts); the button stays hidden until it's set.
- After signing in you land where you were going (the account section you opened, or checkout).
- 15 new server tests (forged signature, other app's token, wrong issuer, expired, replayed nonce, unverified email, alg none, unknown key, junk) and an 18-step browser test.

### Cash on delivery (off by default) and payment switches
- Admin › Storefront › **Payment methods**: on/off switches for **Card payments (Stripe)** and **Cash on delivery**, COD fee (≤ $50) and largest COD order.
- Checkout shows the methods that are on; with both, a choice with the total and button updating live. COD orders skip Stripe, are confirmed at once with the same free cancellation window, then go to ShipStation as *Cash on delivery — collect $X* (fee as its own line). Emails say to have the cash ready; the account panel and admin show "Cash on delivery"; admin marks it Paid when collected.
- Database: `orders.payment_method` (card | cod), `orders.cod_fee`, payment status `cod`; `place_order` accepts `paymentMethod`, enforces the switches, fee cap, order cap and 3 COD orders per email per day. New Edge route `/order/placed` sends the COD "we've got your order" email (needs the order's pay token).
- 10 new server tests, 12 database tests, 14-step checkout browser test.


### Customer panel (Your account)
- Sidebar with profile card (initials, name, email) and eight sections, in the store's own style: **Overview** (greeting, counts for orders / wishlist / addresses, recent orders with photos), **Orders** (full cards: items, address, progress, tracking, payment summary, Track / Return / Cancel; a page per order), **Wishlist**, **Addresses** (add, edit, remove, default — the default fills in checkout; one click saves the last order's address), **Payment methods** (explains cards are never stored; Stripe, Apple Pay, Google Pay), **Notifications** (order updates list with unread count and "Mark all read"; email offers on/off, order emails always on), **Returns** (pick order, items and reason; saved on the order, emails the customer and the store; shown in Admin › Orders), **Settings** (name, phone; no password — "Sign out on all devices"; delete account).
- Header shows the customer's initials when signed in. Every section has its own address (`/account/orders`, `/account/returns`, …) that answers 200 and is never indexed.
- New table `customer_profiles` (service role only; `signed_out_at` ends older sessions) and order columns `return_requested_at`, `return_reason`. New Edge routes `/account/profile`, `/account/return`, `/account/signout-all`, `/account/delete`; `/account/orders` now also returns the profile, saved addresses, email-updates state and each order's address.
- **Fixed (live site):** on phones, saving a wishlist item made the header's heart count push the cart icon off-screen, so the page scrolled sideways. The count is now a small bubble on the heart.
- **Fixed:** after cancelling inside the account, the list kept showing the old status until reload.
- 137 server tests (23 new) and a 40-step browser test of the whole panel (desktop + phone).

### Customer sign-up
- Anyone can create an account: "Sign in or create an account" takes any email and sends a 6-digit code — sign-up and sign-in are the same step, still no passwords. A new account shows "no orders yet"; orders placed with that email (as a guest before, or later) appear automatically.
- New emails share a daily cap (50 codes a day, secret `LOGIN_NEW_PER_DAY` to change it) so sign-ups can never use up the email quota order emails need; customers who already have orders are never capped. The per-email (5/hour) and per-IP (20/hour) limits still apply.
- Faster: the code request runs its database look-ups together (live: about 1.5–2 s, first request after a quiet period about 3 s; was 3.4–6 s). Buttons show “Sending your code…” / “Signing in…” while waiting.
- Verified live (real emails via Resend): new email signs up and sees “no orders yet”; existing customer sees their order and saved address; wrong code refused with tries left; a used code can’t be reused; sign out clears the device.
- Code emails say why they were sent ("someone asked to sign in … with this address").
- 114 server tests (3 new), passing directly and through the Edge wrapper.

### Customer accounts (guest checkout unchanged)
- **Your account** page (`/account`, header icon on desktop, menu and footer link everywhere): customers sign in with a 6-digit code emailed from orders@homeweavers.net. No passwords exist anywhere, and no Supabase Auth users are created for customers.
- Signed in, they see every order placed with that email (including earlier guest orders): status, progress, tracking link, cancel inside the free window, or ask to cancel after it. Checkout fills in their details from their last order; "Sign out" clears everything on the device.
- Guest checkout stays the default; the checkout offers "Sign in" only as a shortcut.
- Privacy and security: a code is sent only to emails that have a paid order, and the reply is identical either way (no way to test who shops here). Codes are 6 digits, valid 10 minutes, 5 tries, single use, stored only as keyed hashes; 5 codes per email and 20 per IP per hour (IP kept only as a hash); rows deleted after a day. Sessions are signed tokens valid 30 days; the orders reply leaves out internal fields (ids, notes, payment references, tokens).
- New table `customer_login_codes` (row security on, no public access, service role only) and Edge routes `/account/code`, `/account/verify`, `/account/orders`.
- 20 new server tests (111 total, also through the Edge wrapper) and a 22-step browser test (sign in, wrong code, orders, cancel, checkout prefill, sign out, expired session, phone layout, no XSS, no CSP errors).

### Site audit (2026-09-18)
- Crawled all 22 sitemap pages plus checkout, search, wishlist, order, admin and 404, on desktop and phone: no broken links or images, no JS or CSP errors, no third-party requests or trackers, one h1 per page, no sideways scroll.
- 49 live security probes as an anonymous visitor all held: private tables (orders, messages, subscribers, admins, private store) unreadable and unwritable, admin functions and Edge routes refuse without an admin session, webhooks refuse unsigned calls, storage can't be listed or written, order lookup and cancel need the matching email, the public store copy holds only the public contact email and no keys.
- **Faster home page:** the first hero picture now starts downloading from the page head (phone or desktop version) instead of after the scripts render it.
- **Checkout, search, wishlist and admin** now have their own files, so direct visits answer 200 (not via the 404 fallback) and load one step sooner; all are `noindex`.
- **Admin refuses to run inside another site's frame** (clickjacking); GitHub Pages can't send `X-Frame-Options`.
- **Tap targets:** icon buttons (menu, close, search, cart) are at least 24px with a larger invisible tap area; small text buttons are 24px tall. Header layout unchanged.
- Unknown addresses no longer request a misplaced tab icon.

### Card approved at checkout, charged on accept
- Stripe Checkout takes cards only (Apple Pay and Google Pay show up automatically as card wallets). No pay-later or bank methods.
- The card is authorized at checkout and captured when the order is accepted (by the admin button or the scheduled job after the 30-minute window). Cancelling inside the window releases the hold: no charge and no Stripe fee.
- New payment states: **Card held** (authorized), **Hold released** (voided), **Charge failed**. A failed charge is flagged on the order and never goes to ShipStation.
- Stripe webhook also listens for `payment_intent.canceled` (hold expired or released in Stripe).
- Storefront, emails, order page and tracking page say "you won't be charged" instead of "refunded".
- 91 server tests (12 new), passing directly and through the Edge wrapper; browser flows updated.

### Customer emails
- Branded order emails from **Home Weavers <orders@homeweavers.net>** through Resend (secret `RESEND_API_KEY`), replies to the store contact email: received (with the self-cancel window), accepted/preparing, shipped (carrier tracking link), cancelled (with refund amount), and refunds made in Stripe.
- Sent once per step: only when the order actually changes (no repeats on duplicate Stripe or ShipStation notices; a customer cancel doesn't also trigger a Stripe-refund email). A failed email is logged and never blocks the order.
- Email links carry only the order number (`page/track-your-order?order=HW-…`), which pre-fills the tracking page; the customer's email address is never put in a link. All customer-entered text is escaped.
- 79 server tests (11 new for emails), passing directly and through the Edge wrapper.

### Cancellation window and accepting orders
- A paid order now waits as **New** for a **30-minute cancellation window** (Admin › Storefront, 0–1440 minutes) instead of going straight to ShipStation.
- **Customer:** a *Cancel this order* button with a live countdown on the order page and on Track your order. It refunds the payment in Stripe, frees the promo code and cancels the order (`POST /order/cancel`, order number + email, window checked on the server).
- **After the window:** the customer can only *ask* us to cancel (`request_cancel`, needs number + email, never changes the status). The admin Orders tab lists these requests.
- **Admin:** *Accept order & send to ShipStation* on a paid order, showing when the window ends (`POST /orders/accept`).
- **Automatic:** `supabase/release-orders-cron.sql` schedules a 5-minute job that calls `POST /orders/release`, which accepts every paid order whose window has passed and sends it to ShipStation. The job needs no key: the route only ever accepts orders that are already due, and returns a bare count to anonymous callers.
- Order status gains **accepted**; orders store `accepted_at`, `cancelled_at`, `cancel_requested_at` and `cancel_reason`; `track_order` returns `paid_at` and `cancel_requested_at`.
- Live check: an order past its window was accepted by `/orders/release` and reached ShipStation; an order inside its window was cancelled by the customer route; cancelling an accepted order was refused; a cancellation request was recorded and shown in the admin. The server role was missing read access to `store` (needed for the window setting and site address); granted in `supabase-setup.sql` and live.
- Tests: 68 server checks and an 11-step browser test of the whole cancel journey (inside window, after window, shipped, already requested).

### Payments server moved to Supabase Edge Functions
- The Stripe/ShipStation/AI server code now runs as the Supabase Edge Function **hw** (`https://soydgxrrwozmiqzutypr.supabase.co/functions/v1/hw`), deployed with Verify JWT off. No Cloudflare account needed.
- `tools/build-edge.js` generates `supabase/functions/hw/index.ts` from `ai-proxy.worker.js` (same code; a small Deno wrapper strips the `/hw` path prefix and supplies Supabase's built-in URL and keys). All 44 server tests pass both directly and through the Edge wrapper.
- The worker sends new `sb_secret_` keys only in the `apikey` header (JWT keys also in `Authorization`), and ShipStation's webhook address uses the function's public URL. The health check reports `database`.
- Tracking also comes back when an order is **marked shipped** in ShipStation (webhook `FULFILLMENT_SHIPPED`, matched by ShipStation's order id), not only when a label is bought (`SHIP_NOTIFY`). Orders get a **Get tracking from ShipStation** button (`/shipstation/sync`) as a safety net.
- Live end-to-end test: order marked shipped in ShipStation → within seconds our order showed **Shipped** with the tracking number in the admin and on Track your order (no manual sync). Shipped/delivered/refunded orders no longer show **Send to ShipStation again** (it would reset them there), and a date-only ship date shows as a date.
- A cancelled order that is already in ShipStation can be cancelled there too (**Cancel in ShipStation** on the order).
- The site and admin use the Edge Function by default; Storefront › Card payments only needs an address for a different server. Buttons renamed to **Check server**.

### Hero banner, legal pages
- Live hero: the old site's banner (blank white strip trimmed; a close-up of the bathroom photo on phones, linked to Rugs), plus photo slides for Willow towels and bath rugs. The Waterford and Bedding slides were removed because those products don't exist.
- Terms of Service and Refund Policy rewritten; Shipping & Returns now matches the Refund Policy (30 days, unused and unwashed; free returns only for damaged, defective or wrong items). The old site's "90 nights" and "from our studio" wording was removed.
- Business address (Home Weavers Inc, 121 Ethel Road West, Suite 4, Piscataway, NJ 08854) on the Contact page, in the Terms (New Jersey governing law) and the Privacy Policy, and in the search-engine Organization data. Phone number to be added later.
- Page text supports *italic* and numbered lists (1. 2. 3.).
- Hero slides can be **picture-only**: when a slide has a photo but no eyebrow, headline, subtext or button text, the picture is shown whole (not cropped, no dark overlay) and the button link makes the whole banner clickable. Phones use the optional mobile image. The slide dots get a dark backing on light banners.

### Security and privacy pass
- **No orders without payment:** checkout is closed (“Checkout is opening soon”) until Stripe is switched on, and `place_order` refuses orders in the database too (`CHECKOUT_CLOSED`). One email address can have at most 5 unpaid orders per hour (`TOO_MANY_ORDERS`).
- **No third parties on page load:** fonts (Fraunces, Inter; OFL) are served from `assets/fonts` instead of Google Fonts, and the admin's supabase-js 2.116.0 is served from `js/vendor` (copied from the npm package, integrity checked) instead of a CDN. A normal page view now contacts only this site and the store's Supabase project.
- **Content Security Policy** on every page (`tools/csp.js`, run by `build-pages.js`): scripts only from this site (inline scripts by hash), no plugins, forms only to this site, connections only to Supabase, `*.workers.dev` and Snipcart. The last inline `onclick` was removed. `Referrer-Policy: strict-origin-when-cross-origin`.
- The admin refuses to run inside another site's frame (clickjacking).
- The worker no longer returns internal error details to shoppers or webhooks (they go to the Cloudflare log); admins still see them.
- The payment token is removed from the browser's session once an order is paid.
- Privacy policy lists what is collected and which services receive it (Stripe, ShipStation, carriers, Supabase, Cloudflare, GitHub Pages).

### Card payments (Stripe Checkout) and ShipStation
- **Checkout:** with Stripe on (Admin › Storefront), the order is saved and priced by `place_order` as before, then the shopper pays on a Stripe Checkout page built by the worker from the saved order. The cart is kept until payment succeeds; the order page offers **Pay securely** if the shopper backs out.
- **Worker routes:** `/checkout/session`, `/stripe` (signed webhook: paid, expired → cancelled and promo freed, refunded), `/shipstation/push`, `/shipstation/setup` (registers SHIP_NOTIFY) and `/shipstation/webhook` (token-checked; only calls ssapi.shipstation.com). `GET /` lists which features are configured.
- **ShipStation:** paid orders are created automatically (orderKey = order id, so resending updates the same order; discount sent as an adjustment line). Shipments set status Shipped, carrier, tracking number and shipped date.
- **Database:** `orders` gains `pay_token`, `payment_ref`, `paid_at`, `payment_livemode`, `shipped_at`, `shipstation_order_id`, `shipstation_synced_at`, `shipstation_error` and the status `cancelled`; `place_order` returns `pay_token`; `track_order` returns `shipped_at`. Applied to the live project.
- **Admin:** Storefront › Card payments panel (worker check, connect ShipStation tracking); order detail shows payment, Stripe link, ShipStation status and **Send to ShipStation**; Cancelled filter; CSV adds paid_at, payment_ref, shipstation_order_id.
- **Track your order:** carrier tracking links (USPS, UPS, FedEx, DHL) and a cancelled message.
- **Tests:** 43 worker tests (mocked Stripe, ShipStation and Supabase, including signature, tampering and SSRF checks), SQL tests on a local Postgres, and an 11-step browser test of checkout → Stripe cancel → pay again → success, worker error and tracking.

- **Small images:** product cards, cart, checkout, search results, category and social tiles, and gallery thumbnails
  now load a 700px copy (about 40–60 KB) instead of the full photo. The product page's main photo uses `srcset`, so phones get the small copy too.
  The copies live in Storage under `thumbs/`, mapped in `store.thumbs`. New uploads get one automatically, and
  Dashboard › **Create small images** fills in any that are missing. With no small copy, the full photo is used.
- **Page files:** `tools/build-pages.js` writes `category/*.html`, `product/*.html` and `page/*.html` (plus `sitemap.xml`).
  Direct visits now return HTTP 200 with the right title, description and canonical link, with no redirect through `404.html`
  (Lighthouse measured about 0.9–1.1 s lost to that redirect). `404.html` still covers pages added later.
- Category pages load the first four product photos right away (the first with high priority) instead of lazily; it was the page's largest image.
- **Home page LCP:** the product rails' scroll snapping made Chrome see an automatic scroll on page load, which stops
  Largest Contentful Paint measurement (Lighthouse reported "NO_LCP" and a performance score of 0). Snapping now starts on the first touch, scroll or arrow click.
- Page files preload the category's first product photo or the product's main photo, so it starts downloading before the scripts run.
- Hero slide dots have 24px tap targets (the dot itself is still 9px).
- Info pages: `##` sections are now `<h2>` (same look) when the page has no `#` heading, so headings don't jump from h1 to h3. The size guide dialog keeps `<h3>` under its own `<h2>`.
- `404.html` no longer requests a missing favicon on deep links.
- **Small images generated on the live store:** 444 of 444 (one retried after a temporary storage error). Product page weight went from about 2.9 MB to 0.7 MB.
- First visit starts downloading the store copy from the HTML head instead of after all scripts run (`window.HW_SNAPSHOT`, used by `js/api.js`). Return visits use the saved copy as before.
- The footer stays hidden until the first page renders, so on short pages it no longer slides up into view (Lighthouse CLS 0.137 → 0 on info pages).
- Scripts load right after the first paint (a small loader in `index.html` keeps their order), so the header appears while they download. Adding a new storefront script means adding its name to that list.
- Lighthouse mobile on the live site after these changes: Performance 85–94, Accessibility 100, Best Practices 100, SEO 100 (home, category, two products, info page).
- Promotions: `WELCOME10` turned off; `WELCOME15` is the sign-up code.
- Towel product names shortened to under 50 characters, with features and SEO titles added (URLs unchanged).

## Phase 5 — Mobile, performance, deploy

- **No layout shift while loading:** the page reserves space until the store loads, and the menu row keeps its height.
  Measured layout shift went from 0.29 to 0.00.
- **Faster store loading:**
  - Every admin save publishes a copy of the store to Supabase Storage, which is served from a CDN.
  - The site asks the CDN copy and the database at the same time and uses whichever answers first.
  - A tiny background check then swaps in newer data, and repeat visits render instantly from the browser cache.
- Connects early to the Supabase host, and Google Fonts no longer block the first paint.
- Tested at 360, 390, 768, 1024 and 1440 px: no sideways scrolling, working menu, filters that collapse on phones,
  and a readable admin on narrow screens.
- Tested from a `/Website/` sub-folder, as GitHub Pages serves it: deep links, query strings, every link, Back, search and `/admin`.
- `tools/dev-server.js` has a GitHub-Pages-style sub-folder mode (`PREFIX=/Website`).
- Deploy guide added to README (GitHub web upload, Pages settings and a post-launch checklist), plus a ready-to-upload zip.
- The `media` bucket also accepts the JSON store copy.

## Phase 4 — SEO, accessibility, shopping extras

- **Structured data:**
  - Product (price or price range, availability, SKU, brand, images) and BreadcrumbList on product pages.
  - BreadcrumbList on categories and pages.
  - WebSite (with search) and Organization on the home page.
  - Nothing is added to noindex pages.
- `sitemap.xml` (22 URLs from the live catalog) and `robots.txt`, plus download buttons in the admin.
- **Search:**
  - A header search panel with live results: name, category, material, color, size and SKU; every word must match.
  - Press "/" to open it, and Esc to close it with focus returning to the button.
  - A full results page at `/search?q=`.
- **Wishlist:** heart on every product card and on product pages, a count in the header, and a `/wishlist` page (saved on the device).
- **Recently viewed** products on product pages.
- **Image zoom:** click the main photo to open a full-screen viewer with next/previous, arrow keys, 2.2× zoom that follows the pointer, and Esc.
- **Size guide:** a dialog from the Size option with rug and towel tables. It is editable in Storefront, and blank hides it.
  Page text also supports simple `| tables |`.
- **Cookie consent:** Necessary only / Accept all, remembered on the device, and reopened from "Cookie settings" in the footer.
- **AA contrast:**
  - Sale prices, sale badges and out-of-stock text use a darker clay (#9A5B37: 4.88:1 on paper, 5.35:1 behind white text), up from 3.40:1 and 3.74:1.
  - Sold-out size labels are readable.
- Styled 404 page, one H1 per page, labels on every input, and keyboard support for the menu, slider, swatches, tabs, gallery, cart, search and dialogs.

## Phase 3 — Admin rebuild

### Structure
- Admin loads only on `/admin` (its own CSS, supabase-js v2 and `js/admin/*`), so shoppers never download it.
- Same tabs, fields and workflow as before, plus **Orders** and **Messages**.
- Sign-in uses Supabase Auth only, with no password in the data and no Supabase hint on the login screen.
  Wrong email and wrong password show the same message, too many attempts shows a wait message, and accounts not in `admins` are refused.
- Sign out after 30 minutes without activity.

### Admin bugs fixed / options added
1. **One save model.** Save button on every form, an "Unsaved changes" bar with Save/Discard, a warning before leaving,
   and toasts based on the real database result. Versioned saves show "Someone else changed the store — reload first"
   with Download my changes / Reload latest.
2. **Storefront logo.** Live preview, a direct-image check with a clear error, and Upload (converted to WebP, stored in Storage).
   Logo errors show only in the admin.
3. **Hero banner.** Button links are checked against real products, categories and pages, with a warning when a
   button will be hidden and a link picker. Image upload, mobile image and alt text added.
4. **Categories.** Tile image upload, SEO title/description, show/hide toggle, status (Visible / Hidden / Hidden — no products).
5. **Products.**
   - SEO title, meta description, URL slug (old addresses redirect), image alt text, photo upload on every slot.
   - Duplicate (starts as a hidden draft with SKUs cleared), multi-select bulk delete (type DELETE), search and category filter.
   - Name counter with a warning over 80 characters, plus a "Long name" tag in the list.
   - **Combine into collection:** turns several simple products into one color × size collection.
     Prices, photos, SKUs and stock move across, missing color/size pairs are marked unavailable, and old URLs redirect.
   - Checks for duplicate SKUs across the catalog, blank color/size names and a sale price not below the price.
6. **Inventory.** Real SKU field for simple products (stock moves from the old internal id), a low-stock alert with its own
   threshold setting, filters (Low / Out / Not tracked / Missing SKU), a row-by-row CSV upload report (unknown SKU,
   bad or negative quantity, duplicates, blank rows) before applying, and back-in-stock requests with mark notified, delete and CSV.
7. **Promotions.**
   - Labeled columns, start/end dates, usage limit with a "Used" count, one use per customer.
   - Warnings when several welcome codes are active or the sign-up code is inactive.
   - All limits are also enforced in the database at checkout.
8. **Newsletter.** Subscriber list read from the `subscribers` table, with copy emails, CSV export and delete selected.
9. **Marketing.**
   - The AI endpoint must be your Cloudflare Worker, and `api.anthropic.com` / `api.openai.com` are rejected.
   - AI buttons are disabled with "Set up AI worker" until it's set.
   - Requests carry the admin session and the worker checks it.
   - Empty (all-zero, no note) and duplicate results are not saved.
   - AI settings moved to `store_private`.
10. **Snipcart feed URL** includes the GitHub Pages folder automatically (from "Live site address"). Test feed URL checks
    the published `products.json` for missing items, price changes and wrong URLs. The feed uses plain-text descriptions.
11. **Orders tab (new).** List with status filters and search; detail with items, address and notes; status, payment, carrier,
    tracking number and private note; Email customer; Deduct items from inventory (once per order); CSV export.
12. **Messages tab (new).** Contact form messages, unread badge, reply by email, mark unread, delete, CSV export.
13. **Legal pages** (Privacy Policy, Terms of Service, Refund Policy, Accessibility) in a Legal column, plus SEO fields on pages.
14. **Dashboard.** Real stats (orders, revenue, low stock, out of stock, subscribers, unread messages), a to-do checklist,
    and typed DELETE confirmation for import, empty store and reset to sample data.
15. **Security.** Inactivity sign-out, a login error that doesn't reveal whether an email exists, no secret keys in the site,
    and spreadsheet-formula protection in every CSV export.

### Also added
- **Import old backup (.json):** converts the previous site's backup, splits it into `store`, `store_private` and
  `subscribers`, drops the password, and fixes the data issues, with a report before anything changes.
- **Export backup** now includes private marketing data and subscribers.
- **Move images to Storage:** copies external images (Dropbox, postimg) into Supabase Storage as WebP and updates every link.
- **Generated images** can be saved straight to Storage.
- `ai-proxy.worker.js`: one Cloudflare Worker with `/ai` (Claude `claude-opus-5`, admins only, refusal fallback),
  `/image` (OpenAI, admins only), `/welcome` (Brevo welcome email, only for fresh sign-ups) and `/snipcart`
  (validated Snipcart webhook → Orders).
- Sitemap.xml and robots.txt download in Storefront.

## Phase 2 — Storefront rebuild (same design) + storefront fixes

### Structure
- Split the single 3,500-line `index.html` into `index.html` + `css/` + `js/`. No build step.
- Design copied exactly: same colors, fonts (Fraunces + Inter), 4px radius, 1320px width,
  header, footer, hero slider, collection tiles, product cards, product page, cart drawer, animations.
- Storefront talks to Supabase with the public (publishable) key only. The admin loads separately on `/admin`.
- Store data is cached in the browser for fast repeat visits and refreshed in the background.
- `404.html` works on GitHub Pages sub-paths (`/Website/`) and custom domains automatically.
  Fixed: deep links broke the CSS/JS paths after the redirect.
- `js/schema.js`: fills in missing fields so older data never breaks the site, and converts the old backup.

### Storefront bugs fixed
1. Product descriptions showed raw HTML. They now render safe HTML only (`ul, ol, li, p, br, b, strong, em`).
   Cart, Snipcart and the product feed use plain text.
2. "Logo image couldn't load" toast no longer shows to shoppers. A broken logo falls back to the text logo.
   The imported logo URL was a web page, not an image, so it was cleared.
3. Announcement test text replaced with "Complimentary shipping on orders over $75". The bar hides if empty.
4. Hero buttons whose link target doesn't exist (e.g. `/product/waterford`, `/category/bedding`) are hidden.
5. Hero slide 1 (image with baked-in text) now uses real HTML text. Slides support a separate mobile image
   and alt text. Upload clean images in Admin (Phase 3).
6. Video section is hidden when no video URL is set.
7. Real checkout when Snipcart is off: contact, US address, order summary and a "payments not enabled yet" notice.
   The order is saved in the database (prices, stock and promo re-checked there), the cart clears,
   and a confirmation page shows the order number. With Snipcart on, Snipcart handles checkout.
8. Empty categories are hidden from navigation, home and footer (admin setting to show them).
   No admin text is shown to shoppers; an empty collection shows a friendly message.
9. Home tiles show the real product count with correct plural ("1 product", "5 products").
10. Placeholder email removed. Contact details come from settings, plus a working contact form
    (saved to `contact_messages`, spam-limited, with a hidden honeypot field).
11. Track Order page has an order number + email lookup with a status timeline.
12. Social icons with blank URLs are hidden; real ones open in a new tab.
13. Footer "A demo storefront" removed; year is automatic.
14. "Store admin" links removed from header and footer. Admin stays at `/admin`.
15. One shipping-time setting (`settings.shippingDays`, default "2–4 business days") used on the product page,
    stock labels, checkout and pages (`{{shipping_days}}` in page text).
16. Newsletter saves to the `subscribers` table and shows the welcome code on screen.
    Optional welcome email through a worker URL set in admin.
17. Price filter has a min–max range (slider + number boxes). Every filter option shows a count;
    options with 0 matches are hidden.
18. Out-of-stock products: badge, disabled Add to Cart, sorted last, "Notify me" email capture.
    Sold-out sizes can be selected to request a notification. Admin setting: show as out of stock or hide.
19. Color swatches have an accessible name and a tooltip with the color name.

### Also fixed while rebuilding
- Mobile menu button opened the cart. It now opens a real menu (Esc closes, focus stays inside).
- Cart drawer: Esc closes, focus is trapped while open, focus returns to the cart button.
- Closing the cart or menu returns keyboard focus to the button that opened it (never left inside the hidden panel).
- Footer stays at the bottom on short pages (404, empty cart).
- Cart is saved in the browser and re-priced from the live catalog; deleted items are removed.
- Quantity can't exceed available stock.
- Changing color/size no longer jumps the page to the top.
- Snipcart "Add to cart" on product cards (previously bypassed Snipcart).
- Long product names are clamped to 3 lines on cards (full name on the product page).
- Old long product URLs redirect to the new short ones.
- Sort on category pages (featured, price, name).
- Each page sets its own title, description, canonical link and social tags. Checkout and order pages are `noindex`.
- One `<h1>` per page, real `<img>` tags with alt text, lazy loading and width/height.
- Hero slider: pause button, pauses on hover/focus, arrow keys, swipe, respects reduced motion.

## Phase 1 — New Supabase database

- `supabase-setup.sql` (safe to re-run): `store`, `store_private`, `admins` + `is_admin()`, `subscribers`,
  `stock_alerts`, `contact_messages`, `orders`, `order_items`, `promo_redemptions`, storage bucket `media`.
- Row Level Security on every table and least-privilege grants. Visitors can only read the public catalog.
- Versioned saves (`save_store`, `save_private`): a save fails with
  "Someone else changed the store — reload first" instead of overwriting.
- `place_order` re-prices the cart from the catalog, checks stock, promo dates, usage limits and
  one-use-per-customer, and applies the shipping rule. `track_order` needs order number **and** email.
- `subscribe` and `request_stock_alert` ignore repeats without revealing whether an email exists.
- No passwords stored. Admin login is Supabase Auth; public sign-ups turned off.
- Backup imported: password removed, test announcement replaced, 100 stale stock rows removed,
  5 empty marketing log entries removed, legal pages added (Privacy, Terms, Refund, Accessibility).
