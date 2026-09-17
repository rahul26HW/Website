/* Home Weavers — admin: Storefront (brand, logo, announcement, contact, settings, social, Snipcart, SEO files). */
(function (HW) {
  'use strict';

  var A = HW.A, u = HW.u, esc = u.esc, ui;

  function withDraft(fn) { var s = HW.DB; HW.DB = A.draft; try { return fn(); } finally { HW.DB = s; } }

  /* Base address of the live site, e.g. https://rahul26hw.github.io/Website/ */
  A.siteBase = function () {
    var s = String((A.draft.settings || {}).siteUrl || '').trim();
    if (s) return s.replace(/\/*$/, '/');
    return location.origin + HW.router.base;
  };
  A.feedUrl = function () {
    var f = String((A.draft.snipcart || {}).feedUrl || '').trim();
    if (/^https?:\/\//i.test(f)) return f;
    return A.siteBase() + (f.replace(/^\/+/, '') || 'products.json');
  };

  function logoPreview() {
    var bd = A.draft.brand;
    return '<div class="logoprev" id="logoPrev">' + (bd.logoImage
      ? '<img src="' + esc(HW.asset(bd.logoImage)) + '" alt="Logo preview" id="logoPrevImg">' + (bd.hideName ? '' : '<span class="logoword" style="margin-left:12px">' + esc(bd.name || '') + '</span>')
      : HW.SVG.logo + '<span class="logoword" style="margin-left:10px">' + esc(bd.name || 'Home Weavers') + '</span>') + '</div>' +
      '<div class="hint" id="logoMsg" role="status"></div>';
  }

  A.live.logo = function () {
    var box = document.getElementById('logoPrevWrap'); if (!box) return;
    box.innerHTML = logoPreview();
    wireLogoCheck();
  };
  function wireLogoCheck() {
    var img = document.getElementById('logoPrevImg'), msg = document.getElementById('logoMsg');
    if (!img) return;
    var url = A.draft.brand.logoImage;
    if (!HW.schema.isDirectImageUrl(url)) msg.innerHTML = '<span class="bad">⚠ This doesn’t look like a direct image link (it should end in .png, .jpg, .webp or .svg). Use Upload for best results.</span>';
    img.addEventListener('error', function () {
      msg.innerHTML = '<span class="bad">⚠ This logo couldn’t load — it isn’t a direct image. Shoppers will see the text logo instead. Use Upload.</span>';
    }, { once: true });
    img.addEventListener('load', function () {
      if (HW.schema.isDirectImageUrl(url)) msg.innerHTML = '<span class="ok">✓ Logo loads (' + img.naturalWidth + ' × ' + img.naturalHeight + ' px).</span>';
    }, { once: true });
  }

  A.tabs.storefront = {
    render: function () {
      ui = A.ui;
      var d = A.draft, bd = d.brand, c = d.contact, st = d.settings, so = d.social, sn = d.snipcart, nl = d.newsletter, pay = d.payments;
      return '<h1>Storefront</h1><p class="sub">Brand identity, contact details, store settings and checkout.</p>' +

        ui.panel('Brand',
          '<div class="grid2">' + ui.field('Logo text / store name', 'brand.name', bd.name, { live: 'logo', maxlength: 60 }) +
          ui.field('Tagline', 'brand.tagline', bd.tagline, { hint: 'Small line under the logo. Leave blank to hide it.', maxlength: 80 }) + '</div>' +
          ui.field('Logo image', 'brand.logoImage', bd.logoImage, { type: 'trim', live: 'logo', placeholder: 'Upload, or paste a direct image link',
            hint: 'Transparent PNG, WebP or SVG, about 400 × 160 px. Blank = woven icon + store name.',
            after: '<div class="btnrow" style="margin-top:8px"><button class="btn ghost sm" type="button" data-a="logo-upload">Upload logo</button>' +
              (bd.logoImage ? '<button class="txtbtn danger" type="button" data-a="logo-clear">Remove logo</button>' : '') + '</div>' }) +
          ui.check('My logo image already includes the name — don’t show the text', 'brand.hideName', bd.hideName, { live: 'logo' }) +
          '<div class="field"><span class="flabel">Logo preview</span><div id="logoPrevWrap">' + logoPreview() + '</div></div>' +
          ui.saveBtn()) +

        ui.panel('Announcement bar',
          ui.field('Message', 'announcement', d.announcement, { hint: 'The thin bar at the very top. Leave blank to hide it.', maxlength: 140 }) + ui.saveBtn()) +

        ui.panel('Contact details',
          '<p class="hint" style="margin:-6px 0 12px">Shown on the Contact us page next to the contact form. Blank fields are hidden.</p>' +
          '<div class="grid2">' + ui.field('Email', 'contact.email', c.email, { type: 'trim', inputType: 'email', placeholder: 'hello@yourdomain.com' }) +
          ui.field('Phone', 'contact.phone', c.phone, { type: 'trim', inputType: 'tel' }) + '</div>' +
          '<div class="grid2">' + ui.field('Hours', 'contact.hours', c.hours) +
          ui.field('Address', 'contact.address', c.address, { textarea: true, rows: 3 }) + '</div>' + ui.saveBtn()) +

        ui.panel('Store settings',
          '<div class="grid2">' +
          ui.field('Shipping time', 'settings.shippingDays', st.shippingDays, { hint: 'One setting used everywhere: product pages, stock labels, checkout and pages (write {{shipping_days}} in page text).', placeholder: '2–4 business days' }) +
          ui.field('Out-of-stock products', 'settings.outOfStock', st.outOfStock, { options: [['show', 'Show with “Out of stock” badge (sorted last)'], ['hide', 'Hide from listings and search']] }) + '</div>' +
          '<div class="grid2">' +
          ui.field('Low-stock alert at', 'settings.lowStockThreshold', st.lowStockThreshold, { type: 'int', min: 0, hint: 'SKUs at or below this number are flagged in Inventory and show “Only N left”.' }) +
          ui.field('Live site address', 'settings.siteUrl', st.siteUrl, { type: 'trim', live: 'feedUrl', placeholder: 'https://rahul26hw.github.io/Website/', hint: 'Used for share links, the sitemap and the Snipcart feed.' }) + '</div>' +
          ui.check('Show empty categories to shoppers', 'settings.showEmptyCategories', st.showEmptyCategories) +
          ui.field('Size guide', 'settings.sizeGuide', st.sizeGuide, { textarea: true, rows: 10, hint: 'Opens from “Size guide” on product pages with sizes. Tables: one row per line, columns separated by | (first row = headings). Leave blank to hide the link.' }) +
          ui.saveBtn()) +

        ui.panel('Social links (footer)',
          '<p class="hint" style="margin:-6px 0 12px">Blank = icon hidden. Links open in a new tab.</p><div class="grid2">' +
          [['facebook', 'Facebook'], ['instagram', 'Instagram'], ['pinterest', 'Pinterest'], ['youtube', 'YouTube'], ['tiktok', 'TikTok'], ['houzz', 'Houzz']].map(function (x) {
            return ui.field(x[1] + ' URL', 'social.' + x[0], so[x[0]] || '', { type: 'trim', placeholder: 'https://…', live: 'urlCheck' });
          }).join('') + '</div>' + ui.saveBtn()) +

        ui.panel('Newsletter welcome email (optional)',
          '<p class="hint" style="margin:-6px 0 12px">Sign-ups always see their code on screen. To also email it, set up the AI worker with a free Brevo key (see README) and paste the worker URL here.</p>' +
          ui.field('Worker URL', 'newsletter.emailEndpoint', nl.emailEndpoint || '', { type: 'trim', placeholder: 'https://home-weavers-ai.yourname.workers.dev' }) + ui.saveBtn()) +

        ui.panel('Card payments (Stripe) &amp; ShipStation',
          '<p class="hint" style="margin:-6px 0 12px">Shoppers pay on a secure Stripe page after checkout. Paid orders are sent to ShipStation, and when you ship there the carrier and tracking number come back to the order. ' +
          'All keys live in your Cloudflare Worker — never here. Setup steps: README › “Card payments and ShipStation”.</p>' +
          ui.check('Take card payments with Stripe at checkout', 'payments.stripe', pay.stripe) +
          '<p class="hint" style="margin:-4px 0 12px">While this is off, checkout is closed — the site takes no orders without payment.</p>' +
          ui.field('Worker address', 'payments.workerUrl', pay.workerUrl, { type: 'trim', placeholder: 'https://home-weavers.yourname.workers.dev',
            hint: 'The same worker as the Marketing AI. Leave Stripe off until “Check worker” shows Stripe ready.' }) +
          (sn.enabled && pay.stripe ? '<p class="adwarn">Snipcart is also on. While Snipcart is on, shoppers use Snipcart’s checkout and Stripe isn’t used.</p>' : '') +
          '<div class="btnrow"><button class="btn ghost sm" type="button" data-a="worker-check">Check worker</button>' +
          '<button class="btn ghost sm" type="button" data-a="shipstation-setup">Connect ShipStation tracking</button></div>' +
          '<div id="workerOut" aria-live="polite" style="margin-top:10px"></div>' +
          ui.saveBtn()) +

        ui.panel('Checkout &amp; payments (Snipcart)',
          '<p class="hint" style="margin:-6px 0 12px">When on, Snipcart handles cart and card checkout instead of Stripe. When off, the built-in checkout with Stripe is used. Paste your <b>public</b> API key only.</p>' +
          ui.check('Use Snipcart for cart &amp; checkout', 'snipcart.enabled', sn.enabled) +
          ui.field('Public API key', 'snipcart.apiKey', sn.apiKey, { type: 'trim', placeholder: 'Your public test or live key' }) +
          '<div class="grid3">' + ui.field('Currency', 'snipcart.currency', sn.currency, { type: 'trim' }) +
          ui.field('Cart style', 'snipcart.mode', sn.mode, { options: [['side', 'Side drawer'], ['full', 'Full page']] }) +
          ui.field('Version', 'snipcart.version', sn.version, { type: 'trim' }) + '</div>' +
          ui.field('Product feed URL', 'snipcart.feedUrl', sn.feedUrl, { type: 'trim', live: 'feedUrl', placeholder: 'Leave blank for automatic',
            hint: 'Automatic address: <b id="feedAuto">' + esc(A.feedUrl()) + '</b> (includes your GitHub Pages folder).' }) +
          '<div class="btnrow"><button class="btn ghost sm" type="button" data-a="feed-export">Export product feed (products.json)</button>' +
          '<button class="btn ghost sm" type="button" data-a="feed-test">Test feed URL</button></div>' +
          '<div id="feedOut" aria-live="polite" style="margin-top:10px"></div>' +
          '<p class="hint" style="margin-top:12px">After changing prices or products: export the feed, upload <b>products.json</b> next to index.html in GitHub, then click Test feed URL.</p>' +
          ui.saveBtn()) +

        ui.panel('Search engines',
          '<p class="hint" style="margin:-6px 0 12px">Download these and upload them next to index.html in GitHub whenever you add products or pages.</p>' +
          '<div class="btnrow"><button class="btn ghost sm" type="button" data-a="seo-sitemap">⬇ sitemap.xml</button><button class="btn ghost sm" type="button" data-a="seo-robots">⬇ robots.txt</button></div>');
    },
    after: function () { wireLogoCheck(); }
  };

  A.live.feedUrl = function () { var el = document.getElementById('feedAuto'); if (el) el.textContent = A.feedUrl(); };
  A.live.urlCheck = function (el) {
    var v = el.value.trim();
    el.setAttribute('aria-invalid', v && !/^https?:\/\//i.test(v) ? 'true' : 'false');
  };

  A.actions['worker-check'] = async function () {
    var out = document.getElementById('workerOut'), base = A.workerUrl();
    if (!/^https:\/\//.test(base)) { out.innerHTML = '<p class="badmsg">Enter the worker address (starts with https://).</p>'; return; }
    out.innerHTML = '<p class="hint">Checking…</p>';
    try {
      var res = await fetch(base + '/', { cache: 'no-store' });
      var data = await res.json();
      var f = data.features;
      if (!f) throw new Error('This worker is an older version. Paste the new ai-proxy.worker.js into Cloudflare and deploy.');
      var row = function (on, text, fix) { return '<li class="' + (on ? 'ok' : 'warn') + '"><span>' + (on ? '✓' : '⚠') + '</span><span>' + text + (on ? '' : ' — ' + fix) + '</span></li>'; };
      out.innerHTML = '<ul class="checklist">' +
        row(f.stripe, 'Stripe payments' + (f.stripeMode ? ' (' + f.stripeMode + ' mode)' : ''), 'add STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY') +
        row(f.shipstation, 'Send orders to ShipStation', 'add SHIPSTATION_API_KEY and SHIPSTATION_API_SECRET') +
        row(f.shipstationWebhook, 'Tracking numbers from ShipStation', 'add SHIPSTATION_WEBHOOK_TOKEN, then click Connect ShipStation tracking') +
        row(f.ai, 'Marketing AI', 'optional: add ANTHROPIC_API_KEY and SUPABASE_PUBLISHABLE_KEY') + '</ul>' +
        (f.stripeMode === 'test' ? '<p class="hint">Stripe is in test mode: use card 4242 4242 4242 4242, any future date and any CVC. Switch to your live key before launch.</p>' : '');
    } catch (e) {
      out.innerHTML = '<p class="badmsg">⚠ ' + esc(e.message && !/JSON/.test(e.message) ? e.message : 'That address didn’t answer like the Home Weavers worker.') + '</p>';
    }
  };
  A.actions['shipstation-setup'] = async function (btn) {
    var out = document.getElementById('workerOut');
    btn.disabled = true;
    try {
      var r = await A.workerCall('/shipstation/setup');
      out.innerHTML = '<p class="okmsg">✓ ' + (r.already ? 'ShipStation tracking was already connected.' : 'ShipStation will now send tracking numbers to your orders.') + '</p>';
    } catch (e) { out.innerHTML = '<p class="badmsg">⚠ ' + esc(e.message) + '</p>'; }
    finally { btn.disabled = false; }
  };

  A.actions['logo-upload'] = async function (btn) {
    var file = await A.pickFile('image/*'); if (!file) return;
    btn.disabled = true; btn.textContent = 'Uploading…';
    try {
      var url = await A.media.upload(file, 'logo', { max: 800 });
      A.draft.brand.logoImage = url;
      var inp = document.querySelector('[data-bind="brand.logoImage"]'); if (inp) inp.value = url;
      A.live.logo(); A.refreshDirtyBar();
      u.toast('Logo uploaded — click Save changes to publish it');
    } catch (e) { u.toast('Upload failed: ' + e.message); }
    finally { btn.disabled = false; btn.textContent = 'Upload logo'; }
  };
  A.actions['logo-clear'] = function () { A.draft.brand.logoImage = ''; A.render(); };

  A.actions['feed-export'] = function () {
    var feed = withDraft(function () {
      var saved = HW.snip.feedUrl;
      HW.snip.feedUrl = A.feedUrl;
      try { return HW.snip.feed(); } finally { HW.snip.feedUrl = saved; }
    });
    var seen = {}, dups = [];
    feed.forEach(function (f) { if (seen[f.id] != null && seen[f.id] !== f.price) dups.push(f.id); seen[f.id] = f.price; });
    A.download('products.json', JSON.stringify(feed, null, 2), 'application/json');
    u.toast(dups.length ? 'Warning: same SKU with different prices: ' + Array.from(new Set(dups)).join(', ') : 'products.json downloaded (' + feed.length + ' items)');
  };

  A.actions['feed-test'] = async function () {
    var out = document.getElementById('feedOut');
    var url = A.feedUrl();
    out.innerHTML = '<p class="hint">Checking ' + esc(url) + ' …</p>';
    try {
      var res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('The file wasn’t found (HTTP ' + res.status + '). Upload products.json next to index.html.');
      var data = await res.json();
      if (!Array.isArray(data)) throw new Error('The file isn’t a product list.');
      var current = withDraft(function () { return HW.snip.feed(); });
      var byId = {}; data.forEach(function (x) { byId[x.id] = x; });
      var missing = current.filter(function (x) { return !byId[x.id]; }).length;
      var priceDiff = current.filter(function (x) { return byId[x.id] && Math.abs(byId[x.id].price - x.price) > 0.001; }).length;
      var badUrl = data.filter(function (x) { return x.url !== url; }).length;
      out.innerHTML = (missing || priceDiff || badUrl)
        ? '<p class="badmsg">⚠ Feed found (' + data.length + ' items) but out of date: ' + missing + ' missing, ' + priceDiff + ' price changes, ' + badUrl + ' with the wrong URL. Export and upload it again.</p>'
        : '<p class="okmsg">✓ Feed OK — ' + data.length + ' items match your catalog.</p>';
    } catch (e) {
      out.innerHTML = '<p class="badmsg">⚠ ' + esc(e.message) + '</p>';
    }
  };

  A.actions['seo-sitemap'] = function () {
    var base = A.siteBase();
    var d = A.draft;
    var urls = [''];
    withDraft(function () {
      HW.m.visibleCategories().forEach(function (c) { urls.push('category/' + c.slug); });
      (d.products || []).filter(function (p) { return HW.m.listable(p); }).forEach(function (p) { urls.push('product/' + p.slug); });
    });
    (d.pages || []).filter(function (p) { return p.show !== false; }).forEach(function (p) { urls.push('page/' + p.slug); });
    var today = A.today();
    var xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.map(function (p) { return '  <url><loc>' + esc(base + p) + '</loc><lastmod>' + today + '</lastmod></url>'; }).join('\n') + '\n</urlset>\n';
    A.download('sitemap.xml', xml, 'application/xml');
    if (!d.settings.siteUrl) u.toast('Tip: set “Live site address” first so the sitemap uses your real domain.');
  };
  A.actions['seo-robots'] = function () {
    var base = A.siteBase();
    var path = '/';
    try { path = new URL(base).pathname.replace(/\/*$/, '/'); } catch (e) {}
    A.download('robots.txt', 'User-agent: *\nAllow: /\nDisallow: ' + path + 'admin\nDisallow: ' + path + 'checkout\nDisallow: ' + path + 'order/\n\nSitemap: ' + base + 'sitemap.xml\n', 'text/plain');
    if (path !== '/') u.toast('Note: search engines only read robots.txt at the domain root. On a GitHub project site the sitemap still works — submit it in Google Search Console.');
  };
})(window.HW = window.HW || {});
