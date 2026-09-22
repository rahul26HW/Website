/* Home Weavers — store data shape, defaults and the old-backup importer.
   Works in the browser (window.HW.schema) and in Node (module.exports). */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.HW = root.HW || {}; root.HW.schema = api; }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var SCHEMA_VERSION = 2;
  var DEFAULT_ANNOUNCEMENT = 'Complimentary shipping on orders over $75';
  var SHIPPING_TOKEN = '{{shipping_days}}';
  var DEFAULT_SIZE_GUIDE =
    '## Bath rugs\n' +
    '| Size | Centimeters | Best for |\n' +
    '| 17" × 24" | 43 × 61 cm | In front of a sink or toilet |\n' +
    '| 18" × 18" | 46 × 46 cm | Toilet lid cover |\n' +
    '| 20" × 20" | 51 × 51 cm | Contour rug around the toilet base |\n' +
    '| 20" × 32" | 51 × 81 cm | Single sink or shower exit |\n' +
    '| 21" × 34" | 53 × 86 cm | Standard tub or shower |\n' +
    '| 24" × 40" | 61 × 102 cm | Larger bathrooms, double vanity |\n' +
    '| 21" × 54" | 53 × 137 cm | Runner for double sinks |\n' +
    '| 30" round | 76 cm | Center of the room |\n\n' +
    '## Towels\n' +
    '| Towel | Size | Centimeters |\n' +
    '| Washcloth | 13" × 13" | 33 × 33 cm |\n' +
    '| Hand towel | 16" × 24" | 41 × 61 cm |\n' +
    '| Bath towel | 27" × 54" | 69 × 137 cm |\n\n' +
    'Measure the floor space first and leave about 2–4 inches of floor showing around the rug.';

  function clone(o) { return JSON.parse(JSON.stringify(o == null ? null : o)); }
  function isObj(o) { return o && typeof o === 'object' && !Array.isArray(o); }
  function str(v) { return typeof v === 'string' ? v : (v == null ? '' : String(v)); }
  function uid(p) { return (p || 'id') + '_' + Math.random().toString(36).slice(2, 8); }
  function slugify(s) { return str(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  /* ---------------------------------------------------------------- *
   * Defaults for everything the storefront reads.
   * ---------------------------------------------------------------- */
  function defaults() {
    return {
      schemaVersion: SCHEMA_VERSION,
      brand: { name: 'Home Weavers', tagline: 'Woven for the way you live', logoImage: '', hideName: false },
      announcement: DEFAULT_ANNOUNCEMENT,
      contact: { email: '', phone: '', address: '', hours: 'Monday–Friday, 9am–5pm ET' },
      settings: {
        shippingDays: '2–4 business days',
        outOfStock: 'show',           // 'show' = badge + sorted last, 'hide' = remove from listings
        showEmptyCategories: false,
        lowStockThreshold: 5,
        siteUrl: '',                  // e.g. https://nitish463.github.io/Website/ (used for canonical + sitemap)
        googleClientId: '',           // public OAuth client ID for "Continue with Google" (blank hides the button)
        sizeGuide: DEFAULT_SIZE_GUIDE // shown from product pages with sizes; blank hides the link
      },
      hero: { autoplay: true, interval: 5000, slides: [] },
      band: { eyebrow: 'The Home Weavers difference', title: 'Made on the loom, not the factory line.',
        body: 'Every piece starts as raw fiber and is woven for density, drape, and durability. The result is texture you can feel and softness that lasts.',
        ctaText: 'Our story', ctaLink: '/page/our-story', image: '' },
      categories: [],
      products: [],
      inventory: {},
      thumbs: {},                     // full image URL -> small (700px) WebP URL, used for cards and thumbnails
      promos: [],
      newsletter: { couponCode: '', emailEndpoint: '' },
      shipping: { enabled: true, freeThreshold: 75, flatRate: 9.95 },
      tax: { enabled: false, rates: [] },
      // A sale that runs between two dates: an extra percentage off, a band on the product page and a ribbon
      // on the cards. It ends by itself — prices and badges go back with no one having to switch anything off.
      sale: { enabled: false, name: '', ribbon: 'Sale', percent: 0, startsAt: '', endsAt: '', scope: 'all', categoryIds: [], productIds: [] },
      social: { facebook: '', instagram: '', pinterest: '' },
      payments: { stripe: false, cod: false, codFee: 0, codMax: 500, workerUrl: '', cancelMinutes: 30 },   // Stripe Checkout through the Cloudflare Worker (keys live in the worker)
      snipcart: { enabled: false, apiKey: '', currency: 'usd', version: '3.7.1', mode: 'side', feedUrl: '' },
      videoBanner: { enabled: false, eyebrow: '', heading: '', body: '', ctaText: '', ctaLink: '', videoUrl: '', bg: '#2A2622' },
      features: [],
      socialGallery: { enabled: false, heading: 'Find us on social', tiles: [] },
      pages: []
    };
  }

  function legalPages() {
    return [
      { group: 'legal', title: 'Privacy Policy', slug: 'privacy-policy', body:
        '## What we collect\nWhen you place an order, contact us or sign up for emails, we collect the details you give us: name, email, phone and shipping address.\n\n' +
        '## How we use it\n- To process and deliver your order\n- To answer your messages\n- To send emails you signed up for (you can unsubscribe at any time)\n\n' +
        '## What we never do\nWe never sell your personal information.\n\n' +
        '## Cookies\nWe use necessary cookies to keep your cart working. Optional cookies are only used if you accept them.\n\n' +
        '## Your choices\nTo see, correct or delete your information, contact us and we will reply within 30 days.' },
      { group: 'legal', title: 'Terms of Service', slug: 'terms-of-service', body:
        '## Using this site\nBy using this site or placing an order, you agree to these terms.\n\n' +
        '## Orders and pricing\nAll prices are in US dollars. We may cancel an order if an item is unavailable or a price was listed in error. You will be refunded in full.\n\n' +
        '## Product information\nWe describe our products as accurately as we can. Colors can look slightly different on different screens.\n\n' +
        '## Contact\nQuestions about these terms? Contact us.' },
      { group: 'legal', title: 'Refund Policy', slug: 'refund-policy', body:
        '## Returns\nReturn unused items in their original condition within 30 days of delivery for a full refund of the item price.\n\n' +
        '## How to start a return\nContact us with your order number. We will reply with return instructions.\n\n' +
        '## Refunds\nRefunds go back to your original payment method within 5–10 business days after we receive the return.\n\n' +
        '## Damaged or wrong items\nContact us within 7 days of delivery and we will replace the item or refund you, including shipping.' },
      { group: 'legal', title: 'Accessibility', slug: 'accessibility', body:
        '## Our commitment\nWe want everyone to be able to shop with us. We aim to meet the WCAG 2.1 AA guidelines.\n\n' +
        '## What we do\n- Text alternatives for product images\n- Full keyboard navigation\n- Readable color contrast\n- Support for reduced motion\n\n' +
        '## Need help?\nIf any part of this site is hard to use, contact us and we will help you complete your order.' }
    ];
  }

  /* ---------------------------------------------------------------- *
   * Links: stored as app paths ("/category/rugs"). Old data used "#/…".
   * ---------------------------------------------------------------- */
  function normalizeLink(link) {
    var l = str(link).trim();
    if (!l) return '';
    if (/^#\//.test(l)) l = l.slice(1);
    return l;
  }

  function isDirectImageUrl(url) {
    var u = str(url).trim();
    if (!u) return false;
    if (/^data:image\//i.test(u)) return true;
    if (/\/storage\/v1\/object\/public\//i.test(u)) return true;
    if (/^(assets\/|\/assets\/)/i.test(u)) return true;
    return /^https?:\/\/[^\s]+\.(png|jpe?g|webp|gif|svg|avif)(\?[^\s]*)?$/i.test(u);
  }

  function fixImageUrl(url) {
    var u = str(url).trim();
    if (!u) return '';
    return u.replace(/^(https:\/\/dl\.dropboxusercontent\.com)\/\/+/i, '$1/');
  }

  /* "Brand Collection Bath Towels Set of 2 | … | 27x54 Inch | Blue"
     -> "willow-collection-bath-towels-set-of-2-27x54-inch-blue" */
  function shortSlug(name) {
    var parts = str(name).split('|').map(function (s) { return s.trim(); }).filter(Boolean);
    var words = parts.length > 2 ? [parts[0]].concat(parts.slice(-2)) : parts;
    var s = slugify(words.join(' ')).replace(/^home-weavers-/, '');
    if (s.length > 70) s = s.slice(0, 70).replace(/-[^-]*$/, '');
    return s;
  }

  function pad8(arr) {
    var a = Array.isArray(arr) ? arr.slice(0, 8).map(fixImageUrl) : [];
    while (a.length < 8) a.push('');
    return a;
  }

  /* ---------------------------------------------------------------- *
   * normalizeStore: fills in any missing field so the site never breaks.
   * Safe to run on every load. Does not change existing values.
   * ---------------------------------------------------------------- */
  function normalizeStore(input) {
    var d = isObj(input) ? input : {};
    var def = defaults();

    Object.keys(def).forEach(function (k) {
      if (d[k] == null) d[k] = clone(def[k]);
      else if (isObj(def[k]) && isObj(d[k])) {
        Object.keys(def[k]).forEach(function (k2) { if (d[k][k2] === undefined) d[k][k2] = clone(def[k][k2]); });
      }
    });

    delete d.password;
    delete d.subscribers;
    delete d.marketing;

    // Minutes a customer may cancel a paid order themselves (0–1440).
    var cm = Number((d.settings || {}).cancelMinutes);
    d.settings.cancelMinutes = cm >= 0 && cm <= 1440 ? Math.round(cm) : 30;
    // Cash on delivery: fee $0–50, largest order $1–5,000 (the database applies the same limits).
    if (!isObj(d.payments)) d.payments = {};
    d.payments.cod = d.payments.cod === true;
    var cf = Number(d.payments.codFee); d.payments.codFee = cf >= 0 && cf <= 50 ? Math.round(cf * 100) / 100 : 0;
    var cx = Number(d.payments.codMax); d.payments.codMax = cx >= 1 && cx <= 5000 ? Math.round(cx) : 500;
    // Timed sale
    if (!isObj(d.sale)) d.sale = { enabled: false, name: '', ribbon: 'Sale', percent: 0, startsAt: '', endsAt: '', scope: 'all', categoryIds: [], productIds: [] };
    d.sale.enabled = d.sale.enabled === true;
    ['name', 'ribbon'].forEach(function (k) { d.sale[k] = str(d.sale[k]).slice(0, 120); });
    ['startsAt', 'endsAt'].forEach(function (k) {
      // Kept as an exact moment. A bare "+00" offset (some tools write that) is widened so every browser reads it.
      var ms = Date.parse(str(d.sale[k]).trim().replace(/([+-]\d\d)$/, '$1:00'));
      d.sale[k] = isFinite(ms) ? new Date(ms).toISOString() : '';
    });
    if (!d.sale.ribbon) d.sale.ribbon = 'Sale';
    var sp = Number(d.sale.percent);
    d.sale.percent = sp >= 1 && sp <= 70 ? Math.round(sp * 10) / 10 : 0;
    if (['all', 'categories', 'products'].indexOf(d.sale.scope) < 0) d.sale.scope = 'all';
    ['categoryIds', 'productIds'].forEach(function (k) {
      d.sale[k] = (Array.isArray(d.sale[k]) ? d.sale[k] : []).map(str).filter(Boolean).slice(0, 200);
    });
    // A sale with no end time, no discount or no start can't run.
    if (!d.sale.percent || !d.sale.startsAt || !d.sale.endsAt) d.sale.enabled = false;

    var gid = String(d.settings.googleClientId || '').trim();
    d.settings.googleClientId = /^[\w.-]+\.apps\.googleusercontent\.com$/.test(gid) ? gid : '';
    if (!isObj(d.thumbs)) d.thumbs = {};
    Object.keys(d.thumbs).forEach(function (k) { if (typeof d.thumbs[k] !== 'string' || !/^https:\/\//.test(d.thumbs[k])) delete d.thumbs[k]; });

    if (!Array.isArray(d.hero.slides)) d.hero.slides = [];
    d.hero.slides.forEach(function (s) {
      ['eyebrow', 'title', 'subtitle', 'ctaText', 'ctaLink', 'image', 'mobileImage', 'alt'].forEach(function (k) { s[k] = str(s[k]); });
      s.ctaLink = normalizeLink(s.ctaLink);
    });
    d.band.ctaLink = normalizeLink(d.band.ctaLink);
    d.videoBanner.ctaLink = normalizeLink(d.videoBanner.ctaLink);

    d.categories.forEach(function (c) {
      if (!c.id) c.id = uid('c');
      if (!c.slug) c.slug = slugify(c.name);
      if (!Array.isArray(c.subcategories)) c.subcategories = [];
      c.subcategories.forEach(function (s) { if (!s.id) s.id = uid('s'); if (!s.slug) s.slug = slugify(s.name); });
      if (!isObj(c.filters)) c.filters = { type: true, color: true, material: true, price: true };
      if (typeof c.hidden !== 'boolean') c.hidden = false;
      c.image = fixImageUrl(c.image);
      c.seoTitle = str(c.seoTitle); c.seoDescription = str(c.seoDescription);
    });

    d.products.forEach(function (p) {
      if (!p.id) p.id = uid('p');
      if (!p.slug) p.slug = slugify(p.name);
      if (!Array.isArray(p.features)) p.features = [];
      if (!Array.isArray(p.oldSlugs)) p.oldSlugs = [];
      ['seoTitle', 'seoDescription', 'imageAlt', 'description', 'material', 'care', 'origin', 'badge'].forEach(function (k) { p[k] = str(p[k]); });
      if (typeof p.hidden !== 'boolean') p.hidden = false;
      var isColl = Array.isArray(p.options) && p.options.some(function (o) { return o.type === 'color'; }) && p.options.some(function (o) { return o.type === 'size'; });
      if (isColl) {
        if (!isObj(p.variants)) p.variants = {};
        p.options.forEach(function (o) {
          if (o.type !== 'color') return;
          o.values.forEach(function (c) {
            c.images = pad8(c.images);
            if (typeof c.video !== 'string') c.video = '';
            if (typeof c.primary !== 'number') c.primary = 0;
          });
        });
        Object.keys(p.variants).forEach(function (k) {
          var v = p.variants[k];
          if (Array.isArray(v.images)) v.images = pad8(v.images);
        });
      } else {
        if (!Array.isArray(p.images)) p.images = p.image ? [p.image] : [];
        p.images = pad8(p.images);
        if (typeof p.video !== 'string') p.video = '';
        if (typeof p.primary !== 'number') p.primary = 0;
        p.sku = str(p.sku);
      }
    });

    d.promos.forEach(function (x) {
      if (!x.id) x.id = uid('promo');
      x.code = str(x.code).trim().toUpperCase();
      x.startsAt = str(x.startsAt); x.endsAt = str(x.endsAt);
      x.usageLimit = Number(x.usageLimit) > 0 ? Math.floor(Number(x.usageLimit)) : 0;
      x.oncePerCustomer = !!x.oncePerCustomer;
      x.minOrder = Number(x.minOrder) || 0;
      x.value = Number(x.value) || 0;
      x.active = !!x.active;
    });

    d.pages.forEach(function (p) {
      if (!p.id) p.id = uid('pg');
      if (!p.slug) p.slug = slugify(p.title);
      if (!p.group) p.group = 'service';
      if (typeof p.show !== 'boolean') p.show = true;
      p.seoTitle = str(p.seoTitle); p.seoDescription = str(p.seoDescription);
    });

    (d.socialGallery.tiles || []).forEach(function (t) { t.image = fixImageUrl(t.image); t.url = str(t.url); });
    (d.features || []).forEach(function (f) { f.image = str(f.image); });

    if (!isObj(d.inventory)) d.inventory = {};
    d.schemaVersion = SCHEMA_VERSION;
    return d;
  }

  /* ---------------------------------------------------------------- *
   * importBackup: old "homeweavers-backup.json" -> new projects tables.
   * Returns { store, storePrivate, subscribers, report[] }.
   * ---------------------------------------------------------------- */
  function importBackup(backup) {
    if (!isObj(backup) || !Array.isArray(backup.products)) {
      throw new Error('This file is not a Home Weavers backup (no products list).');
    }
    var b = clone(backup);
    var report = [];
    function note(kind, msg) { report.push({ kind: kind, msg: msg }); }

    // ---- private data (admin-only table) ----
    var mk = isObj(b.marketing) ? b.marketing : {};
    var log = Array.isArray(mk.log) ? mk.log : [];
    var seen = {};
    var cleanLog = log.filter(function (e) {
      var empty = !(Number(e.reach) || Number(e.clicks) || Number(e.orders) || Number(e.revenue)) && !str(e.note).trim();
      if (empty) return false;
      var key = [e.date, e.platform, e.reach, e.clicks, e.orders, e.revenue, str(e.note).trim()].join('|');
      if (seen[key]) return false;
      seen[key] = 1;
      return true;
    });
    if (log.length !== cleanLog.length) note('fixed', 'Marketing log: removed ' + (log.length - cleanLog.length) + ' empty or duplicate entries.');
    var storePrivate = {
      marketing: {
        goal: isObj(mk.goal) ? mk.goal : {},
        log: cleanLog,
        tasks: isObj(mk.tasks) ? mk.tasks : {},
        operator: isObj(mk.operator) ? mk.operator : {},
        voice: str(mk.voice),
        endpoint: /api\.anthropic\.com/i.test(str(mk.endpoint)) ? '' : str(mk.endpoint),
        imageEndpoint: /api\.openai\.com/i.test(str(mk.imageEndpoint)) ? '' : str(mk.imageEndpoint)
      },
      notes: ''
    };

    // ---- subscribers table ----
    var subs = (Array.isArray(b.subscribers) ? b.subscribers : [])
      .map(function (s) { return { email: str(s.email).trim().toLowerCase(), code: str(s.code), created_at: s.date || null }; })
      .filter(function (s) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.email); });

    if (b.password != null) note('fixed', 'Removed the old admin password from the data. Admin login now uses Supabase Auth.');

    // ---- announcement ----
    if (!str(b.announcement).trim() || /\btest\b/i.test(str(b.announcement))) {
      note('fixed', 'Announcement bar: replaced test text with "' + DEFAULT_ANNOUNCEMENT + '".');
      b.announcement = DEFAULT_ANNOUNCEMENT;
    }

    // ---- brand / logo ----
    b.brand = isObj(b.brand) ? b.brand : {};
    if (!str(b.brand.tagline).trim()) b.brand.tagline = 'Woven for the way you live';
    if (b.brand.logoImage && !isDirectImageUrl(b.brand.logoImage)) {
      note('action', 'Logo: "' + b.brand.logoImage + '" is a web page, not an image. The text logo is used until you upload a logo in Storefront.');
      b.brand.logoImage = '';
    }

    // ---- hero ----
    if (isObj(b.hero) && Array.isArray(b.hero.slides)) {
      b.hero.slides.forEach(function (s, i) {
        s.ctaLink = normalizeLink(s.ctaLink);
        if (s.ctaLink === '/') s.ctaLink = '';
        if (s.image && !str(s.title).trim() && /postimg\.cc/i.test(s.image)) {
          s.legacyImage = s.image;
          s.image = '';
          s.eyebrow = 'Home Weavers';
          s.title = 'Woven for the way you live.';
          s.subtitle = 'Plush bath rugs and zero-twist cotton towels, made to feel better with every wash.';
          s.ctaText = 'Shop bath rugs';
          s.ctaLink = '/category/rugs';
          note('action', 'Hero slide ' + (i + 1) + ': the old image had text baked into it. It now uses real text on the brand color. Upload a clean photo (and a mobile photo) in Hero banner.');
        }
        s.mobileImage = str(s.mobileImage);
        s.alt = str(s.alt);
      });
    }
    if (isObj(b.hero) && Number(b.hero.interval) < 4000) b.hero.interval = 5000;

    // ---- contact + pages ----
    b.contact = isObj(b.contact) ? b.contact : clone(defaults().contact);
    var pages = Array.isArray(b.pages) ? b.pages : [];
    pages.forEach(function (p) {
      var body = str(p.body);
      var m = body.match(/\*\*Email:\*\*\s*([^\s]+@[^\s]+)/);
      if (m && !/\.example$/i.test(m[1]) && !b.contact.email) b.contact.email = m[1];
      if (p.slug === 'contact-us') {
        body = body.replace(/\*\*Email:\*\*[^\n]*\n?/g, '').replace(/\*\*Hours:\*\*[^\n]*\n?/g, '').replace(/\n{3,}/g, '\n\n').trim();
      }
      if (p.slug === 'track-your-order') {
        body = 'Enter your order number and the email you used at checkout to see your order status.\n\nOrders ship within ' + SHIPPING_TOKEN + '. If something looks off, contact us and we will track it down for you.';
      }
      body = body.replace(/\b\d\s*[–-]\s*\d\s*business days\b/g, SHIPPING_TOKEN);
      p.body = body;
    });
    note('fixed', 'Contact page: removed the placeholder email. Contact details now come from Storefront > Contact, plus a working contact form.');
    note('fixed', 'Shipping time: pages now use one setting ({{shipping_days}}), default "2–4 business days".');
    legalPages().forEach(function (lp) {
      if (!pages.some(function (p) { return p.slug === lp.slug; })) {
        lp.id = uid('pg'); lp.show = true;
        pages.push(lp);
        note('added', 'Page added: ' + lp.title + ' (please review the wording).');
      }
    });
    b.pages = pages;

    // ---- links elsewhere ----
    if (isObj(b.band)) b.band.ctaLink = normalizeLink(b.band.ctaLink);
    if (isObj(b.videoBanner)) {
      b.videoBanner.ctaLink = normalizeLink(b.videoBanner.ctaLink);
      if (!str(b.videoBanner.videoUrl).trim()) note('fixed', 'Video section: hidden on the site until a video URL is added.');
    }

    // ---- products ----
    var liveKeys = {};
    (b.products || []).forEach(function (p) {
      if (str(p.name).length > 80) note('warn', 'Product name is ' + str(p.name).length + ' characters (over 80): "' + str(p.name).slice(0, 60) + '…"');
      if (str(p.slug).length > 70) {
        var short = shortSlug(p.name);
        var taken = function (s) { return (b.products || []).some(function (x) { return x !== p && x.slug === s; }); };
        var candidate = short, n = 2;
        while (candidate && taken(candidate)) candidate = short + '-' + (n++);
        if (candidate && candidate !== p.slug) {
          p.oldSlugs = [p.slug];
          p.slug = candidate;
        }
      }
      var isColl = Array.isArray(p.options) && p.options.length;
      if (isColl) {
        Object.keys(p.variants || {}).forEach(function (k) { var v = p.variants[k]; if (v && v.sku) liveKeys[v.sku] = 1; });
      } else {
        liveKeys[p.id] = 1;
        if (!str(p.sku)) note('action', 'Simple product needs a real SKU (Inventory): "' + str(p.name).slice(0, 60) + '…"');
      }
    });
    var inv = isObj(b.inventory) ? b.inventory : {};
    var removed = Object.keys(inv).filter(function (k) { return !liveKeys[k]; });
    removed.forEach(function (k) { delete inv[k]; });
    if (removed.length) note('fixed', 'Inventory: removed ' + removed.length + ' stock rows for SKUs that no longer exist.');
    b.inventory = inv;

    // ---- promos ----
    var activeWelcome = (b.promos || []).filter(function (x) { return x.active && /^welcome/i.test(str(x.code)); });
    if (activeWelcome.length > 1) {
      note('warn', 'Promotions: ' + activeWelcome.length + ' welcome codes are active (' + activeWelcome.map(function (x) { return x.code; }).join(', ') + '). Sign-ups get ' + str((b.newsletter || {}).couponCode) + '. Turn off the others in Promotions.');
    }

    // ---- snipcart ----
    if (isObj(b.snipcart) && /^\/?products\.json$/.test(str(b.snipcart.feedUrl))) b.snipcart.feedUrl = '';

    // ---- settings ----
    b.settings = Object.assign(defaults().settings, isObj(b.settings) ? b.settings : {});

    var emptyCats = (b.categories || []).filter(function (c) { return !(b.products || []).some(function (p) { return p.categoryId === c.id; }); });
    if (emptyCats.length) note('fixed', 'Empty categories hidden from shoppers: ' + emptyCats.map(function (c) { return c.name; }).join(', ') + '.');

    var store = normalizeStore(b);
    return { store: store, storePrivate: storePrivate, subscribers: subs, report: report };
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    SHIPPING_TOKEN: SHIPPING_TOKEN,
    defaults: defaults,
    legalPages: legalPages,
    normalizeStore: normalizeStore,
    normalizeLink: normalizeLink,
    isDirectImageUrl: isDirectImageUrl,
    importBackup: importBackup
  };
});
