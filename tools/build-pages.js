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
const DIRS = ['category', 'product', 'page'];

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

const text = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; };
const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function main() {
  const HW = loadLogic();
  const data = HW.schema.normalizeStore(await loadStore(process.argv[2]));
  HW.DB = data;
  const m = HW.m;
  const brand = data.brand.name || 'Home Weavers';
  const tagline = data.brand.tagline || 'Woven for the way you live';
  const site = String(data.settings.siteUrl || '').replace(/\/?$/, '/');
  if (!/^https:\/\//.test(site)) throw new Error('Set “Live site address” in Admin › Storefront first.');
  const abs = (p) => site + p.replace(/^\//, '');
  const asset = (src) => !src || /^data:/.test(src) ? '' : /^https?:\/\//.test(src) ? src : abs(src);

  const pages = [];
  m.visibleCategories().forEach(function (c) {
    const n = m.productsIn(c);
    pages.push({ route: 'category/' + c.slug, title: c.seoTitle || c.name,
      description: c.seoDescription || ('Shop ' + c.name + ' from ' + brand + ' — ' + n.length + ' product' + (n.length === 1 ? '' : 's') + '. ' + tagline + '.'),
      image: n[0] ? m.primaryImage(n[0]) : c.image });
  });
  (data.products || []).filter(m.listable).forEach(function (p) {
    pages.push({ route: 'product/' + p.slug, title: p.seoTitle || p.name, type: 'product',
      description: p.seoDescription || text(p.description) || (p.name + ' from ' + brand + '.'), image: m.primaryImage(p) });
  });
  (data.pages || []).filter(function (p) { return p.show !== false; }).forEach(function (p) {
    pages.push({ route: 'page/' + p.slug, title: p.seoTitle || p.title,
      description: p.seoDescription || text(m.pageText(p.body)).replace(/[#*\[\]()|-]/g, ' ') });
  });

  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  DIRS.forEach(function (d) { fs.rmSync(path.join(ROOT, d), { recursive: true, force: true }); });

  pages.forEach(function (pg) {
    const title = clip(pg.title, 60) + ' | ' + brand;
    const desc = clip(pg.description || (brand + ' — bath rugs, towels and home textiles. ' + tagline + '.'), 160);
    const url = abs(pg.route);
    const img = asset(pg.image);
    let html = index
      // Files sit one folder down, so relative links need "../".
      .replace(/(\s(?:href|src)=")(?!https?:|\/|#|data:|mailto:|tel:)/g, '$1../')
      .replace(/<title>[^<]*<\/title>/, '<title>' + attr(title) + '</title>')
      .replace(/(<meta name="description" content=")[^"]*"/, '$1' + attr(desc) + '"')
      .replace(/(<meta property="og:type" content=")[^"]*"/, '$1' + (pg.type || 'website') + '"')
      .replace(/(<meta property="og:title" content=")[^"]*"/, '$1' + attr(title) + '"')
      .replace(/(<meta property="og:description" content=")[^"]*"/, '$1' + attr(desc) + '"')
      .replace(/(<meta name="twitter:card" content=")[^"]*">/, '$1' + (img ? 'summary_large_image' : 'summary') + '">' +
        '\n<link rel="canonical" href="' + attr(url) + '">\n<meta property="og:url" content="' + attr(url) + '">' +
        (img ? '\n<meta property="og:image" content="' + attr(img) + '">' : ''));
    const file = path.join(ROOT, pg.route + '.html');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, html);
  });

  const today = new Date().toISOString().slice(0, 10);
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    [''].concat(pages.map(function (p) { return p.route; })).map(function (r) { return '  <url><loc>' + attr(abs(r)) + '</loc><lastmod>' + today + '</lastmod></url>'; }).join('\n') + '\n</urlset>\n';
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);

  const count = (k) => pages.filter(function (p) { return p.route.indexOf(k + '/') === 0; }).length;
  console.log('Wrote ' + pages.length + ' pages (' + count('category') + ' categories, ' + count('product') + ' products, ' + count('page') + ' info pages) and sitemap.xml.');
}

main().catch(function (e) { console.error(e.message); process.exit(1); });
