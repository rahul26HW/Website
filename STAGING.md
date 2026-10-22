# Staging

A staging shop is the same code as the live one, pointed at a **separate Supabase project**, with
Stripe in **test mode**. An auditor can place orders, change the catalog and cancel things on it
without a single real customer, order or card being touched.

It is the same tree, not a fork. The only file that differs from production is `js/config.js`,
and `tools/build-staging.js` writes that. Keeping staging current is a re-run of the build, never
a hand-merge.

Everything on staging carries a red **STAGING** band and `noindex, nofollow`, and `robots.txt`
disallows the whole site, so it cannot be mistaken for the shop or picked up by Google.

---

## What only you can do (sign-ins I don't have)

These four need your accounts. The rest is scripted.

1. **A GitHub repo for it** — create `homeweavers-staging` (public), then Settings → Pages →
   Deploy from branch `main`, folder `/`. The URL will be
   `https://rahul26HW.github.io/homeweavers-staging/` — no DNS record needed, which is why the
   plan does not use `staging.homeweavers.com`.
2. **A second Supabase project** — a new project in the same organisation, any name, free tier is
   fine. Copy its **project URL** and its **publishable** (`sb_publishable_…`) key. Never its
   secret or service-role key.
3. **Stripe test keys** — `sk_test_…`, `pk_test_…`, and a test-mode webhook signing secret, set as
   secrets on the staging Edge Function. They are yours to paste; I never handle them.
4. **A staging admin user** — Authentication → Users → add yourself, confirm the email. Step 4
   below puts that address in the `admins` table.

---

## Setting it up

### 1. Point the tooling at staging

```bash
cp staging.config.example.json staging.config.json
```

Fill in `supabaseUrl`, `supabasePublishableKey`, `siteUrl` and `out`. The file is git-ignored.
The build refuses to run if the URL is the production project or if the key looks like a secret.

### 2. Build the database

```bash
node tools/build-staging-sql.js
```

That writes `staging-bootstrap.sql` — the schema, row-level security, grants and every RPC, in the
order they have to run, with the project reference swapped to staging. Paste it into the **staging**
project's SQL Editor and run it. It refuses to write a file that still names the production project.

Left out on purpose: the catalog dumps and the production data fixes. Staging gets its catalog in
step 4.

### 3. Add the sample data

Paste `supabase/staging-seed.sql` into the same SQL Editor. It adds four fake orders (new, shipped,
delivered, refunded), two messages, three sign-ups and stock for three SKUs — one of them sold out.
Every address is `@example.com`, which by RFC 2606 reaches nobody. It aborts if it finds an order
that is not one of those, so it cannot run against production.

Change the address at the top to the one you will sign in with before running it.

### 4. Build and publish the site

```bash
node tools/staging-store.js     # writes staging-store.json from the live catalog
node tools/build-staging.js     # writes the staging tree to the "out" folder
```

`staging-store.js` copies the public catalog and rewrites what could reach a real person: the site
address, the payment settings (card **and** cash on delivery both on, pointed at the staging
worker), and any email endpoint. It adds two promo codes to test with — `STAGE10` (10% off) and
`STAGEOLD` (expired, so a rejection can be seen).

Then in the staging tree: `git init`, commit, push to `homeweavers-staging`. Open the staging admin
at `<staging URL>/admin`, sign in, and import `staging-store.json`.

Product photographs still load from the live Storage bucket. That is a read of a public CDN — it
gives staging real images without copying 8,000 files, and nothing on staging can write there.

### 5. Check it

- The red STAGING band is on every page, including `/admin`.
- `view-source` shows `noindex, nofollow`, and `/robots.txt` disallows everything.
- A checkout lands on `checkout.stripe.com` with the orange **TEST MODE** banner. Card
  `4242 4242 4242 4242`, any future expiry, any CVC.
- The order appears in the staging admin and **not** in the live one.

---

## Keeping it in step

After any change lands on production:

```bash
node tools/build-staging.js
```

and push the staging tree again. Only `js/config.js` will differ from what production is running.
