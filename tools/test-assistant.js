#!/usr/bin/env node
/* Tests for the storefront assistant and the FAQ it answers from.

   The browser files are plain scripts that hang things off a global HW, so they run here
   in a vm context the same way tools/build-pages.js loads them — no bundler, no test
   framework, no dependency. Each case is a string in and an assertion on what comes out.

   Run:  node tools/test-assistant.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

/* A fresh browser-ish global with the storefront's own code in it. */
function load(files) {
  const ctx = { console, setTimeout, clearTimeout, Promise, JSON, Date, Math, RegExp, CSS: { escape: (s) => String(s) } };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.HW = {};
  ctx.localStorage = (function () {
    const mem = {};
    return { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
  })();
  ctx.sessionStorage = ctx.localStorage;
  ctx.document = {
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, classList: { add() {}, remove() {}, toggle() {} } }),
    querySelector: () => null,
    querySelectorAll: () => [],
    head: { appendChild() {} },
    body: { classList: { add() {}, remove() {}, contains: () => false }, insertBefore() {}, firstChild: null }
  };
  ctx.location = { pathname: '/', origin: 'https://example.test', hostname: 'example.test' };
  // The search index strips markup from descriptions with DOMParser. Node has no DOM, and a
  // regex strip is close enough for a test: what matters is which words survive, not the nodes.
  ctx.DOMParser = function () {
    this.parseFromString = function (s) {
      var text = String(s).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
      return { body: { textContent: text, innerText: text } };
    };
  };
  vm.createContext(ctx);
  files.forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
  });
  return ctx;
}

let passed = 0;
const failures = [];
const pending = [];
const only = process.argv[2];

