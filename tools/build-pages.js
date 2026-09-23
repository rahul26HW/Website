#!/usr/bin/env node
/* Writes a real HTML file for every category, product and info page, plus sitemap.xml.
   Why: GitHub Pages has no server routing. Without these files a direct visit to /product/x
   gets HTTP 404 and a redirect through 404.html (slower, and search engines see a 404).
   Each file is a copy of index.html with the page's own title, description and canonical link.
   Pages added later still work through 404.html; re-run this after catalog changes and publish.

   Run:  node tools/build-pages.js            (reads the live store snapshot)
         node tools/build-pages.js store.json (reads a local file: snapshot or backup export) */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const DIRS = ['category', 'product', 'page', 'account'];
const ACCOUNT_SECTIONS = ['login', 'orders', 'wishlist', 'addresses', 'payments', 'notifications', 'returns', 'settings'];

function loadLogic() {
  const ctx = { console };
  ctx.window = ctx;
  ctx.HW = {};
  vm.createContext(ctx);
  ['util', 'sanitize', 'schema', 'model'].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
  });
  return ctx.HW;
}

function readConfig() {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8');
  const ctx = { window: {} };
  vm.runInNewContext(src, ctx);
  return ctx.window.HW_CONFIG || {};
}

async function loadStore(file) {
  let json;
  if (file) json = JSON.parse(fs.readFileSync(file, 'utf8'));
  else {
    const cfg = readConfig();
    const res = await fetch(cfg.supabaseUrl + '/storage/v1/object/public/media/public/store.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('Could not read the store snapshot (HTTP ' + res.status + ')');
    json = await res.json();
  }
  return json.data || json.store || json;
}

const text = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/[•▪●◦]/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; };
const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function main() {
  const HW = loadLogic();
  const data = HW.schema.normalizeStore(await loadStore(process.argv[2]));
  HW.DB = data;
  const m = HW.m;
  const brand = data.brand.name || 'Home Weavers';
  const tagline = data.brand.tagline || 'Woven for the way you live';
  // SITE_URL=… overrides the stored address, for the moment a site moves to a new domain.
  const site = String(process.env.SITE_URL || data.settings.siteUrl || '').replace(/\/?$/, '/');
  if (!/^https:\/\//.test(site)) throw new Error('Set “Live site address” in Admin › Storefront first.');
  const abs = (p) => site + p.replace(/^\//, '');
  const asset = (src) => !src || /^data:/.test(src) ? '' : /^https?:\/\//.test(src) ? src : abs(src);
  HW.asset = asset; // used by m.srcset (router.js is not loaded here)

  const pages = [];
  m.visibleCategories().forEach(function (c) {
    const n = m.productsIn(c);
    const first = m.stockSort(n)[0];
    pages.push({ route: 'category/' + c.slug, title: c.seoTitle || c.name,
      preload: first ? { src: m.thumb(m.imageOrSwatch(first)) } : null,
      description: c.seoDescription || ('Shop ' + c.name + ' from ' + brand + ' — ' + n.length + ' product' + (n.length === 1 ? '' : 's') + '. ' + tagline + '.'),
      image: n[0] ? m.primaryImage(n[0]) : c.image });
  });
  const taken = new Set((data.products || []).map(function (p) { return 'product/' + p.slug; }));
  (data.products || []).filter(m.listable).forEach(function (p) {
    const img = m.primaryImage(p);
    const shared = { title: p.seoTitle || p.name, type: 'product',
      preload: img ? { src: img, srcset: m.srcset(img), sizes: '(max-width: 980px) 92vw, 50vw' } : null,
      description: p.seoDescription || text(p.description) || (p.name + ' from ' + brand + '.'), image: m.primaryImage(p) };
    pages.push(Object.assign({ route: 'product/' + p.slug }, shared));
    // A renamed product keeps its old addresses as real files, so an old link answers 200 instead of
    // going through 404.html. They carry the same content, point their canonical at the current slug,
    // and stay out of the sitemap; the app rewrites the address once it loads (js/product.js).
    (p.oldSlugs || []).forEach(function (old) {
      const route = 'product/' + old;
      if (!old || taken.has(route)) return;
      taken.add(route);
      pages.push(Object.assign({ route: route, canonical: 'product/' + p.slug, alias: true }, shared));
    });
  });
  (data.pages || []).filter(function (p) { return p.show !== false; }).forEach(function (p) {
    pages.push({ route: 'page/' + p.slug, title: p.seoTitle || p.title,
      description: p.seoDescription || text(m.pageText(p.body)).replace(/[#*\[\]()|-]/g, ' ') });
  });

  // Keep the inline-script hashes current before copying. Snipcart's hosts are allowed only while it is switched on.
  const cspOpts = { snipcart: !!(data.snipcart && data.snipcart.enabled && String(data.snipcart.apiKey || '').trim()) };
  require('./csp.js').write('index.html', cspOpts);
  require('./csp.js').write('404.html', cspOpts);
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  DIRS.forEach(function (d) { fs.rmSync(path.join(ROOT, d), { recursive: true, force: true }); });

  pages.forEach(function (pg) {
    const title = clip(pg.title, 60) + ' | ' + brand;
    const desc = clip(pg.description || (brand + ' — bath rugs, towels and home textiles. ' + tagline + '.'), 160);
    const url = abs(pg.canonical || pg.route);
    const img = asset(pg.image);
    // Start the page's main photo (its largest element) downloading before the scripts run.
    const pre = pg.preload && /^https:\/\//.test(pg.preload.src) ? '\n<link rel="preload" as="image" href="' + attr(pg.preload.src) + '"' +
      (pg.preload.srcset ? ' imagesrcset="' + attr(pg.preload.srcset) + '" imagesizes="' + attr(pg.preload.sizes) + '"' : '') + ' fetchpriority="high">' : '';
    let html = index
      // Files sit one folder down, so relative links need "../".
      .replace(/(\s(?:href|src)=")(?!https?:|\/|#|data:|mailto:|tel:)/g, '$1../')
      .replace(/<title>[^<]*<\/title>/, '<title>' + attr(title) + '</title>')
      // Real heading and text in the HTML itself, for crawlers that don't run scripts (the app replaces it on load).
      .replace('<div class="loading" aria-live="polite">Loading…</div>', '<div class="loading"><div><h1 style="font-size:28px;margin:0 0 10px">' + attr(clip(pg.title, 90)) + '</h1>' +
        '<p style="max-width:560px;margin:0 auto 14px">' + attr(desc) + '</p><p aria-live="polite">Loading…</p></div></div>')
      .replace(/(<meta name="description" content=")[^"]*"/, '$1' + attr(desc) + '"')
      .replace(/(<meta property="og:type" content=")[^"]*"/, '$1' + (pg.type || 'website') + '"')
      .replace(/(<meta property="og:title" content=")[^"]*"/, '$1' + attr(title) + '"')
      .replace(/(<meta property="og:description" content=")[^"]*"/, '$1' + attr(desc) + '"')
      .replace(/(<meta name="twitter:card" content=")[^"]*">/, '$1' + (img ? 'summary_large_image' : 'summary') + '">' +
        '\n<link rel="canonical" href="' + attr(url) + '">\n<meta property="og:url" content="' + attr(url) + '">' +
        (img ? '\n<meta property="og:image" content="' + attr(img) + '">' : '') + pre);
    const file = path.join(ROOT, pg.route + '.html');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, html);
  });

  // App screens get their own file too, so a direct visit answers 200 instead of going through 404.html.
  // They sit next to index.html (no "../"), are never indexed, and are left out of the sitemap.
  ['checkout', 'search', 'wishlist', 'account', 'admin'].forEach(function (r) {
    const html = index
      .replace(/<title>[^<]*<\/title>/, '<title>' + attr(r.charAt(0).toUpperCase() + r.slice(1) + ' | ' + brand) + '</title>')
      .replace(/(<meta name="description"[^>]*>)/, '$1\n<meta name="robots" content="noindex">');
    fs.writeFileSync(path.join(ROOT, r + '.html'), html);
  });

  ACCOUNT_SECTIONS.forEach(function (sec) {
    const html = index
      .replace(/(\s(?:href|src)=")(?!https?:|\/|#|data:|mailto:|tel:)/g, '$1../')
      .replace(/<title>[^<]*<\/title>/, '<title>' + attr(sec.charAt(0).toUpperCase() + sec.slice(1) + ' | ' + brand) + '</title>')
      .replace(/(<meta name="description"[^>]*>)/, '$1\n<meta name="robots" content="noindex">');
    fs.mkdirSync(path.join(ROOT, 'account'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'account', sec + '.html'), html);
  });

  const today = new Date().toISOString().slice(0, 10);
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    [''].concat(pages.filter(function (p) { return !p.alias; }).map(function (p) { return p.route; })).map(function (r) { return '  <url><loc>' + attr(abs(r)) + '</loc><lastmod>' + today + '</lastmod></url>'; }).join('\n') + '\n</urlset>\n';
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);

  const count = (k) => pages.filter(function (p) { return !p.alias && p.route.indexOf(k + '/') === 0; }).length;
  const aliases = pages.filter(function (p) { return p.alias; }).length;
  console.log('Wrote ' + pages.length + ' pages (' + count('category') + ' categories, ' + count('product') + ' products, ' +
    count('page') + ' info pages' + (aliases ? ', ' + aliases + ' old product addresses' : '') + ') and sitemap.xml.');
}

main().catch(function (e) { console.error(e.message); process.exit(1); });
