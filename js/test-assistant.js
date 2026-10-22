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
