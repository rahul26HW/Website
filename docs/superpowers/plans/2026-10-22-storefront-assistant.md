# Storefront Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A free storefront assistant that answers from a written FAQ, tells a signed-in customer where their order is, and suggests products.

**Architecture:** One new file, `js/assistant.js`, holding four independent handlers behind a keyword router, opened from a header button in a panel built like `HW.searchPanel`. FAQ entries live in the store JSON and also render a real FAQ page. The only handler touching personal data calls the existing authenticated `/account/orders` route; no new endpoint is added.

**Tech Stack:** Plain ES5-style browser JS, no build step, no dependencies. Node for the test harness, using `vm` the way `tools/build-pages.js` already does.

**Spec:** `docs/superpowers/specs/2026-10-22-storefront-assistant-design.md`

## Global Constraints

- No secret key in front-end code, ever. The assistant adds no key of any kind.
- No personal data in URLs, in `localStorage`, or in any log.
- Phase A adds no network endpoint. Every call it makes is one the site already makes.
- Answer-only: no task adds an action that changes an order, address, return or discount.
- Browser JS is ES5-style `var`/`function` to match the rest of `js/`: no arrow functions, no `const`.
- All rendered text goes through `u.esc`; FAQ answers go through `HW.richText` like page bodies.
- Mobile: full-height sheet under 720px, inputs at 16px so iOS does not zoom.
- Run `node tools/build-pages.js` after any `js/` or `css/` change so the asset stamp is current.

## Review Focus

1. **An FAQ entry containing a script tag** — an admin paste must render inert through the existing sanitiser. Task 2.
2. **A signed-out visitor asking "where is my order"** — must get a sign-in link and make zero network calls, never a prompt for email or order number. Task 4.
3. **A session that expired between opening the panel and asking** — must surface the sign-in prompt, not a raw 401. Task 4.
4. **A finder answer where every match is hidden or out of stock** — must say so and offer the contact form, not render an empty grid. Task 5.
5. **A question asked before the catalog finished loading** — the launcher must not be clickable, so no handler runs against an empty `HW.DB`. Task 6.

---

### Task 1: FAQ entries in the store schema

**Files:**
- Modify: `js/schema.js` — add `faq: []` to the defaults, normalise entries
- Test: `tools/test-assistant.js` (create)

**Interfaces:**
- Produces: `HW.DB.faq`, an array of `{ id: string, q: string, a: string, tags: string, show: boolean }`

- [ ] **Step 1: Write the failing test**

Create `tools/test-assistant.js` with a `vm` context loading `util`, `sanitize`, `schema`, `model` from `js/`, the way `tools/build-pages.js` does in `loadLogic()`.

```js
test('normalizeStore gives every faq entry an id, a show flag and string fields', function () {
  var d = HW.schema.normalizeStore({ faq: [{ q: 'Do towels shrink?', a: 'A little.' }] });
  assert(typeof d.faq[0].id === 'string' && d.faq[0].id.length > 0);
  assert(d.faq[0].show === true);
  assert(d.faq[0].tags === '');
});
test('normalizeStore defaults faq to an empty array', function () {
  assert(Array.isArray(HW.schema.normalizeStore({}).faq));
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node tools/test-assistant.js`
Expected: FAIL — `d.faq` is undefined.

- [ ] **Step 3: Add `faq` to `js/schema.js`**

Add `faq: []` to the defaults object beside `features: []`. In `normalizeStore`, beside the existing `(d.features || []).forEach(...)` line, give each entry an `id` from the existing `uid('faq')` helper when missing, coerce `q`, `a` and `tags` with `str()`, and default `show` to `true` when it is not a boolean — matching how `d.pages` is normalised just above.

- [ ] **Step 4: Run it and watch it pass**

Run: `node tools/test-assistant.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/schema.js tools/test-assistant.js
git commit -m "Add FAQ entries to the store schema"
```

---

### Task 2: The FAQ page

**Files:**
- Modify: `js/pages.js` — an `faq` view and a delegation from `HW.views.page`; `js/chrome.js` — a footer link
- Test: `tools/test-assistant.js`

**Interfaces:**
- Consumes: `HW.DB.faq` from Task 1
- Produces: `HW.views.faq()` returning `{ html: string, seo: object }`

- [ ] **Step 1: Write the failing tests**

