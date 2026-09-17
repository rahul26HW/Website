# Home Weavers — website + admin

Static storefront on GitHub Pages, data in Supabase, optional Snipcart checkout,
optional Cloudflare Worker for AI. No build step.

**Order of setup:** 1. Supabase → 2. Admin (import backup) → 3. AI worker (optional) → 4. Welcome email (optional)
→ 5. Snipcart (optional) → 6. Publish on GitHub Pages.

## Preview on your computer

1. Install Node.js (LTS) from https://nodejs.org if you don't have it.
2. Open a terminal in this folder and run `node tools/dev-server.js`.
3. Open http://localhost:8080.

The preview server behaves like GitHub Pages (unknown paths go through `404.html`).

---

## 1. New Supabase project (one time, ~15 minutes)

### Step 1 — Create the project
1. Open https://supabase.com/dashboard and sign in.
2. Click **New project**.
3. **Project name:** `home-weavers`.
4. **Database password:** click **Generate a password**, then copy it somewhere safe.
   (The website never uses it. You only need it for emergencies.)
5. **Region:** pick **East US (North Virginia)** (closest to US shoppers).
6. Leave every other option as it is.
7. Click **Create new project**. Wait until the dashboard stops showing "Setting up project".

### Step 2 — Run the database setup
1. Left sidebar → **SQL Editor**.
2. Click **+ New query** (or **New SQL snippet**).
3. Open `supabase-setup.sql` from this folder in Notepad → **Ctrl+A** → **Ctrl+C**.
4. Click inside the Supabase editor → **Ctrl+V**.
5. Click **Run** (bottom right), or press **Ctrl+Enter**.
6. If Supabase asks about "destructive operations", click **Run this query**.
7. Expected result: one row that says **Home Weavers database is ready**.

The file is safe to run again at any time.

### Step 3 — Create your admin login
1. Left sidebar → **Authentication** → **Users**.
2. Click **Add user** → **Create new user**.
3. Enter your **email** and a **strong password** (12+ characters).
4. Tick **Auto Confirm User**.
5. Click **Create user**.

### Step 4 — Mark that email as an admin
1. Left sidebar → **SQL Editor** → **+ New query**.
2. Paste this line. Change the email if yours is different:
   ```sql
   insert into public.admins (email) values (lower('admin@homeweavers.net')) on conflict do nothing;
   ```
3. Click **Run**. Expected: "Success. No rows returned".

Only emails in this list can change the store. Being signed in is not enough.

### Step 5 — Turn off public sign-ups
1. Left sidebar → **Authentication** → **Sign In / Providers**.
2. Switch **Allow new users to sign up** to **OFF**.
3. Click **Save changes**.

### Step 6 — Copy your two public values
1. Left sidebar → **Project Settings** (gear icon) → **API Keys**.
2. Copy the **Publishable key** (starts with `sb_publishable_`).
3. Left sidebar → **Project Settings** → **Data API** (or click **Connect** at the top).
4. Copy the **Project URL** (looks like `https://abcdefgh.supabase.co`).
5. Keep both for Phase 2 (`js/config.js`).

Never copy the **Secret key** or **service_role** key into any website file.

### Step 7 — Check it worked
- **Table Editor** lists: `admins`, `contact_messages`, `order_items`, `orders`,
  `promo_redemptions`, `stock_alerts`, `store`, `store_private`, `subscribers`.
- **Storage** shows a bucket named `media` marked **Public**.

---

## What the database allows

| Data                 | Visitors (not signed in)             | Admins            |
|----------------------|--------------------------------------|-------------------|
| `store` (catalog)    | read                                 | read, save        |
| `store_private`      | —                                    | read, save        |
| `subscribers`        | sign up only                         | read, delete      |
| `stock_alerts`       | "Notify me" only                     | read, edit, delete|
| `contact_messages`   | send only (max 3 per 10 minutes)     | read, mark read, delete |
| `orders`, items      | place order; look up by number + email | read, update   |
| Storage `media`      | view public image links              | upload, replace, delete |

- **No passwords** are stored in these tables. Admin login uses Supabase Auth.
- **Checkout prices are re-checked in the database**, so a visitor cannot change them.
- **Saves are versioned.** If the store changed after you opened the admin, the save is
  refused with "Someone else changed the store — reload first".

---

## 2. Using the admin

Open `/admin` on your site (for example `https://rahul26hw.github.io/Website/admin`) and sign in
with the email and password from Step 3. There is no admin link on the public site.

**How saving works**
- Every form has a **Save** button. A dark bar at the bottom says **Unsaved changes** until you save.
- The green "Saved" message only appears after the database confirms the save. If it fails you see
  **Save failed:** and the reason.
