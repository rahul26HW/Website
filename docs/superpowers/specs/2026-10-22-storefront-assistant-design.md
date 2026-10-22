# Storefront assistant — design

**Date:** 2026-10-22
**Status:** approved for planning

## What it is

A customer-facing assistant on the Home Weavers storefront that answers questions,
tells a signed-in customer where their order is, and suggests products. It costs
nothing to run and cannot be made to cost anything.

It ships in two phases. Phase A is deterministic and is a complete product on its
own. Phase B adds natural-language understanding through Cloudflare's free Workers
AI allowance, which stops answering rather than billing when the allowance runs out.
If phase B is never built, nothing is missing.

## Why this shape

Three jobs with three different data sensitivities. Answers come from text we wrote.
Order status comes from one customer's own records. Suggestions come from the public
catalog. Keeping them as separate handlers means the one that touches personal data
is a single function with a single call in it, and the privacy boundary is a property
of the structure rather than something a prompt has to be trusted to respect.

The assistant answers; it never acts. Cancelling an order, starting a return, changing
an address and applying a code all stay in the account section, where they already have
their own confirmations.

## Components

One new file, `js/assistant.js`, added to the loader list in `index.html` and
`admin.html`, following the shape of `js/features.js`. A launcher button in the header
and a block of CSS in `css/site.css`. Nothing else in the storefront changes.

The panel is built the way `HW.searchPanel` already is: `u.trapFocus`, `hidden`
toggling, Escape to close, existing drawer styling. No new dependency.

### Handlers

Each is a plain function: typed text in, rendered HTML out.

| Handler | Source of truth | Needs sign-in |
|---|---|---|
| `faq` | `HW.DB.faq` | no |
| `order` | `/account/orders` via `HW.account.call` | yes |
| `finder` | catalog via `HW.search` and `HW.m` | no |
| `handoff` | contact form, prefilled | no |

### Router

Picks the handler. Phase A scores keywords with the technique already proven in
`HW.search.run`, which handles synonyms, plurals and sizes. Phase B consults the
model here, and only here, plus rephrasing a retrieved FAQ passage.

## Data flow

**FAQ.** Text scored against `HW.DB.faq`, the matching answer rendered verbatim,
with a link to the contact form. Nothing leaves the browser.

**Order.** The handler calls `HW.account.get()`. With no live session it shows a
sign-in link and stops — it never asks for an email or an order number. Signed in,
it calls `HW.account.call('/account/orders')` with the customer's own bearer token,
exactly as the account page does. The worker returns only that customer's orders;
the database rules decide, not the assistant. It renders status, date, tracking link
and a button through to the order page.

Nothing is stored, logged, or put in a URL. In phase B this handler still makes no
model call: the model may route a question to it, but never sees what comes back.

**Finder.** A guided flow — room, size, then colour or material — filtered from the
live catalog through `m.visibleCategories()` and the existing size and colour options,
so it can only offer products that exist and are in stock. Ends in 3–4 cards rendered
with `HW.productCard`. Free text runs through `HW.search.run`, which already indexes
material, colour and size.

**No match.** The contact form, prefilled with the question. A dead end that captures
the question beats a guess, and it shows what to add to the FAQ next.

### The boundary

Personal data flows only through existing authenticated endpoints, and only to the
screen of the signed-in owner. The FAQ and catalog are already public. There is no
third path in either phase.

## Content model

FAQ entries live in the store JSON as `DB.faq`, each `{ id, q, a, tags, show }`.
They version, back up and restore with everything else and need no new table. The
same entries render a real `/page/faq` page with proper markup, so the answers are
indexable and linkable rather than trapped in a widget.

Admin editing is a new FAQ section inside the existing Pages tab (`js/admin/tab-pages.js`):
add, reorder, hide and edit an entry, with the same save path as a page.

## Limits

Phase A adds no endpoint; every call it makes is one the site already makes, so there
is nothing new to limit.

Phase B adds one public route and it gets a per-visitor limit, a hard daily counter
that stops short of the free allowance, a short max-tokens ceiling, and a refusal to
run when the model key is absent. The failure mode is falling back to phase A
behaviour, never a growing bill.

## Failure handling

| What breaks | What the customer sees |
|---|---|
| No FAQ match | Contact form, question prefilled |
| Not signed in, asks about an order | Sign-in link; never a prompt for email or order number |
| Session expired mid-question | Existing `expired()` path: signed out, asked to sign in again |
| Worker unreachable | The existing "couldn't reach the store" message |
| Catalog still loading | Launcher stays hidden until `HW.DB` is populated |
| Phase B model down or capped | Drops silently to keyword routing |

## Accessibility and mobile

Focus trapped while open, Escape closes, answers in an `aria-live` region, launcher
reachable by keyboard. Full-height sheet under 720px, inputs at 16px so iOS does not
zoom — the rule already at the end of `css/site.css`.

## Testing

`tools/test-assistant.js`, run with plain `node`, loading the handlers into a `vm`
context with a fixture store — the pattern `tools/build-pages.js` already uses for
`util`, `sanitize`, `schema` and `model`. Each case is a string in and an assertion
on what comes out:

- a known question finds its entry
- an unknown question hands off to the contact form
- an order question with no session returns the sign-in prompt and makes no network
  call, proven with a stubbed `HW.account`
- the finder never offers a hidden or out-of-stock product

## Phase B

One route, `/public/assist`, on the worker. It receives the question and the five
highest-scoring FAQ entries and returns either a chosen handler or a rephrased passage. It
is never given order data, customer identity, or anything beyond public catalog and
FAQ text.

Cloudflare Workers AI, free plan: 10,000 Neurons a day, reset at midnight UTC, hard
rate limit rather than overage billing. `ai-proxy.worker.js` is already written as a
Cloudflare Worker, so this is the runtime it was built for.

## Out of scope

No chat history stored anywhere. No server-side session for the assistant. No
analytics on what people type beyond the counters that already exist. No third-party
widget. The assistant takes no action on a customer's behalf.

## Open question for the owner

The FAQ answers have to be true, so they cannot be invented. First draft comes from
the existing policy pages, the catalog, and the questions already sitting in
`contact_messages`; the owner corrects them before anything ships.