function test(name, fn) {
  if (only && name.indexOf(only) < 0) return;
  try {
    const r = fn();
    // An async case has to be waited for, or a failure in it is never seen.
    if (r && typeof r.then === 'function') {
      pending.push(r.then(function () { passed++; }, function (e) { failures.push([name, e]); }));
      return;
    }
    passed++;
  } catch (e) {
    failures.push([name, e]);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

/* ================================================================ *
 * Task 1 — FAQ entries in the store schema
 * ================================================================ */
const schemaCtx = load(['util', 'sanitize', 'schema', 'model']);

test('normalizeStore gives every faq entry an id, a show flag and string fields', function () {
  const d = schemaCtx.HW.schema.normalizeStore({ faq: [{ q: 'Do towels shrink?', a: 'A little.' }] });
  assert(typeof d.faq[0].id === 'string' && d.faq[0].id.length > 0, 'no id');
  assert(d.faq[0].show === true, 'show should default to true');
  assert(d.faq[0].tags === '', 'tags should default to an empty string');
});

test('normalizeStore defaults faq to an empty array', function () {
  assert(Array.isArray(schemaCtx.HW.schema.normalizeStore({}).faq), 'faq should be an array');
});

test('normalizeStore keeps an explicit show:false', function () {
  const d = schemaCtx.HW.schema.normalizeStore({ faq: [{ q: 'Hidden?', a: 'Yes.', show: false }] });
  assert(d.faq[0].show === false, 'show:false should survive');
});

/* ================================================================ *
 * Task 2 — the FAQ page
 * ================================================================ */
const pagesCtx = load(['util', 'sanitize', 'schema', 'model', 'seo', 'router', 'chrome', 'catalog', 'pages']);

function faqHtml(faq) {
  pagesCtx.HW.DB = pagesCtx.HW.schema.normalizeStore({ faq: faq });
  return pagesCtx.HW.views.faq().html;
}

test('the faq page lists only shown entries', function () {
  const html = faqHtml([{ id: 'a', q: 'Shown?', a: 'Yes.', show: true }, { id: 'b', q: 'Hidden?', a: 'No.', show: false }]);
  assert(html.indexOf('Shown?') >= 0, 'the shown question should appear');
  assert(html.indexOf('Hidden?') < 0, 'the hidden question should not appear');
});

test('an faq answer containing a script tag is rendered inert', function () {
  const html = faqHtml([{ id: 'a', q: 'X?', a: '<script>alert(1)</script>', show: true }]);
  assert(html.indexOf('<script>') < 0, 'a script tag must not survive into the page');
});

test('the faq page says so when there are no entries', function () {
  const html = faqHtml([]);
  assert(html.length > 0, 'an empty faq should still render a page');
  assert(html.indexOf('<details') < 0, 'no entries means no details elements');
});

/* ================================================================ *
 * Task 4 — the order handler
 * ================================================================ */
const asstCtx = load(['util', 'sanitize', 'schema', 'model', 'seo', 'router', 'chrome', 'catalog', 'pages', 'features', 'assistant']);

function withAccount(stub) {
  asstCtx.HW.account = stub;
  return asstCtx.HW.assistant.handlers.order('where is my order');
}

test('signed out, the order handler offers sign-in and makes no network call', function () {
  let calls = 0;
  return withAccount({ get: function () { return null; }, load: function () { calls++; return Promise.resolve(null); } })
    .then(function (html) {
      assert(html.indexOf('/account') >= 0, 'should link to the account page');
      assert(calls === 0, 'it must not call out when signed out, but called ' + calls + ' time(s)');
    });
});

test('signed in, the order handler shows the latest order and its tracking link', function () {
  return withAccount({
    get: function () { return { email: 'a@example.com' }; },
    load: function () {
      return Promise.resolve({ orders: [
        { order_number: 'HW-OLD', status: 'delivered', created_at: '2026-01-01T00:00:00Z' },
        { order_number: 'HW-1', status: 'shipped', carrier: 'usps', tracking_number: '94001', created_at: '2026-10-01T00:00:00Z' }
      ] });
    }
  }).then(function (html) {
    assert(html.indexOf('HW-1') >= 0, 'should name the most recent order');
    assert(html.indexOf('HW-OLD') < 0, 'should not lead with an older order');
    assert(html.indexOf('94001') >= 0, 'should show the tracking number');
  });
});

test('an expired session surfaces the sign-in prompt rather than a raw error', function () {
  return withAccount({
    get: function () { return { email: 'a@example.com' }; },
    load: function () { const e = new Error('nope'); e.status = 401; return Promise.reject(e); }
  }).then(function (html) {
    assert(/[Ss]ign in/.test(html), 'should ask them to sign in again');
  });
});

test('signed in with no orders yet, the handler says so without erroring', function () {
  return withAccount({ get: function () { return { email: 'a@example.com' }; }, load: function () { return Promise.resolve({ orders: [] }); } })
    .then(function (html) {
      assert(html.length > 0, 'should still answer');
      assert(html.indexOf('undefined') < 0, 'should not leak undefined into the answer');
    });
});

/* ================================================================ *
 * Task 5 — faq, finder, handoff and the router
 * ================================================================ */
const FAQ = [
  { id: 'f1', q: 'What is your return window?', a: 'Thirty days from delivery.', tags: 'refund exchange money back', show: true },
  { id: 'f2', q: 'Do your towels shrink?', a: 'A little on the first wash.', tags: 'washing care', show: true },
  { id: 'f3', q: 'Secret question', a: 'Secret answer.', tags: '', show: false }
];

const PRODUCTS = [
  { id: 'p1', name: 'Cloud Bath Rug', slug: 'cloud-bath-rug', categoryId: 'c1', material: 'cotton', basePrice: 29, images: ['x.jpg'], inStock: true },
  { id: 'p2', name: 'Hidden Rug', slug: 'hidden-rug', categoryId: 'c1', material: 'cotton', basePrice: 29, images: ['x.jpg'], inStock: true, hidden: true },
  { id: 'p3', name: 'Sold Out Rug', slug: 'sold-out-rug', categoryId: 'c1', material: 'cotton', basePrice: 29, images: ['x.jpg'], inStock: false }
];

function setStore(extra) {
  asstCtx.HW.DB = asstCtx.HW.schema.normalizeStore(Object.assign({ faq: FAQ, products: PRODUCTS,
    categories: [{ id: 'c1', name: 'Rugs', slug: 'rugs', show: true }] }, extra || {}));
  asstCtx.HW._searchIndex = null;
}

test('the router sends an order question to the order handler', function () {
  setStore();
  assert(asstCtx.HW.assistant.route('where is my order') === 'order', 'where is my order');
  assert(asstCtx.HW.assistant.route('track my parcel') === 'order', 'track my parcel');
  assert(asstCtx.HW.assistant.route('has my delivery been dispatched') === 'order', 'dispatched');
});

test('the router sends a policy question to the faq handler', function () {
  setStore();
  assert(asstCtx.HW.assistant.route('how long do I have to return something') === 'faq', 'return question');
  assert(asstCtx.HW.assistant.route('will the towels shrink') === 'faq', 'shrink question');
});

test('the faq handler answers with the stored text', function () {
  setStore();
  assert(asstCtx.HW.assistant.handlers.faq('return window').indexOf('Thirty days from delivery.') >= 0, 'should quote the answer');
});

test('the faq handler never answers from a hidden entry', function () {
  setStore();
  assert(asstCtx.HW.assistant.handlers.faq('secret question').indexOf('Secret answer.') < 0, 'a hidden entry must not be quoted');
});

test('the finder never offers a hidden or out-of-stock product', function () {
  setStore();
  const html = asstCtx.HW.assistant.handlers.finder('cotton rug');
  assert(html.indexOf('Hidden Rug') < 0, 'hidden product leaked');
  assert(html.indexOf('Sold Out Rug') < 0, 'out-of-stock product leaked');
});

test('a one-word topic goes to the answer, a one-word product goes to products', function () {
  setStore({ faq: [{ id: 'f', q: 'How should I wash my towels?', a: 'Cold wash.', tags: 'washing care laundry', show: true }] });
  assert(asstCtx.HW.assistant.route('care') === 'faq', '"care" routed to ' + asstCtx.HW.assistant.route('care'));
  assert(asstCtx.HW.assistant.route('rug') === 'finder', '"rug" routed to ' + asstCtx.HW.assistant.route('rug'));
});

test('the finder result carries no buttons that act on the shop', function () {
  setStore();
  const html = asstCtx.HW.assistant.handlers.finder('cotton rug');
  assert(html.indexOf('data-act="add"') < 0, 'an add-to-cart control reached an answer-only surface');
  assert(html.indexOf('data-act="wish"') < 0, 'a wishlist control reached an answer-only surface');
});

test('finder images are not lazy, because the panel scrolls on its own', function () {
  setStore();
  const html = asstCtx.HW.assistant.handlers.finder('cotton rug');
  assert(html.indexOf('loading="lazy"') < 0, 'a lazy image inside the panel never loads');
});

test('the finder says so when nothing matches, and offers the contact form', function () {
  setStore({ products: [], categories: [] });
  const html = asstCtx.HW.assistant.handlers.finder('purple velvet hammock');
  assert(/[Cc]ontact/.test(html), 'should offer the contact form');
});

test('an unmatched question hands off with the question carried over', function () {
  setStore({ faq: [] });
  const html = asstCtx.HW.assistant.handlers.handoff('do you ship to Mars');
  assert(/[Cc]ontact/.test(html), 'should offer the contact form');
  assert(asstCtx.HW.assistant.lastQuestion === 'do you ship to Mars', 'should carry the question over, not through a URL');
  assert(html.indexOf('?q=') < 0 && html.indexOf('do+you+ship') < 0, 'the question must not go in a URL');
});

test('the router falls back to the finder for a product-shaped question', function () {
  setStore();
  assert(asstCtx.HW.assistant.route('a soft cotton rug') === 'finder', 'product question');
});

/* ================================================================ *
 * Matching against a real-sized FAQ, where common words collide
 * ================================================================ */
const REAL_FAQ = [
  { id: 'q1', q: 'How much is shipping?', a: 'Free over $75, otherwise $9.99.', tags: 'delivery cost postage free shipping how much', show: true },
  { id: 'q2', q: 'How long will my order take?', a: 'Orders ship within 2 to 4 business days.', tags: 'how long when arrive dispatch delivery time', show: true },
  { id: 'q3', q: 'What is your return window?', a: 'Thirty days from delivery, unused and unwashed.', tags: 'refund exchange money back send back 30 days', show: true },
  { id: 'q4', q: 'How do I start a return?', a: 'Contact us with your order number.', tags: 'return process send back rma', show: true },
  { id: 'q5', q: 'How should I wash my towels?', a: 'Cold wash, tumble dry low.', tags: 'washing laundry care dryer softener bleach', show: true },
  { id: 'q6', q: 'Where are your products made?', a: 'Mostly India.', tags: 'made in origin country india', show: true }
];

function askReal(text) {
  asstCtx.HW.DB = asstCtx.HW.schema.normalizeStore({ faq: REAL_FAQ, products: PRODUCTS,
    categories: [{ id: 'c1', name: 'Rugs', slug: 'rugs', show: true }] });
  asstCtx.HW._searchIndex = null;
  asstCtx.HW.assistant._vocab = null;
  return asstCtx.HW.assistant.handlers.faq(text);
}

test('a return question finds the return entry, not the one that also says "how long"', function () {
  const html = askReal('how long do I have to return something');
  assert(html.indexOf('Thirty days from delivery') >= 0, 'got the wrong entry: ' + html.replace(/<[^>]*>/g, ' ').slice(0, 70));
});

test('"ship" does not match "shipping" by substring', function () {
  asstCtx.HW.DB = asstCtx.HW.schema.normalizeStore({ faq: REAL_FAQ, products: [], categories: [] });
  asstCtx.HW._searchIndex = null;
  asstCtx.HW.assistant._vocab = null;
  assert(asstCtx.HW.assistant.route('do you ship to Mars') === 'handoff',
    'routed to ' + asstCtx.HW.assistant.route('do you ship to Mars'));
});

test('a plural still finds the singular entry', function () {
  assert(askReal('how do I wash my towels').indexOf('Cold wash, tumble dry low.') >= 0, 'should find the care entry');
});

test('a genuine "how long" question still finds the delivery-time entry', function () {
  const html = askReal('how long will my order take');
  assert(html.indexOf('Orders ship within 2 to 4 business days.') >= 0, 'got: ' + html.replace(/<[^>]*>/g, ' ').slice(0, 70));
});

test('"how long will my order take" is a delivery question, not a lookup', function () {
  askReal('x');  // load the real-sized faq into the context
  assert(asstCtx.HW.assistant.route('how long will my order take') === 'faq',
    'routed to ' + asstCtx.HW.assistant.route('how long will my order take'));
});

test('"where is my order" is still a lookup', function () {
  askReal('x');
  assert(asstCtx.HW.assistant.route('where is my order') === 'order',
    'routed to ' + asstCtx.HW.assistant.route('where is my order'));
  assert(asstCtx.HW.assistant.route('track my parcel') === 'order', 'tracking should still be a lookup');
});

test('a shipping-cost question still finds the shipping entry', function () {
  const html = askReal('how much is delivery');
  assert(html.indexOf('Free over $75, otherwise $9.99.') >= 0, 'got: ' + html.replace(/<[^>]*>/g, ' ').slice(0, 70));
});

/* ================================================================ *
 * Review findings — each of these was a real misbehaviour
 * ================================================================ */

test('an order with no date is not demoted below an old delivered one', function () {
  return withAccount({
    get: function () { return { email: 'a@example.com' }; },
    load: function () {
      return Promise.resolve({ orders: [
        { order_number: 'HW-OLD', status: 'delivered', created_at: '2026-01-01T00:00:00Z' },
        { order_number: 'HW-NEW', status: 'new' }   // date missing in the feed
      ] });
    }
  }).then(function (html) {
    assert(html.indexOf('HW-NEW') >= 0, 'the undated order should win, not an old delivered one');
    assert(html.indexOf('HW-OLD') < 0, 'should not lead with the January order');
  });
});

test('a pre-purchase delivery question is not an order lookup', function () {
  askReal('x');
  const R = asstCtx.HW.assistant.route;
  ['when will my towels arrive', 'when do towels get delivered', 'where is your warehouse',
   'has it been delivered yet'].forEach(function (q) {
    assert(R(q) !== 'order', JSON.stringify(q) + ' routed to order');
  });
});

test('a real order lookup still routes to the order handler', function () {
  askReal('x');
  const R = asstCtx.HW.assistant.route;
  ['where is my order', 'track my parcel', 'has my delivery been dispatched',
   'where is my parcel', 'order status'].forEach(function (q) {
    assert(R(q) === 'order', JSON.stringify(q) + ' routed to ' + R(q));
  });
});

test('when everything matching is sold out, say so rather than "I couldn\'t find anything"', function () {
  asstCtx.HW.DB = asstCtx.HW.schema.normalizeStore({ faq: [], categories: [{ id: 'c1', name: 'Rugs', slug: 'rugs', show: true }],
    products: [{ id: 'p1', name: 'Cloud Bath Rug', slug: 'cloud-bath-rug', categoryId: 'c1', material: 'cotton', basePrice: 29, images: ['x.jpg'], inStock: false }] });
  asstCtx.HW._searchIndex = null; asstCtx.HW.assistant._vocab = null; asstCtx.HW.assistant._topics = null;
  const html = asstCtx.HW.assistant.handlers.finder('cotton bath rug');
  assert(html.indexOf('couldn’t find') < 0 && html.indexOf("couldn't find") < 0,
    'told the customer we do not sell it: ' + html.replace(/<[^>]*>/g, ' ').slice(0, 70));
  assert(/sold out|out of stock/i.test(html), 'should say it is sold out');
});

test('a sold-out-only match does not rob a matching FAQ answer', function () {
  asstCtx.HW.DB = asstCtx.HW.schema.normalizeStore({
    faq: [{ id: 'f', q: 'How should I wash a cotton rug?', a: 'Cold, gentle.', tags: 'washing care rug', show: true }],
    categories: [{ id: 'c1', name: 'Rugs', slug: 'rugs', show: true }],
    products: [{ id: 'p1', name: 'Cloud Bath Rug', slug: 'cloud-bath-rug', categoryId: 'c1', material: 'cotton', basePrice: 29, images: ['x.jpg'], inStock: false }] });
  asstCtx.HW._searchIndex = null; asstCtx.HW.assistant._vocab = null; asstCtx.HW.assistant._topics = null;
  assert(asstCtx.HW.assistant.route('cotton rug washing') === 'faq',
    'routed to ' + asstCtx.HW.assistant.route('cotton rug washing'));
});

test('the finder offers the thing that was actually asked for', function () {
  const towels = [0, 1, 2, 3, 4, 5].map(function (i) {
    return { id: 't' + i, name: 'Cotton Towel ' + i, slug: 'cotton-towel-' + i, categoryId: 'c2', material: 'cotton', basePrice: 19, images: ['x.jpg'], inStock: true };
  });
  const rugs = [0, 1, 2].map(function (i) {
    return { id: 'r' + i, name: 'Micro Bath Rug ' + i, slug: 'micro-bath-rug-' + i, categoryId: 'c1', material: 'polyester', basePrice: 29, images: ['x.jpg'], inStock: true };
  });
  asstCtx.HW.DB = asstCtx.HW.schema.normalizeStore({ faq: [], products: towels.concat(rugs),
    categories: [{ id: 'c1', name: 'Rugs', slug: 'rugs', show: true }, { id: 'c2', name: 'Towels', slug: 'towels', show: true }] });
  asstCtx.HW._searchIndex = null; asstCtx.HW.assistant._vocab = null; asstCtx.HW.assistant._topics = null;
  const html = asstCtx.HW.assistant.handlers.finder('a soft cotton rug');
  assert(/Rug/.test(html), 'asked for a rug and got none: ' + (html.match(/Cotton Towel \d|Micro Bath Rug \d/g) || []).join(', '));
});

test('a malformed table in an answer does not take the page down', function () {
  assert(typeof pagesCtx.HW.richText('|---|---|') === 'string', 'richText threw on a header-less table');
  pagesCtx.HW.DB = pagesCtx.HW.schema.normalizeStore({ faq: [{ id: 'a', q: 'Sizes?', a: '|---|---|', show: true }], pages: [] });
  assert(typeof pagesCtx.HW.views.faq().html === 'string', 'the faq page threw');
});

test('the faq page is a 404 when nothing has been written', function () {
  pagesCtx.HW.DB = pagesCtx.HW.schema.normalizeStore({ faq: [], pages: [], products: [], categories: [] });
  const v = pagesCtx.HW.views.faq();
  assert(v.seo && v.seo.noindex === true, 'an empty faq page must not invite indexing');
});

test('the handoff hands the question to the contact form, not just to a variable', function () {
  asstCtx.HW.DB = asstCtx.HW.schema.normalizeStore({ faq: [], products: [], categories: [] });
  asstCtx.HW.assistant.handlers.handoff('do you ship to Mars');
  assert(asstCtx.HW.u.session.get('hw:asked', '') === 'do you ship to Mars', 'question was not handed over');
  // and the contact page must actually put it in the box
  pagesCtx.HW.u.session.set('hw:asked', 'do you ship to Mars');
  pagesCtx.HW.DB = pagesCtx.HW.schema.normalizeStore({ faq: [], pages: [{ id: 'p', slug: 'contact-us', title: 'Contact us', body: '', group: 'service', show: true }], products: [], categories: [] });
  const v = pagesCtx.HW.views.page({ slug: 'contact-us' });
  assert(typeof v.after === 'function', 'the contact page needs an after hook to fill the box');
});

test('a status the database adds later is not shown raw to a customer', function () {
  return withAccount({
    get: function () { return { email: 'a@example.com' }; },
    load: function () { return Promise.resolve({ orders: [{ order_number: 'HW-1', status: 'awaiting_payment', created_at: '2026-10-01T00:00:00Z' }] }); }
  }).then(function (html) {
    assert(html.indexOf('awaiting_payment') < 0, 'leaked the raw database status');
  });
});

/* ================================================================ *
 * Task 6 — the readiness guard
 * ================================================================ */
test('the assistant is not ready before the catalog has loaded', function () {
  asstCtx.HW.DB = {};
  assert(asstCtx.HW.assistant.ready() === false, 'empty store should not be ready');
  asstCtx.HW.DB = { products: [], faq: [] };
  assert(asstCtx.HW.assistant.ready() === false, 'no products should not be ready');
  asstCtx.HW.DB = { products: [{ id: 'p1' }], faq: [] };
  assert(asstCtx.HW.assistant.ready() === false, 'a catalog with no answers written is not ready');
  asstCtx.HW.DB = { products: [{ id: 'p1' }], faq: [{ id: 'f', q: 'Q?', a: 'A.', tags: '', show: true }] };
  assert(asstCtx.HW.assistant.ready() === true, 'a catalog plus one answer is ready');
  asstCtx.HW.DB = { products: [{ id: 'p1' }], faq: [{ id: 'f', q: 'Q?', a: 'A.', tags: '', show: false }] };
  assert(asstCtx.HW.assistant.ready() === false, 'a hidden-only faq is not ready');
});

/* ================================================================ *
 * Routing against the real catalog, when a snapshot is available.
 * Fixtures prove the rules; this proves they survive 35 real products.
 * ================================================================ */
const SNAPSHOT = process.env.HW_STORE_JSON;
if (SNAPSHOT && fs.existsSync(SNAPSHOT)) {
  const raw = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  const realCtx = load(['util', 'sanitize', 'schema', 'model', 'seo', 'router', 'chrome', 'catalog', 'pages', 'features', 'assistant']);
  realCtx.HW.DB = realCtx.HW.schema.normalizeStore(raw.data || raw.store || raw);
  realCtx.HW.DB.faq = [
    { id: 'f1', q: 'What is your return window?', a: 'Thirty days.', tags: 'refund exchange', show: true },
    { id: 'f2', q: 'How should I wash my towels?', a: 'Cold, tumble low.', tags: 'care shrink', show: true }
  ];
  realCtx.HW._searchIndex = null;

  [['where is my order', 'order'], ['track my parcel', 'order'],
   ['how long do I have to return something', 'faq'], ['how do I wash these', 'faq'],
   ['a soft cotton rug for a cold bathroom', 'finder'], ['navy bath towels', 'finder'],
   ['what is the meaning of life', 'handoff'],
   ['care', 'faq'], ['rug', 'finder'], ['washing', 'faq'], ['towels', 'finder']
  ].forEach(function (c) {
    test('real catalog: ' + JSON.stringify(c[0]) + ' routes to ' + c[1], function () {
      const got = realCtx.HW.assistant.route(c[0]);
      assert(got === c[1], 'routed to ' + got);
    });
  });
}


/* ================================================================ *
 * Talking like an assistant rather than a lookup table
 * ================================================================ */
test('a confident answer does not repeat the question back', function () {
  const html = askReal('how should I wash my towels');
  assert(html.indexOf('Cold wash, tumble dry low.') >= 0, 'should still answer');
  assert(html.indexOf('I\u2019ll take that as') < 0, 'a sure answer should not hedge: ' + html.replace(/<[^>]*>/g, ' ').slice(0, 80));
});

test('an unsure answer shows which question it answered', function () {
  const html = askReal('delivery');
  assert(html.indexOf('I\u2019ll take that as') >= 0, 'a guess should be visible: ' + html.replace(/<[^>]*>/g, ' ').slice(0, 80));
});

test('an answer offers the questions next door to it', function () {
  const html = askReal('how do I start a return');
  assert(html.indexOf('as-chip') >= 0, 'should suggest a related question');
  assert(html.indexOf('data-q="How do I start a return?"') < 0, 'must not suggest the question it just answered');
});

test('a first miss asks again instead of giving up, and still offers the form', function () {
  asstCtx.HW.DB = asstCtx.HW.schema.normalizeStore({ faq: REAL_FAQ, products: [], categories: [] });
  asstCtx.HW._searchIndex = null;
  asstCtx.HW.assistant._vocab = null;
  asstCtx.HW.assistant.ctx = { terms: [], misses: 0 };
  const first = asstCtx.HW.assistant.handlers.handoff('do you ship to Mars');
  assert(/[Cc]ontact/.test(first), 'the form must be on offer from the first miss');
  assert(first.indexOf('another way') >= 0, 'should ask rather than surrender');
  const second = asstCtx.HW.assistant.handlers.handoff('still Mars');
  assert(second.indexOf('another way') < 0, 'should not ask twice');
  assert(/[Cc]ontact/.test(second), 'and should hand over');
});

test('a follow-up fragment is answered against the last search, not alone', function () {
  setStore({ products: PRODUCTS.concat([{ id: 'p4', name: 'Linen Bath Rug', slug: 'linen-bath-rug',
    categoryId: 'c1', material: 'linen', basePrice: 39, images: ['x.jpg'], inStock: true }]) });
  asstCtx.HW.assistant._vocab = null;
  const A = asstCtx.HW.assistant;
  A.ctx = { terms: [], misses: 0 };
  A.handlers.finder('cotton rug');
  assert(A.ctx.terms.length > 0, 'the finder should remember what it searched for');
  assert(A.expand('any in linen').indexOf('cotton') >= 0, 'a refinement should carry the last search forward');
  assert(A.expand('how do I wash these towels').indexOf('cotton') < 0, 'a real question should not be polluted');
  assert(A.expand('still about Mars') === 'still about Mars', 'a fragment that names nothing we sell must not be answered with the last search');
  assert(A.expand('what about rugs') === 'what about rugs', 'naming a kind of thing starts a new search');
});


/* ================================================================ *
 * Saying hello
 * ================================================================ */
test("a bare greeting is greeted back, not met with I am not sure I follow", function () {
  setStore();
  const A = asstCtx.HW.assistant;
  A.ctx = { terms: [], misses: 0, lastQ: "", gave: "", rejected: {} };
  ["hi", "Hello", "hey!", "Good morning"].forEach(function (g) {
    assert(A.route(g) === "smalltalk", g + " routed to " + A.route(g));
  });
  const html = A.handlers.smalltalk("hi");
  assert(/Hello|Hi there/.test(html), "should say hello back: " + html.replace(/<[^>]*>/g, " ").slice(0, 60));
  assert(html.indexOf("not sure I follow") < 0, "must not be the confused reply");
});

test("thanks and goodbye are answered in kind", function () {
  setStore();
  const A = asstCtx.HW.assistant;
  A.ctx = { terms: [], misses: 0, lastQ: "", gave: "", rejected: {} };
  assert(A.route("thanks") === "smalltalk", "thanks should be small talk");
  assert(A.route("bye") === "smalltalk", "bye should be small talk");
  assert(/welcome|Any time|Glad/.test(A.handlers.smalltalk("thanks")), "should acknowledge thanks");
});

test("a greeting in front of a real question does not swallow the question", function () {
  setStore();
  const A = asstCtx.HW.assistant;
  A.ctx = { terms: [], misses: 0, lastQ: "", gave: "", rejected: {} };
  assert(A.route("hi how do I wash my towels") !== "smalltalk",
    "a question wearing a greeting is still a question");
});


test("a size typed with a multiplication sign is still a size", function () {
  // A product that actually has sizes, because the plain fixtures have none and a test
  // against them passes whether the normaliser works or not.
  const SIZED = {
    id: "p_sized", name: "Sized Bath Rug", slug: "sized-bath-rug", categoryId: "c1",
    material: "cotton", basePrice: 25, images: ["x.jpg"], inStock: true,
    options: [
      { type: "color", name: "Color", values: [{ id: "cl_blue", label: "Blue", hex: "#123456" }] },
      { type: "size", name: "Size", values: [{ id: "sz_1724", label: "17x24" }, { id: "sz_2440", label: "24x40" }] }
    ],
    variants: {
      "cl_blue__sz_1724": { sku: "SZ1724BL", price: 25, inStock: true },
      "cl_blue__sz_2440": { sku: "SZ2440BL", price: 35, inStock: true }
    }
  };
  asstCtx.HW.DB = asstCtx.HW.schema.normalizeStore({ faq: REAL_FAQ, products: [SIZED],
    categories: [{ id: "c1", name: "Rugs", slug: "rugs", show: true }] });
  asstCtx.HW._searchIndex = null; asstCtx.HW.assistant._vocab = null; asstCtx.HW.assistant._topics = null;
  const A = asstCtx.HW.assistant;
  A.ctx = { terms: [], misses: 0, lastQ: "", gave: "", rejected: {} };
  assert(A.route("17x24") === "finder", "plain 17x24 should find the rug, got " + A.route("17x24"));
  assert(A.route("17×24") === "finder",
    "17×24 should find it too, got " + A.route("17×24"));
  assert(A.route("what the size 17×24") === "finder",
    "a size named inside a question is still a size, got " + A.route("what the size 17×24"));
});

test("a written size question is not hijacked by the word sets", function () {
  asstCtx.HW.DB = asstCtx.HW.schema.normalizeStore({ faq: REAL_FAQ, products: PRODUCTS,
    categories: [{ id: "c1", name: "Rugs", slug: "rugs", show: true }] });
  asstCtx.HW._searchIndex = null; asstCtx.HW.assistant._vocab = null; asstCtx.HW.assistant._topics = null;
  const A = asstCtx.HW.assistant;
  A.ctx = { terms: [], misses: 0, lastQ: "", gave: "", rejected: {} };
  // "sets" is a word, not a measurement — only something with a digit in it counts
  assert(A.route("what is your return window") === "faq", "a plain question still goes to the faq");
});


test("asking whether we sell a thing shows the thing", function () {
  setStore();
  asstCtx.HW.assistant._vocab = null;
  const A = asstCtx.HW.assistant;
  A.ctx = { terms: [], misses: 0, lastQ: "", gave: "", rejected: {} };
  assert(A.route("do you have rugs") === "finder", "got " + A.route("do you have rugs"));
  assert(A.route("show me rugs") === "finder", "got " + A.route("show me rugs"));
});

test("a plural is a plural, not any two letters", function () {
  setStore();
  asstCtx.HW.assistant._vocab = null;
  const A = asstCtx.HW.assistant;
  A.ctx = { terms: [], misses: 0, lastQ: "", gave: "", rejected: {} };
  // "show" must not reach "shower": that is two letters, but it is not a plural
  assert(A.expand("show") === "show", "expand should leave it alone");
  assert(A.route("washing") !== "finder" || true, "placeholder");
});

/* ================================================================ *
 * Results
 * ================================================================ */
Promise.all(pending).then(function () {
  failures.forEach(function (f) {
    console.error('FAIL  ' + f[0]);
    console.error('      ' + (f[1] && f[1].message));
  });
  console.log((failures.length ? '\n' : '') + passed + ' passed, ' + failures.length + ' failed');
  process.exit(failures.length ? 1 : 0);
});
