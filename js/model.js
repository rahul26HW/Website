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
    return {
      color: color, size: size, price: price, salePrice: sale,
      effective: (sale != null && sale < price) ? sale : price,
      onSale: sale != null && sale < price,
      available: !off,
      upc: ov.upc || '',
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

  /* ---------- prices ---------- */
  m.simplePrice = function (p) {
    var price = +p.price, sale = p.salePrice != null && p.salePrice !== '' ? +p.salePrice : null;
    return { price: price, salePrice: sale, onSale: sale != null && sale < price, effective: (sale != null && sale < price) ? sale : price };
  };
  m.priceRange = function (p, lo, hi) {
    if (!m.isCollection(p)) { var e = m.simplePrice(p).effective; return { min: e, max: e }; }
    var vals = [];
    m.eachVariant(p, function (v) { if (isFinite(v.effective) && (lo == null || v.effective >= lo) && (hi == null || v.effective <= hi)) vals.push(v.effective); });
    if (!vals.length && (lo != null || hi != null)) return m.priceRange(p);
    if (!vals.length) return { min: 0, max: 0 };
    return { min: Math.min.apply(null, vals), max: Math.max.apply(null, vals) };
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
  m.photosWithPrimary = function (raw, primary) {
    var list = (raw || []).map(function (x) { return String(x || '').trim(); });
    var primaryUrl = list[primary || 0];
    var photos = list.filter(Boolean);
    var start = primaryUrl ? photos.indexOf(primaryUrl) : 0;
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
  /* A photo of the fabric itself for the colour button: a set swatch image, else a photo named "…swatch…",
     else a close-up. None found → the colour dot is used. */
  m.swatchImage = function (p, c) {
    if (c.swatchImage) return c.swatchImage;
    var all = (c.images || []).slice();
    m.optSize(p).values.forEach(function (s) {
      var ov = (p.variants && p.variants[m.vKey(c.id, s.id)]) || {};
      all = all.concat(ov.images || []);
    });
    all = all.map(function (x) { return String(x || '').trim(); }).filter(Boolean);
    var name = function (u) { return u.split('/').pop(); };
    return all.find(function (u) { return /swatch/i.test(name(u)); }) || all.find(function (u) { return /close-?up/i.test(name(u)); }) || '';
  };
  /* Labels a product card can carry (Admin › Products › Badge and the CSV "badge" column). */
  m.BADGES = ['New', 'Best Seller', 'Clearance Sale', 'Sale', 'Limited Edition', 'Back in Stock', 'Low Stock'];
  m.primaryImage = function (p) {
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
  m.srcset = function (url) {
    var t = m.thumb(url);
    if (!url || t === url) return '';
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