```js
test('the faq page lists only shown entries', function () {
  HW.DB = { faq: [{ id: 'a', q: 'Shown?', a: 'Yes.', show: true }, { id: 'b', q: 'Hidden?', a: 'No.', show: false }], pages: [] };
  var html = HW.views.faq().html;
  assert(html.indexOf('Shown?') >= 0);
  assert(html.indexOf('Hidden?') < 0);
});
test('an faq answer containing a script tag is rendered inert', function () {
  HW.DB = { faq: [{ id: 'a', q: 'X?', a: '<script>alert(1)</script>', show: true }], pages: [] };
  assert(HW.views.faq().html.indexOf('<script>') < 0);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node tools/test-assistant.js`
Expected: FAIL — `HW.views.faq` is not a function.

- [ ] **Step 3: Implement `HW.views.faq()` in `js/pages.js`**

Model it on `HW.views.page` directly above: same `wrap`, `crumb` and `cms` article shell. Render each shown entry as a `<details>` with the question in `<summary>`, so it works without JavaScript. Question through `u.esc`; answer through `HW.richText(HW.tokens(...))`, exactly as `HW.views.page` renders a page body.

Route it through the existing `/page/:slug` path rather than adding a route: in `HW.views.page`, when `params.slug === 'faq'`, return `HW.views.faq()` — the same shape as the existing special-casing that appends `contactBlock()` for `contact-us`. The owner adds a page record titled FAQ with slug `faq` so it appears in the footer groups.

- [ ] **Step 4: Run them and watch them pass**

Run: `node tools/test-assistant.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/pages.js tools/test-assistant.js
git commit -m "Add the FAQ page"
```

---

### Task 3: FAQ editing in the admin

**Files:**
- Modify: `js/admin/tab-pages.js`
- Test: manual, in the admin on staging

**Interfaces:**
- Consumes: `HW.DB.faq` from Task 1
- Produces: `A.actions['faq-add']`, `A.actions['faq-remove']`, `A.actions['faq-move']`

- [ ] **Step 1: Add the FAQ panel**

Below the existing page groups, add a panel listing `d.faq`. Each entry gets `ui.field('Question', 'faq.' + i + '.q', f.q)`, `ui.field('Answer', 'faq.' + i + '.a', f.a, { textarea: true, rows: 4 })`, `ui.field('Keywords', 'faq.' + i + '.tags', f.tags, { hint: 'Words a customer might use that are not in the question.' })`, `ui.check('Show', 'faq.' + i + '.show', f.show)`, and up, down and remove buttons following the `feat-move` and `feat-remove` pattern in `js/admin/tab-banner.js`. End with `ui.saveBtn()`.

Mutate `A.draft`, never `A.store`, and call `A.render()` before saving — the rule in `js/admin/core.js`.

- [ ] **Step 2: Verify in the admin**

On staging: add an entry, save, reload, confirm it persists and shows on the FAQ page.

- [ ] **Step 3: Commit**

```bash
git add js/admin/tab-pages.js
git commit -m "Edit FAQ entries from the admin"
```

---

### Task 4: The order handler

**Files:**
- Create: `js/assistant.js`
- Modify: `js/account.js` — export the existing `load`
- Test: `tools/test-assistant.js`

**Interfaces:**
- Consumes: `HW.account.get()`, `HW.account.load(force)`, `HW.trackingUrl(carrier, number)`
- Produces: `HW.assistant.handlers.order(text)` → Promise resolving to an HTML string

- [ ] **Step 1: Export `load` from `js/account.js`**

Add `load: load,` to the `HW.account = { ... }` object beside `call: call`. It already caches, so the assistant and the account page share one fetch.

- [ ] **Step 2: Write the failing tests**

```js
test('signed out, the order handler offers sign-in and makes no network call', async function () {
  var calls = 0;
  HW.account = { get: function () { return null; }, load: function () { calls++; return Promise.resolve(null); } };
  var html = await HW.assistant.handlers.order('where is my order');
  assert(html.indexOf('/account') >= 0);
  assert(calls === 0);
});
test('signed in, the order handler shows the latest order and its tracking link', async function () {
  HW.account = { get: function () { return { email: 'a@example.com' }; },
    load: function () { return Promise.resolve({ orders: [{ order_number: 'HW-1', status: 'shipped', carrier: 'usps', tracking_number: '94001', created_at: '2026-10-01T00:00:00Z' }] }); } };
  var html = await HW.assistant.handlers.order('where is my order');
  assert(html.indexOf('HW-1') >= 0);
  assert(html.indexOf('94001') >= 0);
});
test('an expired session surfaces the sign-in prompt rather than a raw error', async function () {
  HW.account = { get: function () { return { email: 'a@example.com' }; },
    load: function () { var e = new Error('nope'); e.status = 401; return Promise.reject(e); } };
  var html = await HW.assistant.handlers.order('where is my order');
  assert(/[Ss]ign in/.test(html));
});
```

- [ ] **Step 3: Run them and watch them fail**

