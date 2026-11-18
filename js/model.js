/* Home Weavers — catalog logic: variants, prices, stock, visibility, links.
   Reads the loaded store from HW.DB. */
(function (HW) {
  'use strict';

  var m = HW.m = {};
  function DB() { return HW.DB; }

  /* ---------- variants ---------- */
  m.optColor = function (p) { return (p.options || []).find(function (o) { return o.type === 'color'; }); };
  m.optSize = function (p) { return (p.options || []).find(function (o) { return o.type === 'size'; }); };
  m.isCollection = function (p) {
    return Array.isArray(p.options) && p.options.length > 0 && !!m.optColor(p) && !!m.optSize(p) &&
      m.optColor(p).values.length > 0 && m.optSize(p).values.length > 0;
  };
  m.vKey = function (colorId, sizeId) { return colorId + '__' + sizeId; };

  m.genSku = function (p, color, size) {
    var clean = function (s, n) { return String(s || '').replace(/[^A-Za-z0-9]/g, '').slice(0, n).toUpperCase(); };
    var pre = clean(p.skuPrefix || p.name || 'HW', 4) || 'HW';
    return [pre, clean(color && color.label, 3), clean(size && size.label, 6)].filter(Boolean).join('-');
  };

  /* ---------- inventory ---------- */
  function inv() { return (DB() && DB().inventory) || {}; }
  m.invTracked = function (sku) { return !!sku && Object.prototype.hasOwnProperty.call(inv(), sku); };
  m.invQty = function (sku) { var n = parseInt(inv()[sku], 10); return isNaN(n) ? 0 : n; };
  m.invInStock = function (sku, fallback) { return m.invTracked(sku) ? m.invQty(sku) > 0 : fallback; };

  /* Simple products: real SKU when set, else the legacy product id key. */
  m.simpleSku = function (p) { return (p.sku || '').trim() || p.id; };
  m.simpleInStock = function (p) {
    var sku = m.simpleSku(p);
    if (m.invTracked(sku)) return m.invQty(sku) > 0;
    if (sku !== p.id && m.invTracked(p.id)) return m.invQty(p.id) > 0;
    return p.inStock !== false;
  };
  m.simpleQtyKey = function (p) {
    var sku = m.simpleSku(p);
    return m.invTracked(sku) ? sku : (m.invTracked(p.id) ? p.id : sku);
  };

  m.shippingDays = function () {
    var s = (DB() && DB().settings && DB().settings.shippingDays) || '';
    return s.trim() || '2–4 business days';
  };
  /* ---------- dispatch cutoff ----------
     The one deadline on this shop that is genuinely short and genuinely repeats: the hour the
     warehouse stops picking. It resets itself every day because it really does, so it needs no
     minding, and it is about the shopper's parcel rather than our sale — which is the honest way
     to be urgent. A sale countdown that restarted every 24 hours would say something untrue.

     Everything is worked out in the warehouse's own time zone, so the shopper in California and
     the shopper in Maine are told the same, correct thing. */
  var CUT_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  /* How far the warehouse clock is from UTC at this instant — which changes twice a year. */
  /* Built once per zone. A page prices 1833 variants and each one asks what time it is in New
     York; building the formatter afresh every time turned a render into a visible pause. */
  var zoneFmts = {};
  function zoneFmt(zone) {
    return zoneFmts[zone] || (zoneFmts[zone] = new Intl.DateTimeFormat('en-US', { timeZone: zone,
      hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
      minute: '2-digit', second: '2-digit' }));
  }
  function zoneOffset(ts, zone) {
    var f = zoneFmt(zone);
    var p = {};
    f.formatToParts(new Date(ts)).forEach(function (x) { if (x.type !== 'literal') p[x.type] = x.value; });
    var h = +p.hour === 24 ? 0 : +p.hour;
    return Date.UTC(+p.year, +p.month - 1, +p.day, h, +p.minute, +p.second) - ts;
  }
  /* The moment a wall-clock time in the warehouse's zone actually happens. Asked twice so a day
     that changes its offset — the two clock-change weekends — still lands on the right instant. */
  function fromZone(y, mo, d, h, mi, zone) {
    var want = Date.UTC(y, mo, d, h, mi);
    var ts = want - zoneOffset(want, zone);
    return want - zoneOffset(ts, zone);
  }
  function zoneDate(ts, zone) {
    var off = zoneOffset(ts, zone);
    var w = new Date(ts + off);
    return { y: w.getUTCFullYear(), mo: w.getUTCMonth(), d: w.getUTCDate(), dow: w.getUTCDay(),
             h: w.getUTCHours(), mi: w.getUTCMinutes() };
  }

  /* ---------- a sale that opens and closes every day ----------
     The window is two wall-clock times in one zone and it is allowed to cross midnight: 06:00 to
     01:00 is the nineteen hours from six one morning to one the next. Whether it is open is
     decided by the time of day alone — the very same test the database runs when it prices an
     order — so the page and the charge can never disagree about whether the sale is on.
     A window that is switched off, or typed wrong, is simply no window: the sale then runs
     straight through as it always did, rather than vanishing because of a typo. */
  function hhmm(v) {
    var x = String(v || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!x) return null;
    var h = +x[1], mi = +x[2];
    return h >= 0 && h < 24 && mi >= 0 && mi < 60 ? h * 60 + mi : null;
  }
  /* The next instant at which the clock in `zone` reads `mins` past midnight. */
  function nextAt(t, mins, zone) {
    for (var i = 0; i <= 1; i++) {
      var z = zoneDate(t + i * 86400000, zone);
      var at = fromZone(z.y, z.mo, z.d, (mins / 60) | 0, mins % 60, zone);
      if (at > t) return at;
    }
    return null;
  }
  /* Held for the minute it belongs to. Every price on the page asks whether the sale is open, and
     the answer costs five trips through Intl — enough to show on a catalogue render. The key is
     the minute itself rather than "how long since last time", so the answer can never be stale and
     never depends on the order the questions were asked in. */
  var winAt = { key: '', was: null };
  function dailyWindow(d, t) {
    if (!d || !d.enabled) return null;
    var from = hhmm(d.from), to = hhmm(d.to);
    if (from == null || to == null || from === to) return null;
    var zone = d.zone || 'America/New_York';
    var key = from + '|' + to + '|' + zone + '|' + Math.floor(t / 60000);
    if (winAt.key === key) return winAt.was;
    var out = window_(from, to, zone, t);
    winAt.key = key; winAt.was = out;
    return out;
  }
  function window_(from, to, zone, t) {
    var z = zoneDate(t, zone);
    var at = z.h * 60 + z.mi;
    var open = from < to ? (at >= from && at < to) : (at >= from || at < to);
    return open
      ? { open: true, closesAt: nextAt(t, to, zone) }
      : { open: false, opensAt: nextAt(t, from, zone) };
  }
  /* When the next parcel leaves, and how long is left to be on it. Null when it is switched off. */
  m.dispatch = function (now) {
    var c = (DB() && DB().settings && DB().settings.cutoff) || null;
    if (!c || !c.enabled) return null;
    var hm = String(c.time || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!hm) return null;
    var h = +hm[1], mi = +hm[2];
    if (!(h >= 0 && h < 24 && mi >= 0 && mi < 60)) return null;
    var zone = c.zone || 'America/New_York';
    var sat = c.saturday === true;
    var t = now ? +now : Date.now();
    /* Walk forward to the first cutoff that is still ahead and falls on a day we actually ship. */
    for (var i = 0; i < 10; i++) {
      var z = zoneDate(t + i * 86400000, zone);
      var at = fromZone(z.y, z.mo, z.d, h, mi, zone);
      if (at <= t) continue;
      var dow = zoneDate(at, zone).dow;
      if (dow === 0 || (dow === 6 && !sat)) continue;   // Sunday never, Saturday only if we do
      return { at: at, left: at - t, day: CUT_DAYS[dow], today: zoneDate(t, zone).d === zoneDate(at, zone).d };
    }
    return null;
  };

  m.lowStock = function () {
    var n = Number(DB() && DB().settings && DB().settings.lowStockThreshold);
    return n > 0 ? n : 5;
  };

  m.stockLabel = function (sku, inStock) {
    if (!m.invTracked(sku)) return inStock ? 'In stock — ships in ' + m.shippingDays() : 'Out of stock';
    var q = m.invQty(sku);
    if (q <= 0) return 'Out of stock';
    if (q <= m.lowStock()) return 'Only ' + q + ' left — order soon';
    return 'In stock — ships in ' + m.shippingDays();
  };

  m.resolveVariant = function (p, colorId, sizeId) {
    var cOpt = m.optColor(p), sOpt = m.optSize(p);
    var color = cOpt.values.find(function (v) { return v.id === colorId; }) || cOpt.values[0];
    var size = sOpt.values.find(function (v) { return v.id === sizeId; }) || sOpt.values[0];
    var ov = (p.variants && p.variants[m.vKey(color.id, size.id)]) || {};
    var price = ov.price != null && ov.price !== '' ? +ov.price : (size.price != null && size.price !== '' ? +size.price : +p.basePrice);
    var sale = ov.salePrice != null && ov.salePrice !== '' ? +ov.salePrice
      : (size.salePrice != null && size.salePrice !== '' ? +size.salePrice
        : (p.baseSalePrice != null && p.baseSalePrice !== '' ? +p.baseSalePrice : null));
    var sku = ov.sku || m.genSku(p, color, size);
    var baseStock = ov.inStock != null ? ov.inStock : (p.inStock !== false);
    var off = ov.off === true; // a color/size combination that isn't sold
    var ownImgs = (ov.images || []).filter(Boolean);
    var hasOwn = ownImgs.length > 0;
    // The variant's own photos first, then the color's shared photos (care, colour chart…) not already shown.
    var colorImgs = (color.images || []).filter(Boolean);
    var rawImgs = hasOwn ? (ov.images || []).concat(colorImgs.filter(function (x) { return ownImgs.indexOf(x) < 0; })) : (color.images || []);
    var pr = m.priced(p, price, sale);          // every percentage comes off `price`, the list price
    return {
      color: color, size: size, price: pr.price, salePrice: pr.salePrice,
      effective: pr.effective,
      wasPrice: pr.wasPrice,                     // the list price — what the saving is measured from
      timedSale: pr.timedSale,
      percentOff: pr.percentOff, saved: pr.saved,
      onSale: pr.onSale,
      available: !off,
      upc: ov.upc || '',
      weight: ov.weight || null, dims: ov.dims || null,   // grams / cm, for the carrier quote
      sku: sku, inStock: !off && m.invInStock(sku, baseStock),
      rawImages: rawImgs, primary: hasOwn ? (ov.primary || 0) : (color.primary || 0),
      video: hasOwn ? (ov.video || '') : (color.video || '')
    };
  };

  m.eachVariant = function (p, fn) {
    if (!m.isCollection(p)) return;
    m.optColor(p).values.forEach(function (c) {
      m.optSize(p).values.forEach(function (s) { var v = m.resolveVariant(p, c.id, s.id); if (v.available) fn(v, c, s); });
    });
  };
  m.isOffered = function (p, colorId, sizeId) { var ov = (p.variants && p.variants[m.vKey(colorId, sizeId)]) || {}; return ov.off !== true; };
  /* Colors that have at least one combination for sale. */
  m.offeredColors = function (p) {
    var sizes = m.optSize(p).values;
    return m.optColor(p).values.filter(function (c) { return sizes.some(function (s) { return m.isOffered(p, c.id, s.id); }); });
  };

  /* The sizes this product is actually sold in — a size listed with no colour behind it is
     not a size a shopper can buy, and filtering by it would promise an empty page. */
  m.offeredSizes = function (p) {
    if (!m.isCollection(p)) return [];
    var colors = m.optColor(p).values;
    return m.optSize(p).values.filter(function (s) { return colors.some(function (c) { return m.isOffered(p, c.id, s.id); }); });
  };

  /* One size, however it was typed. The catalog holds both 17x24 and 17"X24" for the same
     thing, and a shopper should see one choice, not two — and picking it should find both. */
  /* A written list of sizes. Comma is the natural separator until a size label contains one
     — the towel sets do — so a pipe wins when it is present. */
  /* The shape of a size. Returns nothing when a size is not mapped, because no shape at all
     beats a confident wrong one — a 17x24 is not a half circle. */
  m.shapeFor = function (label) {
    var k = m.sizeKey(label);
    if (!k) return '';
    var rows = ((DB() || {}).settings || {}).sizeShapes || [];
    for (var i = 0; i < rows.length; i++) {
      var hit = m.sizeList(rows[i].sizes).some(function (x) { return m.sizeKey(x) === k; });
      if (hit) return rows[i].shape || '';
    }
    return '';
  };

  m.sizeList = function (text) {
    var s = String(text || '');
    return (s.indexOf('|') >= 0 ? s.split('|') : s.split(','))
      .map(function (x) { return x.trim(); }).filter(Boolean);
  };

  m.sizeKey = function (label) {
    return String(label || '')
      .toLowerCase()
      .replace(/["”″′']/g, '')
      .replace(/\binches?\b|\bin\b/g, '')
      .replace(/\s*[x×]\s*/g, 'x')
      .replace(/[^a-z0-9x.]+/g, ' ')
      .trim();
  };

  /* Sizes read as numbers to a person: 17x24 before 21x34, Set of 2 before Set of 10.
     Plain alphabetical puts "Set of 10" before "Set of 2", which looks like a bug. */
  m.sizeOrder = function (label) {
    var n = String(label).match(/\d+(\.\d+)?/g);
    return n ? Number(n[0]) * 1000 + (n[1] ? Number(n[1]) : 0) : Infinity;
  };

  /* ---------- timed sale ----------
     An extra percentage off while the sale window is open. It stops by itself at the end time: the price,
     the band on the product page and the ribbons on the cards all come from this one setting. */
  m.saleNow = function (now) {
    var s = (DB() || {}).sale;
    if (!s || !s.enabled || !(s.percent > 0)) return null;
    var t = now ? +now : Date.now();
    var when = function (v) { return Date.parse(String(v || '').trim().replace(/([+-]\d\d)$/, '$1:00')); };
    var from = when(s.startsAt), to = when(s.endsAt);
    var out = null;
    if (isFinite(from) && isFinite(to) && t >= from && t < to) {
      /* The daily window narrows the run to the same hours each day, and the countdown then points
         at tonight's close instead of the far end of the whole thing — which is the difference
         between a deadline a shopper can act on and a number nobody can picture. */
      var win = dailyWindow(s.daily, t);
      if (!win || win.open) {
        var ends = win && win.closesAt && win.closesAt < to ? win.closesAt : to;
        out = { name: s.name || 'Sale', ribbon: s.ribbon || 'Sale', percent: s.percent,
                endsAt: ends, startsAt: from, scope: s.scope, s: s, daily: !!win };
      }
    }
    return out;
  };
  /* When the window next opens, for a page that is sitting there while the sale is shut. */
  m.saleOpensAt = function (now) {
    var s = (DB() || {}).sale;
    if (!s || !s.enabled || !(s.percent > 0)) return null;
    var t = now ? +now : Date.now();
    var when = function (v) { return Date.parse(String(v || '').trim().replace(/([+-]\d\d)$/, '$1:00')); };
    var to = when(s.endsAt);
    var win = dailyWindow(s.daily, t);
    if (!win || win.open || !(isFinite(to) && win.opensAt < to)) return null;
    return win.opensAt;
  };
  /* Is this product part of the sale that is running? */
  m.saleFor = function (p) {
    var sale = m.saleNow();
    if (!sale || !p) return null;
    if (sale.scope === 'products') {
      var want = sale.s.productIds || [];
      return want.indexOf(p.id) >= 0 || want.indexOf(p.slug) >= 0 ? sale : null;
    }
    if (sale.scope === 'categories') return (sale.s.categoryIds || []).indexOf(p.categoryId) >= 0 ? sale : null;
    return sale;
  };
  /* ---------- discounts ----------
     One rule, and this is the whole of it: every percentage is measured from the list price, and the
     percentages add up. An everyday 10% with a 15% sale on top is 25% off the list price — not 15%
     off an already-cut price, which is what it used to be. That old way hid the real saving (the
     shopper saw $2.97 off when they were really saving $5.17) and could not be explained in a
     sentence. A sale price typed by hand on a size or a variant still wins outright for that one
     item, and the percentages are then ignored there. */
  m.everydayPercent = function () {
    var e = (DB() || {}).everyday;
    if (!e || !e.enabled) return 0;
    var n = +e.percent;
    return isFinite(n) && n > 0 ? n : 0;
  };
  /* Everything off this product right now: the everyday markdown plus any sale that is running. */
  m.discountPercent = function (p) {
    var sale = m.saleFor(p);
    var total = m.everydayPercent() + (sale ? +sale.percent : 0);
    if (!isFinite(total) || total <= 0) return 0;
    return Math.min(90, total);          // never give it away, whatever gets typed in Admin
  };
  /* List price less every percentage that applies, rounded to the cent exactly as the database
     rounds it, so the page and the card charge can never differ. */
  m.priceAfterDiscount = function (p, list) {
    if (!(list > 0)) return null;
    var pct = m.discountPercent(p);
    if (!pct) return null;
    var cut = Math.round(list * (100 - pct)) / 100;
    return cut > 0 && cut < list ? cut : null;
  };
  /* The single place a selling price is decided, so a card, a product page, the cart, the feed and
     the order can never disagree. `typed` is a hand-entered sale price, which wins when set. */
  m.priced = function (p, list, typed) {
    list = +list;
    var hand = typed != null && typed !== '' && +typed > 0 && +typed < list ? +typed : null;
    /* Changeover guard. Until the store carries an `everyday` setting, prices work the old way —
       the typed sale price first, then the timed sale on top of it. Without this the code deploy
       and the store change would have to land in the same second, and whichever arrived first
       would misprice the shop in between. Delete this branch once `everyday` is saved and the
       typed sale prices are cleared; nothing else depends on it. */
    if (!(DB() || {}).everyday) {
      var sale = m.saleFor(p);
      var base = hand != null ? hand : list;
      var old = sale ? Math.round(base * (100 - sale.percent)) / 100 : base;
      if (!(old > 0) || old > base) old = base;
      /* The saving is measured from the list price, the same as it will be afterwards, so the
         struck price and the saving always add up on screen. Nobody's price changes here. */
      return {
        price: list, wasPrice: list, effective: old,
        salePrice: old < list ? old : null, onSale: old < list,
        percentOff: old < list ? Math.round((1 - old / list) * 100) : 0,
        saved: old < list ? Math.round((list - old) * 100) / 100 : 0,
        timedSale: !!sale
      };
    }
    var cut = hand == null ? m.priceAfterDiscount(p, list) : null;
    var eff = hand != null ? hand : (cut != null ? cut : list);
    var on = eff < list;
    return {
      price: list, wasPrice: list, effective: eff,
      salePrice: on ? eff : null, onSale: on,
      percentOff: on ? Math.round((1 - eff / list) * 100) : 0,
      saved: on ? Math.round((list - eff) * 100) / 100 : 0,
      timedSale: on && hand == null && !!m.saleFor(p)
    };
  };
  /* Kept for callers that still ask "what would the sale make of this price?" */
  m.salePriceOf = function (p, list) { return m.priceAfterDiscount(p, list); };

  /* ---------- prices ---------- */
  m.simplePrice = function (p) {
    return m.priced(p, +p.price, p.salePrice);
  };
  m.priceRange = function (p, lo, hi) {
    if (!m.isCollection(p)) {
      var sp = m.simplePrice(p);
      return { min: sp.effective, max: sp.effective, wasMin: sp.wasPrice, wasMax: sp.wasPrice };
    }
    var vals = [], was = [];
    m.eachVariant(p, function (v) {
      if (!isFinite(v.effective) || (lo != null && v.effective < lo) || (hi != null && v.effective > hi)) return;
      vals.push(v.effective);
      was.push(v.wasPrice != null ? v.wasPrice : v.effective);
    });
    if (!vals.length && (lo != null || hi != null)) return m.priceRange(p);
    if (!vals.length) return { min: 0, max: 0, wasMin: 0, wasMax: 0 };
    var at = vals.indexOf(Math.min.apply(null, vals));
    return { min: Math.min.apply(null, vals), max: Math.max.apply(null, vals),
      wasMin: was[at], wasMax: Math.max.apply(null, was) };
  };

  /* ---------- stock ---------- */
  m.productOut = function (p) {
    if (m.isCollection(p)) {
      var any = false;
      m.eachVariant(p, function (v) { if (v.inStock) any = true; });
      return !any;
    }
    return !m.simpleInStock(p);
  };

  /* ---------- images ---------- */
  m.firstPhoto = function (raw, primary) {
    var list = (raw || []).map(function (x) { return String(x || '').trim(); });
    return list[primary || 0] || list.filter(Boolean)[0] || '';
  };
  /* The same picture, twice. "Move images to Storage" copied every external image into
     Supabase as a WebP and ADDED the copy rather than replacing the original, so every
     migrated photo is in the list twice: once as the slow Dropbox .jpg and once as the
     fast Storage .webp. A shopper scrolls past each feature image two times.

     Matching is by filename, because the two copies share nothing else — different host,
     different extension, and Storage appends a six-character hash. MachineWashable_Blue.jpg
     and machinewashable-blue-n33k6j.webp are one picture.

     The Storage copy wins when both are present: that is the whole point of having moved
     them. This only hides the duplicate; the data still holds both until it is cleaned. */
  function photoKey(url) {
    var name = String(url || '').split('/').pop().split('?')[0];
    try { name = decodeURIComponent(name); } catch (e) { /* leave it as it came */ }
    return name
      .replace(/\.(jpe?g|png|webp|avif|gif)$/i, '')
      .replace(/-[a-z0-9]{6}$/i, '')        // the hash Storage adds
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  }

  function inStorage(url) { return String(url || '').indexOf('/storage/v1/object/public/') >= 0; }

  m.dedupePhotos = function (list) {
    var byKey = {}, order = [];
    (list || []).forEach(function (url) {
      if (!url) return;
      var k = photoKey(url);
      if (!k) { order.push(url); return; }          // nothing to match on: keep it
      if (!(k in byKey)) { byKey[k] = url; order.push(k); return; }
      // Seen before. Trade up to the Storage copy, otherwise keep the first.
      if (!inStorage(byKey[k]) && inStorage(url)) byKey[k] = url;
    });
    return order.map(function (x) { return (x in byKey) ? byKey[x] : x; });
  };

  m.photosWithPrimary = function (raw, primary) {
    var list = (raw || []).map(function (x) { return String(x || '').trim(); }).filter(Boolean);
    var primaryUrl = list[primary || 0];
    var photos = m.dedupePhotos(list);
    // The primary may have been the copy that lost; follow it to the one that survived.
    var start = 0;
    if (primaryUrl) {
      start = photos.indexOf(primaryUrl);
      if (start < 0) {
        var want = photoKey(primaryUrl);
        start = photos.findIndex(function (u) { return photoKey(u) === want; });
      }
    }
    return { photos: photos, start: start < 0 ? 0 : start };
  };
  /* A color's main photo: the first sold size's own photo (the product shot), else the color's shared photos
     (those are often care / feature graphics). */
  m.colorImage = function (p, c) {
    var sizes = m.optSize(p).values;
    for (var i = 0; i < sizes.length; i++) {
      var ov = (p.variants && p.variants[m.vKey(c.id, sizes[i].id)]) || {};
      if (ov.off === true) continue;
      var v = m.firstPhoto(ov.images, ov.primary);
      if (v) return v;
    }
    return m.firstPhoto(c.images, c.primary) || '';
  };
  /* A photo of the fabric itself for the colour button: a set swatch image, else a photo named "…swatch…".
     None found → the colour dot is used, which is always a safe answer.

     There used to be a third guess: any photo whose filename said "close-up". It read as a reasonable
     fallback and was anything but. Across the whole catalogue it never once produced a usable swatch —
     Essence's BMESS_Closeup_*.JPG files are information cards with text printed across them, so the
     colour buttons turned into ten unreadable thumbnails. Every colour that relied on it is better
     served by its own hex dot, which is what 36 colours already do. "…swatch…" stays: it says what the
     file is rather than guessing from a word that means something else here. */
  m.swatchImage = function (p, c) {
    if (c.swatchImage) return c.swatchImage;
    var all = (c.images || []).slice();
    m.optSize(p).values.forEach(function (s) {
      var ov = (p.variants && p.variants[m.vKey(c.id, s.id)]) || {};
      all = all.concat(ov.images || []);
    });
    all = all.map(function (x) { return String(x || '').trim(); }).filter(Boolean);
    var name = function (u) { return u.split('/').pop(); };
    return all.find(function (u) { return /swatch/i.test(name(u)); }) || '';
  };
  /* Labels a product card can carry (Admin › Products › Badge and the CSV "badge" column). */
  m.BADGES = ['New', 'Best Seller', 'Clearance Sale', 'Sale', 'Limited Edition', 'Back in Stock', 'Low Stock'];
  m.primaryImage = function (p) {
    // A photo picked in the admin wins: half a collection's photos are care labels and dimension
    // diagrams, so "the first one" is rarely the shot that should represent the product.
    var chosen = String((p && p.cardImage) || '').trim();
    if (chosen) return chosen;
    if (m.isCollection(p)) {
      var cols = m.optColor(p).values;
      for (var i = 0; i < cols.length; i++) { var u = m.colorImage(p, cols[i]); if (u) return u; }
      return '';
    }
    return m.firstPhoto(p.images, p.primary) || p.image || '';
  };

  /* Small version of an image (made by the admin), or the image itself. */
  m.thumb = function (url) {
    var t = DB() && DB().thumbs;
    return (t && url && t[url]) || url;
  };
  /* srcset for a large image that has a small version. */
  /* A phone at three times pixel density asks for the largest candidate, which for most
     of this catalogue is still the original on Dropbox — and when that does not arrive,
     the main photograph on the page is a broken icon while the thumbnails beside it are
     fine, because those are copies we host ourselves. Until the originals are moved over,
     an image we serve is offered alone rather than risking the one we do not. */
  m.ourOwn = function (url) {
    var base = String((window.HW_CONFIG || {}).supabaseUrl || '').replace(/\/+$/, '');
    var u = String(url || '');
    return !/^https?:/i.test(u) || (!!base && u.indexOf(base) === 0);
  };
  m.shownImage = function (url) { return m.ourOwn(url) ? url : m.thumb(url); };
  m.srcset = function (url) {
    var t = m.thumb(url);
    if (!url || t === url) return '';
    if (!m.ourOwn(url)) return '';
    return HW.asset(t) + ' 700w, ' + HW.asset(url) + ' 1600w';
  };

  /* Brand fallback image: woven swatch as an SVG data URI. */
  m.weaveSwatch = function (color, label) {
    var c = color || '#C9BBA6';
    var txt = HW.u.esc(String(label || '').slice(0, 22).toUpperCase());
    var svg = "<svg xmlns='http://www.w3.org/2000/svg' width='600' height='600'><defs><pattern id='w' width='16' height='16' patternUnits='userSpaceOnUse'>" +
      "<rect width='16' height='16' fill='" + c + "'/><path d='M0 8h16M8 0v16' stroke='rgba(255,255,255,.18)' stroke-width='2'/>" +
      "<path d='M0 0h16M0 0v16' stroke='rgba(0,0,0,.05)' stroke-width='1'/></pattern></defs><rect width='600' height='600' fill='url(#w)'/>" +
      "<rect width='600' height='600' fill='rgba(0,0,0,.04)'/><text x='50%' y='540' text-anchor='middle' font-family='Inter,sans-serif' font-size='20' letter-spacing='3' fill='rgba(42,38,34,.5)'>" + txt + "</text></svg>";
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  };
  m.imageOrSwatch = function (p) {
    var u = m.primaryImage(p);
    if (u) return u;
    var c = m.isCollection(p) ? m.optColor(p).values[0] : null;
    return m.weaveSwatch(c ? c.hex : p.swatch, p.name);
  };
  /* The photo for one size, so a search for "tank lid cover" can show the lid cover itself. */
  m.sizeImage = function (p, size) {
    if (!size || !m.isCollection(p)) return '';
    var cols = m.optColor(p).values;
    for (var i = 0; i < cols.length; i++) {
      var v = (p.variants || {})[m.vKey(cols[i].id, size.id)] || {};
      if (v.off) continue;
      var u = m.firstPhoto(v.images, v.primary);
      if (u) return u;
    }
    return '';
  };
  m.imageAlt = function (p, extra) {
    var base = (p.imageAlt || '').trim() || p.name;
    return extra ? base + ' — ' + extra : base;
  };

  /* ---------- visibility ---------- */
  m.hideOutOfStock = function () { return (DB().settings || {}).outOfStock === 'hide'; };
  m.categoryById = function (id) { return (DB().categories || []).find(function (c) { return c.id === id; }); };
  m.categoryBySlug = function (slug) { return (DB().categories || []).find(function (c) { return c.slug === slug; }); };
  m.productBySlug = function (slug) {
    return (DB().products || []).find(function (p) { return p.slug === slug; }) ||
      (DB().products || []).find(function (p) { return (p.oldSlugs || []).indexOf(slug) >= 0; });
  };

  /* Products shoppers can see in listings. */
  m.listable = function (p) {
    if (p.hidden) return false;
    if (m.hideOutOfStock() && m.productOut(p)) return false;
    return true;
  };
  m.productsIn = function (cat) {
    return (DB().products || []).filter(function (p) { return p.categoryId === cat.id && m.listable(p); });
  };
  m.visibleCategories = function () {
    var showEmpty = !!(DB().settings || {}).showEmptyCategories;
    return (DB().categories || []).filter(function (c) {
      if (c.hidden) return false;
      return showEmpty || m.productsIn(c).length > 0;
    });
  };
  m.visibleSubcategories = function (cat) {
    var showEmpty = !!(DB().settings || {}).showEmptyCategories;
    var items = m.productsIn(cat);
    return (cat.subcategories || []).filter(function (s) {
      return showEmpty || items.some(function (p) { return p.subcategoryId === s.id; });
    });
  };
  /* In-stock first, keeps the admin's order otherwise. */
  m.stockSort = function (list) {
    return list.map(function (p, i) { return { p: p, i: i, out: m.productOut(p) ? 1 : 0 }; })
      .sort(function (a, b) { return a.out - b.out || a.i - b.i; })
      .map(function (x) { return x.p; });
  };

  /* ---------- links ---------- */
  /* Does an in-app link point at something that exists and is visible? */
  m.linkTarget = function (link) {
    var l = HW.schema.normalizeLink(link);
    if (!l) return null;
    if (/^(https?:|mailto:|tel:)/i.test(l)) return { external: true, href: l };
    var path = l.split('?')[0].replace(/\/+$/, '') || '/';
    var parts = path.split('/').filter(Boolean);
    if (!parts.length) return { href: '/' };
    if (parts[0] === 'category') {
      var c = m.categoryBySlug(parts[1]);
      return c && m.visibleCategories().indexOf(c) >= 0 ? { href: l } : null;
    }
    if (parts[0] === 'product') {
      var p = m.productBySlug(parts[1]);
      return p && !p.hidden ? { href: '/product/' + p.slug } : null;
    }
    if (parts[0] === 'page') {
      // The FAQ is a page because questions exist, not because a page record does.
      if (parts[1] === 'faq') return (DB().faq || []).some(function (x) { return x.show !== false; }) ? { href: l } : null;
      var pg = (DB().pages || []).find(function (x) { return x.slug === parts[1]; });
      return pg ? { href: l } : null;
    }
    if (['checkout', 'search'].indexOf(parts[0]) >= 0) return { href: l };
    return null;
  };

  m.pageText = function (s) {
    return String(s || '').split(HW.schema.SHIPPING_TOKEN).join(m.shippingDays());
  };

  /* ---------- promos ---------- */
  // Shoppers only get the advertised newsletter code with the catalog; other codes are checked one at a time
  // (HW.cart.applyPromo → check_promo) and remembered here.
  HW.promoCache = HW.promoCache || {};
  m.findPromo = function (code) {
    var c = String(code || '').trim().toLowerCase();
    if (!c) return null;
    return (DB().promos || []).find(function (p) { return p.active && String(p.code).toLowerCase() === c; }) || HW.promoCache[c] || null;
  };
  m.promoProblem = function (promo, subtotal) {
    var today = new Date().toISOString().slice(0, 10);
    if (promo.startsAt && today < promo.startsAt) return 'That code isn’t active yet.';
    if (promo.endsAt && today > promo.endsAt) return 'That code has expired.';
    if ((promo.minOrder || 0) > subtotal) return 'Spend ' + HW.u.money(promo.minOrder) + ' to use ' + promo.code + '.';
    return '';
  };
  m.promoLabel = function (promo) {
    return promo.type === 'percent' ? promo.value + '% off' : HW.u.money(promo.value) + ' off';
  };
})(window.HW = window.HW || {});
