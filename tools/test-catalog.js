#!/usr/bin/env node
/* Tests for the category page's filters.

   Same approach as tools/test-assistant.js: the browser files are plain scripts that hang
   things off a global HW, so they run here in a vm context the way tools/build-pages.js
   loads them. No bundler, no framework, no dependency.

   Run:  node tools/test-catalog.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function load(files) {
  const ctx = { console, setTimeout, clearTimeout, Promise, JSON, Date, Math, RegExp, URL, URLSearchParams, Set, Infinity,
    CSS: { escape: (s) => String(s) } };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.HW = {};
  ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  ctx.sessionStorage = ctx.localStorage;
  ctx.document = {
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, classList: { add() {}, remove() {}, toggle() {} } }),
    querySelector: () => null, querySelectorAll: () => [],
    head: { appendChild() {} },
    body: { classList: { add() {}, remove() {}, contains: () => false }, insertBefore() {}, firstChild: null }
  };
  ctx.location = { pathname: '/', search: '', href: 'https://example.test/', origin: 'https://example.test', hostname: 'example.test' };
  ctx.history = { replaceState() {}, state: null };
  ctx.DOMParser = function () {
    this.parseFromString = function (s) {
      const text = String(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
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
function test(name, fn) { try { fn(); passed++; } catch (e) { failures.push([name, e]); } }
function assert(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }

const C = load(['util', 'sanitize', 'schema', 'model', 'seo', 'router', 'chrome', 'catalog']);
const HW = C.HW;

/* A rug sold in several sizes and two colours, and a towel sold in sets. */
function collection(id, name, catId, sizes, colors) {
  const variants = {};
  colors.forEach(function (c) {
    sizes.forEach(function (s) {
      variants['cl_' + c.id + '__sz_' + s.id] = { sku: (id + '-' + c.id + '-' + s.id).toUpperCase(), upc: '', dims: {}, weight: 1 };
    });
  });
  return { id: id, name: name, slug: id.replace(/_/g, '-'), categoryId: catId, material: '100% Cotton',
    basePrice: 29, images: ['x.jpg'], inStock: true,
    options: [{ name: 'Color', type: 'color', values: colors }, { name: 'Size', type: 'size', values: sizes }],
    variants: variants };
}