Run: `node tools/test-assistant.js`
Expected: FAIL — `HW.assistant` is not defined.

- [ ] **Step 4: Implement `HW.assistant.handlers.order(text)` in `js/assistant.js`**

Create the file with the same IIFE shape as `js/features.js`. Return early with a sign-in link when `HW.account.get()` is falsy, before any call. Otherwise `await HW.account.load()`, take the most recent order by `created_at`, and render order number, status, date and — when `tracking_number` is present — a link from `HW.trackingUrl(o.carrier, o.tracking_number)`. Finish with a button through to `HW.link('/account/orders')`. Catch a rejection and return the sign-in prompt; `HW.account.call` already signs the device out on a 401.

Store nothing. Put nothing in a URL.

- [ ] **Step 5: Run them and watch them pass**

Run: `node tools/test-assistant.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add js/assistant.js js/account.js tools/test-assistant.js
git commit -m "Assistant: answer where is my order for a signed-in customer"
```

---

### Task 5: The FAQ, finder and handoff handlers, and the router

**Files:**
- Modify: `js/assistant.js`
- Test: `tools/test-assistant.js`

**Interfaces:**
- Consumes: `HW.DB.faq`, `HW.search.run(q)`, `HW.m.listable(p)`, `HW.m.productOut(p)`, `HW.productCard(p, opts)`
- Produces: `HW.assistant.handlers.faq(text)`, `.finder(text)`, `.handoff(text)` → HTML strings; `HW.assistant.route(text)` → `'faq' | 'order' | 'finder' | 'handoff'`

- [ ] **Step 1: Write the failing tests**

```js
test('the router sends an order question to the order handler', function () {
  assert(HW.assistant.route('where is my order') === 'order');
  assert(HW.assistant.route('track my parcel') === 'order');
});
test('the router sends a policy question to the faq handler', function () {
  HW.DB = { faq: [{ id: 'a', q: 'What is your return window?', a: '30 days.', tags: 'refund', show: true }], products: [] };
  assert(HW.assistant.route('how long do I have to return something') === 'faq');
});
test('the faq handler answers with the stored text', function () {
  HW.DB = { faq: [{ id: 'a', q: 'What is your return window?', a: '30 days.', tags: 'refund', show: true }] };
  assert(HW.assistant.handlers.faq('return window').indexOf('30 days.') >= 0);
});
test('the finder never offers a hidden or out-of-stock product', function () {
  // fixture: one listable rug, one hidden ("Hidden Rug"), one out of stock ("Sold Out Rug")
  var html = HW.assistant.handlers.finder('soft bath rug');
  assert(html.indexOf('Hidden Rug') < 0);
  assert(html.indexOf('Sold Out Rug') < 0);
});
test('the finder says so when nothing matches, and offers the contact form', function () {
  HW.DB = { products: [], categories: [], faq: [] };
  assert(/[Cc]ontact/.test(HW.assistant.handlers.finder('purple velvet hammock')));
});
test('an unmatched question hands off with the question carried over', function () {
  HW.DB = { faq: [] };
  assert(HW.assistant.handlers.handoff('do you ship to Mars').indexOf('Mars') >= 0);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node tools/test-assistant.js`
Expected: FAIL — the handlers are not defined.

- [ ] **Step 3: Implement the three handlers and the router in `js/assistant.js`**

`route(text)` scores against an ordered list of order-intent patterns first (order, parcel, delivery, tracking, dispatched, "where is"), then against `HW.DB.faq` by question and tags, then falls back to `finder` when the text names a category, colour, size or material, and to `handoff` otherwise. Normalise with the same lowercase-and-strip approach `HW.search` uses, so sizes and plurals behave.

`faq(text)` returns the highest-scoring shown entry's answer through `HW.richText`, plus a link to the FAQ page.

`finder(text)` runs `HW.search.run(text)`, filters with `HW.m.listable`, drops anything `HW.m.productOut` reports as out of stock, takes the first four and renders them with `HW.productCard`. With nothing left, returns the handoff block.

`handoff(text)` returns a short line and a link to `HW.link('/page/contact-us')`. Carry the question through `u.session`, not a query string — the no-personal-data-in-URLs rule covers anything a customer typed.

- [ ] **Step 4: Run them and watch them pass**

Run: `node tools/test-assistant.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/assistant.js tools/test-assistant.js
git commit -m "Assistant: faq, product finder, handoff and the router"
```

---

### Task 6: The panel and the launcher

**Files:**
- Modify: `index.html` — add `'assistant'` to the loader `files` list and the panel markup; `admin.html` — the same loader entry
- Modify: `js/chrome.js` — the launcher button
- Modify: `js/app.js` — `data-act` handlers in the existing delegated event layer
- Modify: `css/site.css` — panel and launcher styles

