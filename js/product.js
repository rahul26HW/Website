/* Home Weavers — product detail page (simple products and color × size collections). */
(function (HW) {
  'use strict';

  var u = HW.u, esc = u.esc, m = HW.m;
  var sel = { pid: null, colorId: null, sizeId: null, qty: 1 };
  var gal = null;

  var ICON_TRUCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 6.5h10.5v8H3zM13.5 9.5H17l3.5 3v2h-7zM7 18a1.6 1.6 0 1 0 0-3.2A1.6 1.6 0 0 0 7 18zM17.5 18a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z" stroke-linejoin="round"/></svg>';
  var ICON_RETURN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function current() { return (HW.DB.products || []).find(function (p) { return p.id === sel.pid; }); }

  /* ---------- gallery ---------- */
  function videoPlayer(url) {
    url = (url || '').trim(); if (!url) return '';
    var mm = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
    if (mm) return '<iframe src="https://www.youtube-nocookie.com/embed/' + mm[1] + '?rel=0&modestbranding=1&playsinline=1" title="Product video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>';
    mm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (mm) return '<iframe src="https://player.vimeo.com/video/' + mm[1] + '" title="Product video" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>';
    if (/\.(mp4|webm|ogg)(\?|#|$)/i.test(url)) return '<video src="' + esc(url) + '" controls playsinline></video>';
    return '';
  }

  function mediaItems(photos, video, fallback) {
    var items = photos.map(function (src) { return { type: 'img', src: src }; });
    if (video && videoPlayer(video)) items.push({ type: 'video', src: video.trim(), poster: photos[0] || '' });
    if (!items.length) items.push({ type: 'img', src: fallback });
    return items;
  }

  function mainHTML(it, alt, eager) {
    if (it.type === 'video') return '<div class="galvideo">' + videoPlayer(it.src) + '</div>';
    return '<button class="zoombtn" type="button" data-act="zoom" aria-label="Zoom photo: ' + esc(alt) + '">' +
      '<img class="ph" src="' + esc(HW.asset(it.src)) + '"' + (m.srcset(it.src) ? ' srcset="' + esc(m.srcset(it.src)) + '" sizes="(max-width: 980px) 92vw, 50vw"' : '') + ' alt="' + esc(alt) + '" width="900" height="900" decoding="async"' + (eager ? ' fetchpriority="high"' : '') + '>' +
      '<span class="zoomhint" aria-hidden="true">⤢ Zoom</span></button>';
  }

  function galleryHTML(items, start, alt) {
    var idx = Math.min(Math.max(start || 0, 0), items.length - 1);
    gal = { items: items, idx: idx, alt: alt };
    var thumbs = items.map(function (it, i) {
      var src = it.type === 'video' ? it.poster : it.src;
      return '<button class="vth ' + (i === idx ? 'active' : '') + '" type="button" data-act="gal" data-i="' + i + '" aria-label="' + (it.type === 'video' ? 'Play video' : 'Show photo ' + (i + 1) + ' of ' + items.length) + '"' + (i === idx ? ' aria-current="true"' : '') + '>' +
        (src ? '<img src="' + esc(HW.asset(m.thumb(src))) + '" alt="" loading="lazy" decoding="async" width="76" height="76">' : '') +
        (it.type === 'video' ? '<span class="vth-play" aria-hidden="true">▶</span>' : '') + '</button>';
    }).join('');
    var arrows = items.length > 6;
    return '<div class="galleryV">' +
      '<div class="vthumbs-wrap">' +
      (arrows ? '<button class="vth-nav" type="button" data-act="gal-scroll" data-dir="-1" aria-label="Scroll thumbnails up">▲</button>' : '') +
      '<div class="vthumbs" id="vthumbs">' + thumbs + '</div>' +
      (arrows ? '<button class="vth-nav" type="button" data-act="gal-scroll" data-dir="1" aria-label="Scroll thumbnails down">▼</button>' : '') +
      '</div><div class="vmain">' +
      '<div class="gallery" id="galMain" aria-live="polite">' + mainHTML(items[idx], alt, true) + '</div>' +
      (items.length > 1 ? '<button class="gnav prev" type="button" data-act="gal-step" data-dir="-1" aria-label="Previous photo">‹</button><button class="gnav next" type="button" data-act="gal-step" data-dir="1" aria-label="Next photo">›</button>' : '') +
      '</div></div>';
  }

  HW.gallery = {
    set: function (i) {
      if (!gal || !gal.items[i]) return;
      gal.idx = i;
      var mEl = document.getElementById('galMain');
      if (mEl) mEl.innerHTML = mainHTML(gal.items[i], gal.alt + (gal.items.length > 1 ? ' — photo ' + (i + 1) : ''), false);
      u.qsa('.vthumbs .vth').forEach(function (b, j) {
        b.classList.toggle('active', j === i);
        if (j === i) { b.setAttribute('aria-current', 'true'); if (b.scrollIntoView) b.scrollIntoView({ block: 'nearest' }); }
        else b.removeAttribute('aria-current');
      });
    },
    step: function (d) {
      if (!gal) return;
      var i = gal.idx + d;
      if (i < 0) i = gal.items.length - 1;
      if (i >= gal.items.length) i = 0;
      HW.gallery.set(i);
    },
    scroll: function (d) { var t = document.getElementById('vthumbs'); if (t) t.scrollBy({ top: d * 200, behavior: 'smooth' }); },
    fit: function () {
      var main = document.querySelector('.vmain'), wrap = document.querySelector('.vthumbs-wrap');
      if (!main || !wrap) return;
      var set = function () { var h = Math.round(main.getBoundingClientRect().height); if (h > 40) wrap.style.height = h + 'px'; };
      set(); requestAnimationFrame(set);
    }
  };

  /* ---------- pieces ---------- */
  function descHTML(p) {
    var html = HW.sanitizeHtml(p.description);
    if (!html) return '';
    var long = HW.htmlToText(p.description).length > 600;
    return '<div class="desc-wrap' + (long ? ' clamped' : '') + '" id="descWrap"><div class="desc" id="pdpDesc">' + html + '</div></div>' +
      (long ? '<button class="desc-more" type="button" data-act="desc-more" aria-expanded="false" aria-controls="pdpDesc">Read more</button>' : '');
  }

  function stepper() {
    return '<div class="stepper" role="group" aria-label="Quantity">' +
      '<button type="button" data-act="qty" data-d="-1" aria-label="Decrease quantity">–</button>' +
      '<span id="pdpQty" aria-live="polite">' + sel.qty + '</span>' +
      '<button type="button" data-act="qty" data-d="1" aria-label="Increase quantity">+</button></div>';
  }

  function notifyHTML(p, sku, what) {
    return '<form class="notify" data-form="notify" data-pid="' + esc(p.id) + '" data-sku="' + esc(sku) + '" novalidate>' +
      '<p><b>' + esc(what) + ' is out of stock.</b> Get an email when it’s back.</p>' +
      '<div class="nrow"><label class="sr-only" for="notifyEmail">Email address</label>' +
      '<input id="notifyEmail" type="email" name="email" autocomplete="email" placeholder="Email address" required>' +
      '<button class="btn loom sm" type="submit">Notify me</button></div>' +
      '<p class="form-msg" role="status" hidden></p></form>';
  }

  function tabsHTML(specs, features, care) {
    var tabs = [];
    var sp = specs.filter(function (s) { return s.value != null && String(s.value).trim() !== ''; });
    if (sp.length) tabs.push({ id: 'details', label: 'Details', html: '<ul class="detail-list flat">' + sp.map(function (s) { return '<li><b>' + esc(s.label) + '</b> ' + esc(s.value) + '</li>'; }).join('') + '</ul>' });
    var ft = (features || []).map(function (s) { return String(s || '').trim(); }).filter(Boolean);
    if (ft.length) tabs.push({ id: 'features', label: 'Features', html: '<ul class="bullets">' + ft.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>' });
    var cl = String(care || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    if (cl.length) tabs.push({ id: 'care', label: 'Care', html: '<ul class="bullets">' + cl.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul>' });

    var sh = HW.DB.shipping || {};
    var shipTitle = sh.enabled && sh.freeThreshold ? 'Complimentary shipping over ' + u.money(sh.freeThreshold) : 'Fast, tracked shipping';
    var f0 = (HW.DB.features || [])[0] || {};
    var row = function (ic, t, s) { return '<div class="passure"><span class="pa-ic">' + ic + '</span><div><b>' + esc(t) + '</b>' + (s ? '<span>' + esc(s) + '</span>' : '') + '</div></div>'; };
    var aside = '<aside class="pdp-aside" aria-label="Shipping and returns">' +
      row(ICON_TRUCK, shipTitle, 'Ships in ' + m.shippingDays()) +
      row(ICON_RETURN, 'Easy returns', 'Not right? See our refund policy') +
      row(HW.SVG.logo, f0.title || 'Woven, not printed', f0.body || 'Crafted to last for years') + '</aside>';

    if (!tabs.length) return '<div class="pdp-tabs"><div class="pdp-tabwrap"><div></div>' + aside + '</div></div>';
    return '<div class="pdp-tabs">' +
      '<div class="pdp-tabnav" role="tablist" aria-label="Product information">' + tabs.map(function (t, i) {
        return '<button class="pdt-btn ' + (i === 0 ? 'active' : '') + '" type="button" role="tab" id="tab-' + t.id + '" aria-controls="pdt-' + t.id + '" aria-selected="' + (i === 0) + '" tabindex="' + (i === 0 ? 0 : -1) + '" data-act="tab" data-tab="' + t.id + '">' + esc(t.label) + '</button>';
      }).join('') + '</div>' +
      '<div class="pdp-tabwrap"><div class="pdp-tabbody">' + tabs.map(function (t, i) {
        return '<div class="pdt-panel ' + (i === 0 ? 'active' : '') + '" id="pdt-' + t.id + '" role="tabpanel" aria-labelledby="tab-' + t.id + '" tabindex="0">' + t.html + '</div>';
      }).join('') + '</div>' + aside + '</div></div>';
  }

  function related(p, cat) {
    var list = m.stockSort((HW.DB.products || []).filter(function (x) { return x.categoryId === p.categoryId && x.id !== p.id && m.listable(x); })).slice(0, 4);
    if (!list.length || !cat) return '';
    return '<section class="section tight" aria-labelledby="relHead"><div class="shead" style="margin-bottom:30px"><div class="eyebrow">You may also like</div>' +
      '<h2 id="relHead" style="font-size:30px;margin-top:10px">More from ' + esc(cat.name) + '</h2></div>' +
      '<div class="p-grid">' + list.map(function (x) { return HW.productCard(x); }).join('') + '</div></section>';
  }

  /* ---------- info column ---------- */
  function simpleInfo(p, cat, sub) {
    var sp = m.simplePrice(p);
    var inStock = m.simpleInStock(p);
    var qtyKey = m.simpleQtyKey(p);
    var buy;
    if (!inStock) buy = '<button class="btn loom" type="button" style="flex:1;justify-content:center" disabled>Out of stock</button>';
    else if (HW.snip.enabled()) buy = '<button id="buyBtn" class="btn loom snipcart-add-item" type="button" style="flex:1;justify-content:center" data-item-quantity="' + sel.qty + '" ' + HW.snip.attrs(HW.snip.simpleItem(p)) + '>Add to cart</button>';
    else buy = '<button id="buyBtn" class="btn loom" type="button" style="flex:1;justify-content:center" data-act="add" data-id="' + esc(p.id) + '" data-from="pdp">Add to cart</button>';
    return {
      html: '<div class="eyebrow">' + esc(cat ? cat.name : '') + (sub ? ' · ' + esc(sub.name) : '') + '</div>' +
        '<h1>' + esc(p.name) + '</h1>' +
        '<div class="price"><span class="now ' + (sp.onSale ? 'on' : '') + '" style="font-weight:600">' + u.money(sp.effective) + '</span>' + (sp.onSale ? '<span class="was"><span class="sr-only">Was </span>' + u.money(sp.price) + '</span>' : '') + '</div>' +
        descHTML(p) +
        '<div class="stocknote ' + (inStock ? 'in' : 'out') + '"><span aria-hidden="true">● </span>' + esc(m.stockLabel(qtyKey, inStock)) + '</div>' +
        '<div class="qtyrow">' + (inStock ? stepper() : '') + buy + '</div>' +
        '<div class="pdpwish">' + HW.wishlist.button(p, 'wishbtn') + '</div>' +
        (inStock ? '' : notifyHTML(p, m.simpleSku(p), 'This item')),
      specs: [{ label: 'SKU', value: p.sku }, { label: 'Material', value: p.material }, { label: 'Origin', value: p.origin }, { label: 'Availability', value: m.stockLabel(qtyKey, inStock) }]
    };
  }

  function collectionInfo(p, cat, sub) {
    var cOpt = m.optColor(p), sOpt = m.optSize(p);
    var v = m.resolveVariant(p, sel.colorId, sel.sizeId);
    var swatches = '<fieldset class="optblock"><legend class="sr-only">' + esc(cOpt.name || 'Color') + '</legend>' +
      '<div class="lab" aria-hidden="true"><span class="t">' + esc(cOpt.name || 'Color') + '</span><span class="v">' + esc(v.color.label) + '</span></div>' +
      '<div class="swatches">' + cOpt.values.map(function (c) {
        var anyIn = sOpt.values.some(function (s) { return m.resolveVariant(p, c.id, s.id).inStock; });
        var on = c.id === v.color.id;
        return '<button class="swatch-btn ' + (on ? 'active' : '') + (anyIn ? '' : ' oos') + '" type="button" style="background:' + esc(c.hex) + '" data-act="color" data-id="' + esc(c.id) + '" data-tip="' + esc(c.label) + '" aria-label="' + esc(c.label) + (anyIn ? '' : ' (sold out)') + '" aria-pressed="' + on + '"></button>';
      }).join('') + '</div></fieldset>';
    var sizes = '<fieldset class="optblock"><legend class="sr-only">' + esc(sOpt.name || 'Size') + '</legend>' +
      '<div class="lab"><span class="t" aria-hidden="true">' + esc(sOpt.name || 'Size') + '</span><span class="v"><span aria-hidden="true">' + esc(v.size.label) + '</span>' +
      (HW.sizeGuide && HW.sizeGuide.available() ? ' <button class="sglink" type="button" data-act="size-guide">Size guide</button>' : '') + '</span></div>' +
      '<div class="sizes">' + sOpt.values.map(function (s) {
        var rv = m.resolveVariant(p, v.color.id, s.id);
        var on = s.id === v.size.id;
        return '<button class="size-btn ' + (on ? 'active' : '') + (rv.inStock ? '' : ' oos') + '" type="button" data-act="size" data-id="' + esc(s.id) + '" aria-pressed="' + on + '" aria-label="' + esc(s.label) + (rv.inStock ? '' : ' (sold out)') + '">' + esc(s.label) + '</button>';
      }).join('') + '</div></fieldset>';

    var buy;
    if (!v.inStock) buy = '<button class="btn loom" type="button" style="flex:1;justify-content:center" disabled>Sold out</button>';
    else if (HW.snip.enabled()) buy = '<button id="buyBtn" class="btn loom snipcart-add-item" type="button" style="flex:1;justify-content:center" data-item-quantity="' + sel.qty + '" ' + HW.snip.attrs(HW.snip.variantItem(p, v)) + '>Add to cart</button>';
    else buy = '<button id="buyBtn" class="btn loom" type="button" style="flex:1;justify-content:center" data-act="add" data-id="' + esc(p.id) + '" data-color="' + esc(v.color.id) + '" data-size="' + esc(v.size.id) + '" data-from="pdp">Add to cart</button>';

    return {
      v: v,
      html: '<div class="eyebrow">' + esc(cat ? cat.name : '') + (sub ? ' · ' + esc(sub.name) : '') + '</div>' +
        '<h1>' + esc(p.name) + '</h1>' +
        '<div class="price" aria-live="polite"><span class="now ' + (v.onSale ? 'on' : '') + '" style="font-weight:600">' + u.money(v.effective) + '</span>' + (v.onSale ? '<span class="was"><span class="sr-only">Was </span>' + u.money(v.price) + '</span>' : '') + '</div>' +
        descHTML(p) + swatches + sizes +
        '<div class="stocknote ' + (v.inStock ? 'in' : 'out') + '" aria-live="polite"><span aria-hidden="true">● </span>' + esc(v.inStock ? m.stockLabel(v.sku, true) : 'This option is currently sold out') + '</div>' +
        '<div class="qtyrow">' + (v.inStock ? stepper() : '') + buy + '</div>' +
        '<div class="pdpwish">' + HW.wishlist.button(p, 'wishbtn') + '</div>' +
        (v.inStock ? '' : notifyHTML(p, v.sku, v.color.label + ' / ' + v.size.label)),
      specs: [{ label: 'SKU', value: v.sku }, { label: 'Material', value: p.material }, { label: 'Origin', value: p.origin }]
    };
  }

  function render(p) {
    var cat = m.categoryById(p.categoryId);
    var sub = cat && (cat.subcategories || []).find(function (s) { return s.id === p.subcategoryId; });
    var info, items, alt = m.imageAlt(p);
    if (m.isCollection(p)) {
      info = collectionInfo(p, cat, sub);
      var pw = m.photosWithPrimary(info.v.rawImages, info.v.primary);
      alt = m.imageAlt(p, info.v.color.label);
      items = mediaItems(pw.photos, info.v.video, m.weaveSwatch(info.v.color.hex, info.v.color.label));
      info.start = pw.start;
    } else {
      info = simpleInfo(p, cat, sub);
      var ps = m.photosWithPrimary(p.images, p.primary);
      items = mediaItems(ps.photos.length ? ps.photos : (p.image ? [p.image] : []), p.video, m.weaveSwatch(p.swatch, p.name));
      info.start = ps.start;
    }
    return {
      cat: cat,
      pdp: '<div class="pdp"><div class="gallerywrap">' + galleryHTML(items, info.start, alt) + '</div><div class="info" id="pdpInfo">' + info.html + '</div></div>',
      tabs: tabsHTML(info.specs, p.features, p.care)
    };
  }

  function rerender() {
    var p = current(); if (!p) return;
    var r = render(p);
    var holder = document.getElementById('pdpTop');
    var active = document.activeElement;
    var focusSel = active && active.dataset && active.dataset.act ? '[data-act="' + active.dataset.act + '"][data-id="' + (active.dataset.id || '') + '"]' : null;
    holder.innerHTML = r.pdp;
    var tabs = document.getElementById('pdpTabs');
    if (tabs) tabs.innerHTML = r.tabs;
    if (focusSel) { var f = holder.querySelector(focusSel); if (f) f.focus(); }
    HW.gallery.fit();
    HW.snip && HW.snip.refresh();
  }

  HW.pdp = {
    zoom: function () { if (gal) HW.lightbox.open(gal.items, gal.idx, gal.alt); },
    color: function (id) { sel.colorId = id; sel.qty = 1; rerender(); },
    size: function (id) { sel.sizeId = id; sel.qty = 1; rerender(); },
    qty: function (d) {
      sel.qty = Math.max(1, Math.min(99, sel.qty + d));
      var el = document.getElementById('pdpQty'); if (el) el.textContent = sel.qty;
      var b = document.getElementById('buyBtn'); if (b && b.classList.contains('snipcart-add-item')) b.setAttribute('data-item-quantity', sel.qty);
    },
    getQty: function () { return sel.qty; },
    tab: function (id, focus) {
      u.qsa('.pdt-btn').forEach(function (b) {
        var on = b.dataset.tab === id;
        b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1;
        if (on && focus) b.focus();
      });
      u.qsa('.pdt-panel').forEach(function (pn) { pn.classList.toggle('active', pn.id === 'pdt-' + id); });
    },
    tabKey: function (e) {
      var tabs = u.qsa('.pdt-btn'); var i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      var n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null;
      if (n == null) return;
      e.preventDefault();
      HW.pdp.tab(tabs[(n + tabs.length) % tabs.length].dataset.tab, true);
    },
    moreDesc: function (btn) {
      var w = document.getElementById('descWrap');
      var open = w.classList.toggle('clamped') === false;
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? 'Read less' : 'Read more';
    },
    notify: async function (form) {
      var input = form.querySelector('input[type=email]');
      var msg = form.querySelector('.form-msg');
      var btn = form.querySelector('button');
      var p = current();
      if (!u.isEmail(input.value)) {
        input.setAttribute('aria-invalid', 'true'); msg.hidden = false; msg.className = 'form-msg err';
        msg.textContent = 'Please enter a valid email address.'; input.focus(); return;
      }
      input.removeAttribute('aria-invalid'); btn.disabled = true;
      try {
        await HW.api.rpc('request_stock_alert', { p_email: input.value.trim(), p_product_id: form.dataset.pid, p_sku: form.dataset.sku || '', p_product_name: p ? p.name : null });
        msg.hidden = false; msg.className = 'form-msg ok';
        msg.textContent = 'Thanks — we’ll email you when it’s back in stock.';
        input.value = '';
      } catch (e) {
        msg.hidden = false; msg.className = 'form-msg err'; msg.textContent = e.message;
      } finally { btn.disabled = false; }
    }
  };

  HW.views = HW.views || {};
  HW.views.product = function (params) {
    var p = m.productBySlug(params.slug);
    if (!p || p.hidden) return HW.views.notfound();
    if (p.slug !== params.slug) history.replaceState({}, '', HW.link('/product/' + p.slug));

    if (sel.pid !== p.id) {
      sel = { pid: p.id, colorId: null, sizeId: null, qty: 1 };
      if (m.isCollection(p)) {
        var cOpt = m.optColor(p), sOpt = m.optSize(p);
        // First color with stock, then its first size with stock.
        var color = cOpt.values.find(function (c) { return sOpt.values.some(function (s) { return m.resolveVariant(p, c.id, s.id).inStock; }); }) || cOpt.values[0];
        var size = sOpt.values.find(function (s) { return m.resolveVariant(p, color.id, s.id).inStock; }) || sOpt.values[0];
        sel.colorId = color.id; sel.sizeId = size.id;
      }
    }
    var r = render(p);
    var cat = r.cat;
    var plain = HW.htmlToText(p.description);
    return {
      html: '<div class="wrap">' +
        '<nav class="crumb" aria-label="Breadcrumb"><a href="' + HW.link('/') + '">Home</a> &nbsp;/&nbsp; ' +
        (cat ? '<a href="' + HW.link('/category/' + cat.slug) + '">' + esc(cat.name) + '</a> &nbsp;/&nbsp; ' : '') +
        '<span aria-current="page">' + esc(HW.seo.clip(p.name, 70)) + '</span></nav>' +
        '<div id="pdpTop">' + r.pdp + '</div>' +
        '<div id="pdpTabs">' + r.tabs + '</div>' +
        related(p, cat) + HW.recent.section(p.id) + '<div style="height:40px"></div></div>',
      seo: {
        title: p.seoTitle || p.name,
        description: p.seoDescription || plain || (p.name + ' from ' + HW.DB.brand.name + '.'),
        path: '/product/' + p.slug,
        type: 'product',
        jsonld: [HW.ld.product(p), HW.ld.breadcrumb([['Home', '/']].concat(cat ? [[cat.name, '/category/' + cat.slug]] : []).concat([[p.name, '/product/' + p.slug]]))],
        image: m.primaryImage(p)
      },
      after: function () { HW.gallery.fit(); HW.recent.add(p.id); }
    };
  };
})(window.HW = window.HW || {});