const SZ = function (label) { return { id: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'), label: label }; };
const CL = function (label, hex) { return { id: label.toLowerCase(), label: label, hex: hex }; };

function store() {
  return HW.schema.normalizeStore({
    categories: [{ id: 'c_rugs', name: 'Rugs', slug: 'rugs', show: true, subcategories: [] }],
    products: [
      collection('p_small', 'Small Rug', 'c_rugs', [SZ('17x24'), SZ('21x34')], [CL('Blue', '#7A9CC0')]),
      collection('p_big', 'Big Rug', 'c_rugs', [SZ('21x34'), SZ('24x40')], [CL('Grey', '#999999')]),
      collection('p_round', 'Round Rug', 'c_rugs', [SZ('22" Round')], [CL('Blue', '#7A9CC0')])
    ]
  });
}

test('offeredSizes lists the sizes a product is actually sold in', function () {
  HW.DB = store();
  const p = HW.DB.products.find(function (x) { return x.id === 'p_small'; });
  const labels = HW.m.offeredSizes(p).map(function (s) { return s.label; });
  assert(labels.join(',') === '17x24,21x34', 'got ' + labels.join(','));
});

test('a size filter keeps only products sold in that size', function () {
  HW.DB = store();
  const view = HW.views.category({ slug: 'rugs', size: '21x34' });
  assert(view.html.indexOf('Small Rug') >= 0, 'Small Rug is sold in 21x34');
  assert(view.html.indexOf('Big Rug') >= 0, 'Big Rug is sold in 21x34');
  assert(view.html.indexOf('Round Rug') < 0, 'Round Rug is not sold in 21x34');
});

test('two sizes widen the result rather than narrowing it', function () {
  HW.DB = store();
  const view = HW.views.category({ slug: 'rugs', size: '17x24,22" Round' });
  assert(view.html.indexOf('Small Rug') >= 0, 'Small Rug has 17x24');
  assert(view.html.indexOf('Round Rug') >= 0, 'Round Rug has 22" Round');
  assert(view.html.indexOf('Big Rug') < 0, 'Big Rug has neither');
});

test('a size nobody sells returns nothing rather than everything', function () {
  HW.DB = store();
  const view = HW.views.category({ slug: 'rugs', size: '99x99' });
  ['Small Rug', 'Big Rug', 'Round Rug'].forEach(function (n) {
    assert(view.html.indexOf(n) < 0, n + ' leaked through an impossible size');
  });
});

test('the size facet is offered, sorted so numbers read in order', function () {
  HW.DB = store();
  const view = HW.views.category({ slug: 'rugs' });
  assert(/Size/.test(view.html), 'no Size group in the sidebar');
  const order = ['17x24', '21x34', '24x40', '22&quot; Round'].map(function (s) { return view.html.indexOf(s); });
  assert(order.every(function (i) { return i >= 0; }), 'a size is missing from the facet: ' + JSON.stringify(order));
  assert(order[0] < order[1] && order[1] < order[2], 'sizes are not in numeric order');
});

test('the same size typed two ways is one choice, not two', function () {
  HW.DB = HW.schema.normalizeStore({
    categories: [{ id: 'c_rugs', name: 'Rugs', slug: 'rugs', show: true, subcategories: [] }],
    products: [
      collection('p_a', 'Rug A', 'c_rugs', [SZ('17x24'), SZ('21x34')], [CL('Blue', '#7A9CC0')]),
      collection('p_b', 'Rug B', 'c_rugs', [{ id: 'q', label: '17"X24"' }, SZ('30x40')], [CL('Grey', '#999999')])
    ]
  });
  const view = HW.views.category({ slug: 'rugs' });
  const labels = (view.html.match(/cf-clabel">[^<]+/g) || []).map(function (s) { return s.replace('cf-clabel">', ''); });
  const seventeens = labels.filter(function (l) { return /17/.test(l); });
  assert(seventeens.length === 1, 'the same size appears ' + seventeens.length + ' times: ' + JSON.stringify(seventeens));
});

test('filtering by that size finds both spellings', function () {
  HW.DB = HW.schema.normalizeStore({
    categories: [{ id: 'c_rugs', name: 'Rugs', slug: 'rugs', show: true, subcategories: [] }],
    products: [
      collection('p_a', 'Rug A', 'c_rugs', [SZ('17x24'), SZ('21x34')], [CL('Blue', '#7A9CC0')]),
      collection('p_b', 'Rug B', 'c_rugs', [{ id: 'q', label: '17"X24"' }, SZ('30x40')], [CL('Grey', '#999999')])
    ]
  });
  const view = HW.views.category({ slug: 'rugs', size: '17x24' });
  assert(view.html.indexOf('Rug A') >= 0, 'Rug A spells it 17x24');
  assert(view.html.indexOf('Rug B') >= 0, 'Rug B spells it 17"X24" and must still match');
});

test('each size shows how many products are in it', function () {
  HW.DB = store();
  const html = HW.views.category({ slug: 'rugs' }).html;
  const group = html.slice(html.indexOf('Size</legend>'));
  const counts = (group.slice(0, group.indexOf('</fieldset>')).match(/\((\d+)\)/g) || []);
  assert(counts.length >= 2, 'no counts rendered for the size facet');
  assert(counts.some(function (c) { return c !== '(0)'; }),
    'every size counted zero, so the counter is not counting sizes: ' + counts.join(' '));
});

test('size and colour together narrow, not widen', function () {
  HW.DB = store();
  const view = HW.views.category({ slug: 'rugs', size: '21x34', color: 'Grey' });
  assert(view.html.indexOf('Big Rug') >= 0, 'Big Rug is grey and 21x34');
  assert(view.html.indexOf('Small Rug') < 0, 'Small Rug is 21x34 but not grey');
});

/* ================================================================ *
 * Shop by — named uses that map onto sizes
 * ================================================================ */
function shopByStore(shopBy) {
  return HW.schema.normalizeStore({
    categories: [{ id: 'c_rugs', name: 'Rugs', slug: 'rugs', show: true, subcategories: [], shopBy: shopBy }],
    products: [
      collection('p_small', 'Small Rug', 'c_rugs', [SZ('17x24'), SZ('21x34')], [CL('Blue', '#7A9CC0')]),
      collection('p_round', 'Round Rug', 'c_rugs', [SZ('22" Round')], [CL('Blue', '#7A9CC0')])
    ]
  });
}

test('a shop-by entry becomes a link to that size', function () {
  HW.DB = shopByStore([{ label: 'In front of a single sink', sizes: '17x24,17x30' }]);
  const html = HW.views.category({ slug: 'rugs' }).html;
  assert(html.indexOf('In front of a single sink') >= 0, 'the label is missing');
  assert(/size=17x24/.test(html), 'the link does not carry the size');
});

test('a shop-by entry nobody can buy is not offered', function () {
  HW.DB = shopByStore([
    { label: 'In front of a single sink', sizes: '17x24' },
    { label: 'Tank lid cover', sizes: '10x22' }        // nothing in this fixture is 10x22
  ]);
  const html = HW.views.category({ slug: 'rugs' }).html;
  assert(html.indexOf('In front of a single sink') >= 0, 'the real one should show');
  assert(html.indexOf('Tank lid cover') < 0, 'a link to an empty page was offered');
});

test('a category with no shop-by entries shows no block', function () {
  HW.DB = shopByStore([]);
  assert(HW.views.category({ slug: 'rugs' }).html.indexOf('shopby') < 0, 'an empty block was rendered');
});

test('shop-by matches however the size was typed', function () {
  HW.DB = HW.schema.normalizeStore({
    categories: [{ id: 'c_rugs', name: 'Rugs', slug: 'rugs', show: true, subcategories: [],
      shopBy: [{ label: 'Single sink', sizes: '17x24' }] }],
    products: [collection('p_b', 'Rug B', 'c_rugs', [{ id: 'q', label: '17"X24"' }, SZ('30x40')], [CL('Grey', '#999999')])]
  });
  assert(HW.views.category({ slug: 'rugs' }).html.indexOf('Single sink') >= 0,
    'the entry was hidden because the catalog spells the size differently');
});

test('a shortcut can name sizes that themselves contain commas', function () {
  HW.DB = HW.schema.normalizeStore({
    categories: [{ id: 'c_t', name: 'Towels', slug: 'towels', show: true, subcategories: [],
      // The separator is a pipe, because "3 Pieces (1 Bath, 1 Hand)" has commas of its own.
      shopBy: [{ label: 'Complete sets', sizes: '3 Pieces (1 Bath, 1 Hand, 1 Wash)|6 Pieces (2 Bath, 2 Hand, 2 Wash)' }] }],
    products: [collection('p_set', 'Willow Set', 'c_t',
      [{ id: 'a', label: '3 Pieces (1 Bath, 1 Hand, 1 Wash)' }, { id: 'b', label: 'Set of 2' }],
      [CL('Blue', '#7A9CC0')])]
  });
  const html = HW.views.category({ slug: 'towels' }).html;
  assert(html.indexOf('Complete sets') >= 0, 'the shortcut was hidden, so the commas broke the match');
});

/* ================================================================ *
 * Collection — the range a product belongs to
 * ================================================================ */
function collStore(colls) {
  return HW.schema.normalizeStore({
    categories: [{ id: 'c_t', name: 'Towels', slug: 'towels', show: true, subcategories: [] }],
    products: colls.map(function (c, i) {
      const p = collection('p_' + i, c.name, 'c_t', [SZ('Set of 2'), SZ('Set of 4')], [CL('Blue', '#7A9CC0')]);
      p.collection = c.collection;
      return p;
    })
  });
}

test('a collection filter keeps only that range', function () {
  HW.DB = collStore([
    { name: 'Willow Bath Towels', collection: 'Willow' },
    { name: 'Willow Hand Towels', collection: 'Willow' },
    { name: 'Hazel Bath Towels', collection: 'Hazel' }
  ]);
  const html = HW.views.category({ slug: 'towels', collection: 'Hazel' }).html;
  assert(html.indexOf('Hazel Bath Towels') >= 0, 'Hazel is missing');
  assert(html.indexOf('Willow Bath Towels') < 0, 'Willow leaked through');
});

test('the collection facet is offered when it actually groups products', function () {
  HW.DB = collStore([
    { name: 'Willow Bath Towels', collection: 'Willow' },
    { name: 'Willow Hand Towels', collection: 'Willow' },
    { name: 'Hazel Bath Towels', collection: 'Hazel' }
  ]);
  const html = HW.views.category({ slug: 'towels' }).html;
  assert(/Collection/.test(html), 'no Collection group in the sidebar');
});

test('a collection facet where every product is its own range is not offered', function () {
  HW.DB = collStore([
    { name: 'Waterford Rug', collection: 'Waterford' },
    { name: 'Bell Flower Rug', collection: 'Bell Flower' },
    { name: 'Radiant Rug', collection: 'Radiant' }
  ]);
  const html = HW.views.category({ slug: 'towels' }).html;
  assert(!/Collection<\/legend>/.test(html), 'offered a filter that groups nothing');
});

test('products with no collection do not create a blank choice', function () {
  HW.DB = collStore([
    { name: 'Willow Bath Towels', collection: 'Willow' },
    { name: 'Willow Hand Towels', collection: 'Willow' },
    { name: 'Odd One Out', collection: '' }
  ]);
  const html = HW.views.category({ slug: 'towels' }).html;
  const group = html.slice(html.indexOf('Collection</legend>'));
  assert(group.indexOf('cf-clabel"></span>') < 0, 'an empty collection was offered as a choice');
});

test('the router carries ?collection= through', function () {
  C.location.pathname = '/category/towels';
  C.location.search = '?collection=Willow';
  C.location.href = 'https://example.test/category/towels?collection=Willow';
  const route = HW.router.parse();
  assert(route.params.collection === 'Willow', 'collection was dropped: ' + JSON.stringify(route.params));
  C.location.search = ''; C.location.href = 'https://example.test/'; C.location.pathname = '/';
});

test('the router carries ?size= through to the category view', function () {
  C.location.pathname = '/category/rugs';
  C.location.search = '?size=21x34';
  C.location.href = 'https://example.test/category/rugs?size=21x34';
  const route = HW.router.parse();
  assert(route.name === 'category', 'routed to ' + route.name);
  assert(route.params.size === '21x34', 'size was dropped: ' + JSON.stringify(route.params));
  C.location.search = '';
  C.location.href = 'https://example.test/';
  C.location.pathname = '/';
});

Promise.resolve().then(function () {
  failures.forEach(function (f) { console.error('FAIL  ' + f[0] + '\n      ' + (f[1] && f[1].message)); });
  console.log((failures.length ? '\n' : '') + passed + ' passed, ' + failures.length + ' failed');
  process.exit(failures.length ? 1 : 0);
});
