# Changelog — Home Weavers rebuild

## Live verification (signed in as admin)

- Real saves reach the database, and each one publishes the CDN copy of the store.
- **Fixed:** an out-of-date save used error code 40001, which the Supabase API retries automatically, so it looped
  instead of failing. It now uses `PT409` (HTTP 409), and the admin shows "Someone else changed the store — reload first" at once.
  Updated in `supabase-setup.sql` and on the live project.
- Marketing results auto-save to `store_private` and can be deleted.
- **Move images to Storage:** 444 images copied with 0 failures. The live store has 0 Dropbox links, and photos are about 250 KB WebP instead of 0.7–1.1 MB.

## After launch

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