- If someone else saved the store after you opened the admin, you get
  **Someone else changed the store — reload first**. Click **Download my changes** to keep a copy, then **Reload latest**.
- Marketing plans, checkmarks and logged results save automatically.
- Orders and messages save with their own buttons.
- You are signed out after 30 minutes without activity.

**Tabs**

| Tab | What it does |
|---|---|
| Dashboard | Orders, revenue, stock alerts, subscribers, unread messages, a to-do checklist, **Move images to Storage**, backup export/import, **Import old backup**, empty/reset (type DELETE) |
| Storefront | Brand and logo (upload or link, with a check), announcement, contact details, shipping time, out-of-stock rule, low-stock level, site address, social links, welcome email, Snipcart and product feed, sitemap.xml and robots.txt |
| Hero banner | Slides (desktop and mobile image, alt text, button link check), editorial band, video banner, features, social tiles |
| Pages | Footer pages in three columns (service, company, legal), with SEO fields |
| Categories | Image, SEO, show/hide, filters, subcategories |
| Products | Search, bulk delete, duplicate, **Combine into collection**, editor with SEO, slug, alt text, uploads, color × size variants |
| Inventory | Stock per SKU, real SKUs for simple products, low/out filters, CSV download and upload with a row-by-row report, back-in-stock requests |
| Orders | List, details, status (new / packed / shipped / delivered / refunded), payment, tracking number, deduct stock, CSV export |
| Promotions | Free-shipping rule, codes with start/end dates, usage limit and one use per customer, welcome code, subscribers (CSV, delete) |
| Marketing | AI Operator, today's plan, results log, content and image generation (needs the AI worker) |
| Messages | Contact form messages: read, reply by email, mark unread, delete, CSV |

### Import your old backup
1. Admin → **Dashboard** → **Backup & data** → **⬆ Import old backup (.json)**.
2. Choose `home-weavers-backup-2026-09-17.json`.
3. Read the report. It lists every fix: password removed, test announcement replaced, stale stock rows removed,
   empty marketing entries removed, legal pages added, and so on.
4. Click **Continue**, type `DELETE`, click **Confirm**.

### Make the site fast: move images to Storage
Your product photos are 0.7–1.1 MB each on Dropbox.
1. Admin → **Dashboard** → **Move images to Storage**.
2. Wait for the bar to finish. Each image becomes a WebP of about 100–200 KB, and the links update and save automatically.

---

## 3. AI worker (Cloudflare, free) — for the Marketing tab

The admin never calls Anthropic or OpenAI directly. It calls your worker, and the worker checks that you are a
signed-in admin before it uses your API key.

### Step 1 — Get an Anthropic API key
1. Open https://console.anthropic.com → **Settings** → **API Keys** → **Create Key**. Copy it.
2. Optional but smart: **Settings** → **Limits** → set a monthly spend limit.

### Step 2 — Create the worker
1. Open https://dash.cloudflare.com and sign in (a free account is fine).
2. Left sidebar → **Compute (Workers)** → **Workers & Pages** → **Create** → **Start with Hello World!**
3. **Worker name:** `home-weavers-ai` → **Deploy**.
4. Click **Edit code**. Select all the sample code and delete it.
5. Open `ai-proxy.worker.js` from this folder in Notepad → **Ctrl+A** → **Ctrl+C** → paste into Cloudflare.
6. Click **Deploy**.

### Step 3 — Add the settings
Worker → **Settings** → **Variables and Secrets** → **+ Add**. For each row, choose **Type: Secret**, then click **Deploy**:

| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | the key from Step 1 |
| `SUPABASE_URL` | `https://soydgxrrwozmiqzutypr.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | the `sb_publishable_…` key from `js/config.js` |
| `ALLOWED_ORIGINS` | `https://rahul26hw.github.io,http://localhost:8080` |

Optional:
- `OPENAI_API_KEY` turns on 🎨 image generation.
- `CLAUDE_EFFORT` = `low`, `medium` (default) or `high`.

### Step 4 — Connect it
1. Copy the worker URL shown at the top (for example `https://home-weavers-ai.yourname.workers.dev`).
2. Admin → **Marketing** → **Brand voice & AI worker** → paste it into **AI worker URL** → **Save changes**.
3. Click **Test connection**. Expected: "✓ Connected".

The worker uses the model `claude-opus-5`. If Claude declines a request, the worker automatically retries it
on Anthropic's recommended fallback model.

---

## 4. Optional: newsletter welcome email (Brevo, free 300 emails a day)

