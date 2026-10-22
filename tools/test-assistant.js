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
const only = process.argv[2];

function test(name, fn) {
  if (only && name.indexOf(only) < 0) return;
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(function () { passed++; }, function (e) { failures.push([name, e]); });
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
 * Results
 * ================================================================ */
Promise.resolve().then(function () {
  failures.forEach(function (f) {
    console.error('FAIL  ' + f[0]);
    console.error('      ' + (f[1] && f[1].message));
  });
  console.log((failures.length ? '\n' : '') + passed + ' passed, ' + failures.length + ' failed');
  process.exit(failures.length ? 1 : 0);
});