**Interfaces:**
- Consumes: `HW.assistant.route`, `HW.assistant.handlers`, `u.trapFocus`
- Produces: `HW.assistantPanel.open()`, `.close(restore)`, `.ask(text)`

- [ ] **Step 1: Add the panel markup and the launcher**

In `index.html`, beside `<div class="searchpanel" id="searchPanel" …>`, add `<div class="assistpanel" id="assistPanel" role="dialog" aria-modal="true" aria-label="Ask Home Weavers" hidden>` holding a transcript region with `aria-live="polite"`, a form and a close button. Add a header launcher in `js/chrome.js` with `data-act="assist-open"`, `aria-controls="assistPanel"` and `aria-expanded="false"`.

- [ ] **Step 2: Implement `HW.assistantPanel` in `js/assistant.js`**

Follow `HW.searchPanel` in `js/features.js`: `open()` closes the menu, cart and search panel first, unhides, sets `aria-expanded`, traps focus with `u.trapFocus`, focuses the input. `close(restore)` reverses it. `ask(text)` appends the question, calls `route`, awaits the handler and appends the answer into the live region.

- [ ] **Step 3: Write the failing test for the readiness guard**

```js
test('the assistant is not ready before the catalog has loaded', function () {
  HW.DB = {};
  assert(HW.assistant.ready() === false);
  HW.DB = { products: [{ id: 'p1' }], faq: [] };
  assert(HW.assistant.ready() === true);
});
```

Run: `node tools/test-assistant.js`
Expected: FAIL — `HW.assistant.ready` is not a function.

- [ ] **Step 4: Implement `HW.assistant.ready()` and keep the launcher hidden until it passes**

`ready()` returns `true` only when `HW.DB` holds a non-empty `products` array. Render the launcher hidden and unhide it from `HW.paintChrome()` when `HW.assistant.ready()` is true — `paintChrome` only runs once a store is loaded, and the predicate makes that guarantee testable rather than incidental.

Run: `node tools/test-assistant.js`
Expected: PASS

- [ ] **Step 5: Style it**

In `css/site.css`, follow the existing `.searchpanel` rules. Under 720px it is a full-height sheet; inputs inherit the 16px rule already at the end of the file.

- [ ] **Step 6: Verify in the browser**

Run `node tools/build-pages.js`, open the preview, and check at 1280px and 375px: launcher visible, panel opens and traps focus, Escape closes, a known FAQ question answers, a signed-out order question shows the sign-in link, console clean.

- [ ] **Step 7: Commit**

```bash
git add index.html admin.html js/chrome.js js/app.js js/assistant.js css/site.css
git commit -m "Assistant: panel, launcher and styling"
```

---

### Task 7: Draft the FAQ content

**Files:**
- Create: `docs/faq-draft.md`

**Interfaces:**
- Consumes: the policy page bodies in `HW.DB.pages`, the catalog, and `contact_messages`

- [ ] **Step 1: Gather the real questions**

Read the shipping, returns, care, refund and accessibility pages, plus the subjects and bodies in `contact_messages`, and list what customers actually ask.

- [ ] **Step 2: Draft 20 to 30 entries**

Each as `{ q, a, tags }`, every answer traceable to an existing policy page or catalog fact. Where no source exists, write the question and mark the answer for the owner rather than inventing one.

- [ ] **Step 3: Hand it over**

The owner corrects the draft before any entry is loaded. Nothing here ships without that review.

- [ ] **Step 4: Commit**

```bash
git add docs/faq-draft.md
git commit -m "Draft FAQ answers for review"
```

---

### Task 8: Deploy and verify on staging

**Files:**
- Modify: none

- [ ] **Step 1: Build and copy**

Run `node tools/build-pages.js`, copy the changed files to the deploy tree, commit and push. Then run `node tools/build-staging.js staging-store.json` and push the staging tree.

- [ ] **Step 2: Verify on staging, not production**

On the staging site: the launcher appears, a FAQ question answers, a signed-out order question offers sign-in, a signed-in one shows `HW-STAGE-0003`, the finder returns real products, and the console is clean at 375px and 1280px.

- [ ] **Step 3: Commit**

```bash
git commit -m "Deploy the assistant to staging"
```

---

## Not in this plan

Phase B — the `/public/assist` worker route backed by Cloudflare's free Workers AI
allowance — is specified in the design document but is not built here. Phase A is a
complete, shippable product without it, and phase B gets its own plan once the FAQ
answers exist for it to be grounded in.