1. Create a free account at https://www.brevo.com. Verify a sender email: **Senders, domains & dedicated IPs** → **Senders** → **Add a sender**.
2. Create a key: **SMTP & API** → **API Keys** → **Generate a new API key**.
3. Supabase → **Project Settings** → **API Keys** → **Secret keys** → copy the secret key. It goes **only** into Cloudflare, never into the website.
4. Cloudflare worker → **Settings** → **Variables and Secrets** → add these as **Secret**:
   `BREVO_API_KEY`, `FROM_EMAIL` (your verified sender), `FROM_NAME` (Home Weavers), `SUPABASE_SERVICE_ROLE_KEY` (the Supabase secret key) → **Deploy**.
5. Admin → **Storefront** → **Newsletter welcome email** → paste the worker URL → **Save changes**.

The worker only emails addresses that subscribed in the last 10 minutes. The code comes from your store settings, not from the visitor.

---

## 5. Optional: Snipcart (card payments)

1. Create an account at https://snipcart.com and connect a payment gateway (for example Stripe).
2. Snipcart → **Account** → **API Keys** → copy the **public** test key.
3. Admin → **Storefront** → **Checkout & payments** → tick **Use Snipcart**, paste the key → **Save changes**.
4. Click **Export product feed** and upload `products.json` next to `index.html` on GitHub, then click **Test feed URL**.
5. To save Snipcart orders into your Orders tab:
   - Cloudflare worker → add the secrets `SNIPCART_SECRET_KEY` (Snipcart → **API Keys** → secret key) and `SUPABASE_SERVICE_ROLE_KEY`.
   - Snipcart → **Account** → **Webhooks** → add `https://home-weavers-ai.yourname.workers.dev/snipcart`.

When Snipcart is off, the built-in checkout saves orders (no payment is taken) and shows shoppers that online payments aren't enabled yet.

---

## 6. Publish on GitHub Pages

The site needs no build. Upload the files and GitHub serves them.
It works at `https://USERNAME.github.io/REPO/`, at `https://USERNAME.github.io/` and on a custom domain;
the folder name is detected automatically.

The site lives in the repository **rahul26HW/Website** and is published at **https://rahul26hw.github.io/Website/**.
The old demo site at `nitish463.github.io/Website` is untouched.

### Step 1 — Update the files
Easiest (no tools needed):
1. Unzip `home-weavers-site.zip`.
2. Open https://github.com/rahul26HW/Website → **Add file** → **Upload files**.
3. Drag **everything inside** the unzipped folder into the page (including the `css`, `js`, `assets` and `tools` folders).
   Files with the same name are replaced.
4. **Commit message:** `Update site` → **Commit changes**.

With Git: copy the files into your clone, then `git add -A`, `git commit -m "Update site"`, `git push`.

### Step 2 — Turn on Pages (one time)
1. Repository → **Settings** → **Pages**.
2. **Source:** Deploy from a branch → **Branch:** `main`, folder `/ (root)` → **Save**.
3. Wait 1–2 minutes. The address appears at the top of that page.

### Step 3 — Finish in the admin
1. Open `https://rahul26hw.github.io/Website/admin` and sign in.
2. **Storefront** → **Store settings** → **Live site address**: `https://rahul26hw.github.io/Website/` → **Save changes**.
   (Every save also publishes a fast copy of the store for shoppers.)
3. **Dashboard** → **Move images to Storage** (one time).
4. **Storefront** → **Search engines** → download `sitemap.xml`, then upload it to the repository (replace the old one).
5. Optional: submit `https://rahul26hw.github.io/Website/sitemap.xml` in Google Search Console.

### After launch checklist
- Home, a category, a product with colors and sizes, cart, checkout, **Track your order**, **Contact us** and newsletter all work.
- `https://rahul26hw.github.io/Website/product/impression-bath-rug` opens directly (deep links).
- A made-up address shows the styled "We couldn’t find that page".
- Your cloud worker's `ALLOWED_ORIGINS` includes `https://rahul26hw.github.io`.

---

## Files

| Path | What it is |
|---|---|
| `index.html` | The page shell (storefront + admin container) |
| `404.html` | Sends deep links back to `index.html` on GitHub Pages |
| `css/site.css`, `css/admin.css` | Styles (admin styles load only on `/admin`) |
| `js/config.js` | Supabase URL + publishable key (public values only) |
| `js/*.js` | Storefront: data, routing, pages, cart, checkout, search, wishlist… |
| `js/admin/*.js` | Admin tabs (loaded only on `/admin`) |
| `supabase-setup.sql` | Database, security rules and functions (safe to re-run) |
| `ai-proxy.worker.js` | Cloudflare Worker: AI, images, welcome email, Snipcart webhook |
| `sitemap.xml`, `robots.txt` | Search engine files |
| `tools/dev-server.js` | Local preview server (not used by GitHub Pages) |
