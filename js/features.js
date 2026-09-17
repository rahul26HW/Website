/* Home Weavers — shopping extras: search, wishlist, recently viewed, image zoom, size guide, cookie consent, structured data. */
(function (HW) {
  'use strict';

  var u = HW.u, esc = u.esc, m = HW.m;

  /* ================================================================ *
   * Structured data (JSON-LD)
   * ================================================================ */
  function absAsset(src) {
    src = String(src || '');
    if (!src || /^data:/.test(src)) return '';
    if (/^https?:\/\//i.test(src)) return src;
    return HW.absUrl('/' + src.replace(/^\/+/, ''));
  }
  HW.ld = {
    breadcrumb: function (items) {
      return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map(function (it, i) {
        return { '@type': 'ListItem', position: i + 1, name: it[0], item: HW.absUrl(it[1]) };
      }) };
    },
    product: function (p) {
      var cat = m.categoryById(p.categoryId);
      var images = [];
      if (m.isCollection(p)) {
        m.optColor(p).values.forEach(function (c) { var s = m.colorImage(p, c); if (s && images.indexOf(s) < 0) images.push(s); });
      } else {
        (p.images || []).filter(Boolean).forEach(function (s) { images.push(s); });
      }
      images = images.slice(0, 8).map(absAsset).filter(Boolean);
      var url = HW.absUrl('/product/' + p.slug);
      var out = m.productOut(p);
      var data = {
        '@context': 'https://schema.org', '@type': 'Product', name: p.name, url: url,
        description: HW.seo.clip(HW.htmlToText(p.description), 5000) || undefined,
        image: images.length ? images : undefined,
        brand: { '@type': 'Brand', name: HW.DB.brand.name || 'Home Weavers' },
        category: cat ? cat.name : undefined,
        material: p.material || undefined
      };
      var availability = out ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock';
      if (m.isCollection(p)) {
        var r = m.priceRange(p), count = 0, firstSku = '';
        m.eachVariant(p, function (v) { count++; if (!firstSku) firstSku = v.sku; });
        data.sku = firstSku || undefined;
        data.offers = { '@type': 'AggregateOffer', priceCurrency: 'USD', lowPrice: r.min.toFixed(2), highPrice: r.max.toFixed(2), offerCount: count, availability: availability, url: url };
      } else {
        data.sku = p.sku || undefined;
        data.offers = { '@type': 'Offer', priceCurrency: 'USD', price: m.simplePrice(p).effective.toFixed(2), availability: availability, itemCondition: 'https://schema.org/NewCondition', url: url };
      }
      return data;
    },
    site: function () {
      var DB = HW.DB, soc = DB.social || {};
      var sameAs = Object.keys(soc).map(function (k) { return soc[k]; }).filter(function (s) { return /^https?:\/\//.test(s); });
      return [
        { '@context': 'https://schema.org', '@type': 'WebSite', name: DB.brand.name, url: HW.absUrl('/'),
          potentialAction: { '@type': 'SearchAction', target: HW.absUrl('/search') + '?q={search_term_string}', 'query-input': 'required name=search_term_string' } },
        { '@context': 'https://schema.org', '@type': 'Organization', name: DB.brand.name, url: HW.absUrl('/'),
          logo: DB.brand.logoImage ? absAsset(DB.brand.logoImage) : undefined,
          email: u.isEmail((DB.contact || {}).email) ? DB.contact.email : undefined, sameAs: sameAs.length ? sameAs : undefined }
      ];
    }
  };

  /* ================================================================ *
   * Wishlist
   * ================================================================ */
  var WKEY = 'hw:wishlist';
  var wish = HW.wishlist = {
    ids: function () { var a = u.store.get(WKEY, []); return Array.isArray(a) ? a : []; },
    has: function (id) { return wish.ids().indexOf(id) >= 0; },
    toggle: function (id, btn) {
      var ids = wish.ids(), i = ids.indexOf(id);
      var p = (HW.DB.products || []).find(function (x) { return x.id === id; });
      if (i >= 0) ids.splice(i, 1); else ids.unshift(id);
      u.store.set(WKEY, ids.slice(0, 100));
      var on = i < 0;
      u.qsa('[data-act="wish"][data-id="' + CSS.escape(id) + '"]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(on));
        b.classList.toggle('on', on);
        var label = (on ? 'Remove ' : 'Save ') + (p ? HW.seo.clip(p.name, 50) : 'item') + (on ? ' from' : ' to') + ' wishlist';
        b.setAttribute('aria-label', label); b.title = on ? 'Saved' : 'Save to wishlist';
        var t = b.querySelector('.wtext'); if (t) t.textContent = on ? 'Saved' : 'Save';
      });
      u.toast(on ? 'Saved to your wishlist' : 'Removed from your wishlist');
      wish.renderCount();
      if (HW.router.current.name === 'wishlist' && !on) HW.router.run({ scroll: false });
    },
    renderCount: function () {
      var valid = wish.ids().filter(function (id) { return (HW.DB.products || []).some(function (p) { return p.id === id && !p.hidden; }); });
      var el = document.getElementById('wishCount');
      if (el) { el.textContent = valid.length; el.hidden = !valid.length; }
      var link = document.getElementById('wishLink');
      if (link) link.setAttribute('aria-label', 'Wishlist, ' + u.plural(valid.length, 'item'));
    },
    button: function (p, cls) {
      var on = wish.has(p.id);
      return '<button type="button" class="' + (cls || 'wish') + (on ? ' on' : '') + '" data-act="wish" data-id="' + esc(p.id) + '" aria-pressed="' + on + '" aria-label="' + (on ? 'Remove ' : 'Save ') + esc(HW.seo.clip(p.name, 50)) + (on ? ' from' : ' to') + ' wishlist" title="' + (on ? 'Saved' : 'Save to wishlist') + '">' +
        '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.6 8.4 3.4 5 6.8 5c2 0 3.4 1.1 4.2 2.4C11.8 6.1 13.2 5 15.2 5c3.4 0 5.2 3.4 4.1 6.3C19.5 15.9 12 20.5 12 20.5z" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>' +
        (cls === 'wishbtn' ? '<span class="wtext">' + (on ? 'Saved' : 'Save') + '</span>' : '') + '</button>';
    }
  };

  HW.views = HW.views || {};
  HW.views.wishlist = function () {
    var items = wish.ids().map(function (id) { return (HW.DB.products || []).find(function (p) { return p.id === id && !p.hidden; }); }).filter(Boolean);
    return {
      html: '<div class="wrap"><nav class="crumb" aria-label="Breadcrumb"><a href="' + HW.link('/') + '">Home</a> &nbsp;/&nbsp; <span aria-current="page">Wishlist</span></nav>' +
        '<div class="listing-head"><div><div class="eyebrow" style="margin-bottom:8px">' + u.plural(items.length, 'item') + '</div><h1>Your wishlist</h1></div></div>' +
        (items.length ? '<div class="p-grid wishgrid">' + items.map(function (p) { return HW.productCard(p, { heading: 'h2' }); }).join('') + '</div>'
          : '<div class="confirm" style="padding:20px 0 80px"><p class="muted">Tap the heart on any product to save it here. Your wishlist is kept on this device.</p><a class="btn" href="' + HW.link('/') + '">Start shopping</a></div>') +
        '<div style="height:70px"></div></div>',
      seo: { title: 'Wishlist', noindex: true }
    };
  };

  /* ================================================================ *
   * Recently viewed
   * ================================================================ */
  var RKEY = 'hw:recent';
  HW.recent = {
    add: function (id) {
      var ids = u.store.get(RKEY, []); if (!Array.isArray(ids)) ids = [];
      ids = [id].concat(ids.filter(function (x) { return x !== id; })).slice(0, 12);
      u.store.set(RKEY, ids);
    },
    section: function (currentId) {
      var ids = u.store.get(RKEY, []); if (!Array.isArray(ids)) return '';
      var list = ids.filter(function (id) { return id !== currentId; })
        .map(function (id) { return (HW.DB.products || []).find(function (p) { return p.id === id; }); })
        .filter(function (p) { return p && m.listable(p); }).slice(0, 4);
      if (!list.length) return '';
      return '<section class="section tight" aria-labelledby="recentHead"><div class="shead" style="margin-bottom:30px"><div class="eyebrow">Picking up where you left off</div>' +
        '<h2 id="recentHead" style="font-size:30px;margin-top:10px">Recently viewed</h2></div>' +
        '<div class="p-grid">' + list.map(function (p) { return HW.productCard(p); }).join('') + '</div></section>';
    }
  };

  /* ================================================================ *
   * Search
   * ================================================================ */
  function norm(s) { return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/["”″]/g, ' in ').replace(/[^a-z0-9]+/g, ' ').trim(); }

  function searchIndex() {
    if (HW._searchIndex && HW._searchIndex.db === HW.DB) return HW._searchIndex.items;
    var items = (HW.DB.products || []).filter(m.listable).map(function (p) {
      var cat = m.categoryById(p.categoryId);
      var sub = cat && (cat.subcategories || []).find(function (s) { return s.id === p.subcategoryId; });
      var colors = m.isCollection(p) ? m.optColor(p).values.map(function (c) { return c.label; }).join(' ') : '';
      var sizes = m.isCollection(p) ? m.optSize(p).values.map(function (s) { return s.label; }).join(' ') : '';
      var skus = [];
      if (m.isCollection(p)) m.eachVariant(p, function (v) { skus.push(v.sku); }); else if (p.sku) skus.push(p.sku);
      return { p: p, name: norm(p.name), meta: norm([cat && cat.name, sub && sub.name, p.material, colors, sizes, p.badge].join(' ')), sku: skus.join(' ').toLowerCase(), body: norm(HW.htmlToText(p.description)) };
    });
    HW._searchIndex = { db: HW.DB, items: items };
    return items;
  }

  HW.search = {
    run: function (q) {
      var terms = norm(q).split(' ').filter(function (t) { return t.length > 0; });
      if (!terms.length) return [];
      var raw = String(q).trim().toLowerCase();
      return searchIndex().map(function (it) {
        var score = 0;
        for (var i = 0; i < terms.length; i++) {
          var t = terms[i], hit = 0;
          if (new RegExp('\\b' + t).test(it.name)) hit = 10;
          else if (it.name.indexOf(t) >= 0) hit = 6;
          else if (new RegExp('\\b' + t).test(it.meta)) hit = 5;
          else if (it.sku.indexOf(t) >= 0) hit = 8;
          else if (t.length > 2 && it.body.indexOf(t) >= 0) hit = 1;
          if (!hit) return null; // every word must match somewhere
          score += hit;
        }
        if (raw.length > 3 && it.sku.split(' ').indexOf(raw) >= 0) score += 50;
        if (m.productOut(it.p)) score -= 3;
        return { p: it.p, score: score };
      }).filter(Boolean).sort(function (a, b) { return b.score - a.score; }).map(function (r) { return r.p; });
    }
  };

  var releaseSearch = null;
  HW.searchPanel = {
    open: function () {
      var panel = document.getElementById('searchPanel');
      if (!panel.hidden) return;
      HW.menu.close(false); HW.cart.close(false);
      panel.hidden = false;
      document.getElementById('searchBtn').setAttribute('aria-expanded', 'true');
      var input = document.getElementById('searchInput');
      releaseSearch = u.trapFocus(panel, HW.searchPanel.close);
      setTimeout(function () { input.focus(); input.select(); }, 40);
      HW.searchPanel.update();
    },
    close: function (restore) {
      var panel = document.getElementById('searchPanel');
      if (panel.hidden) return;
      panel.hidden = true;
      var btn = document.getElementById('searchBtn');
      btn.setAttribute('aria-expanded', 'false');
      if (releaseSearch) { releaseSearch(restore); releaseSearch = null; }
      var a = document.activeElement;
      if (restore !== false && (!a || a === document.body || panel.contains(a))) btn.focus();
    },
    update: u.debounce(function () {
      var input = document.getElementById('searchInput'), box = document.getElementById('searchResults'), status = document.getElementById('searchStatus');
      var q = input.value.trim();
      if (!q) { box.innerHTML = ''; status.textContent = ''; return; }
      var res = HW.search.run(q);
      status.textContent = res.length ? u.plural(res.length, 'result') + ' for “' + q + '”' : 'No products match “' + q + '”';
      box.innerHTML = res.slice(0, 6).map(function (p) {
        var r = m.priceRange(p), out = m.productOut(p);
        return '<li><a class="sres" href="' + HW.link('/product/' + p.slug) + '">' +
          '<img src="' + esc(HW.asset(m.thumb(m.imageOrSwatch(p)))) + '" alt="" width="56" height="56" loading="lazy">' +
          '<span class="snm">' + esc(HW.seo.clip(p.name, 80)) + '<span class="spr">' + (r.min === r.max ? u.money(r.min) : 'from ' + u.money(r.min)) + (out ? ' · Out of stock' : '') + '</span></span></a></li>';
      }).join('') + (res.length > 6 ? '<li><a class="sall link-u" href="' + HW.link('/search?q=' + encodeURIComponent(q)) + '">See all ' + res.length + ' results</a></li>' : '');
    }, 120)
  };

  HW.views.search = function (params) {
    var q = String(params.q || '').trim();
    var res = q ? HW.search.run(q) : [];
    return {
      html: '<div class="wrap"><nav class="crumb" aria-label="Breadcrumb"><a href="' + HW.link('/') + '">Home</a> &nbsp;/&nbsp; <span aria-current="page">Search</span></nav>' +
        '<div class="listing-head"><div><div class="eyebrow" style="margin-bottom:8px" aria-live="polite">' + u.plural(res.length, 'result') + '</div>' +
        '<h1>' + (q ? 'Results for “' + esc(q) + '”' : 'Search') + '</h1></div>' +
        '<form class="searchpage" role="search" data-form="search"><label class="sr-only" for="searchPageInput">Search products</label>' +
        '<input id="searchPageInput" name="q" type="search" value="' + esc(q) + '" placeholder="Search products" autocomplete="off"><button class="btn sm" type="submit">Search</button></form></div>' +
        (res.length ? '<div class="p-grid">' + res.map(function (p) { return HW.productCard(p, { heading: 'h2' }); }).join('') + '</div>'
          : '<div class="confirm" style="padding:10px 0 80px"><p class="muted">' + (q ? 'Nothing matched. Try a simpler word like “rug”, “towel” or a color.' : 'Type what you’re looking for.') + '</p>' +
            '<div class="subnav" style="justify-content:center">' + m.visibleCategories().map(function (c) { return '<a class="chip" href="' + HW.link('/category/' + c.slug) + '">' + esc(c.name) + '</a>'; }).join('') + '</div></div>') +
        '<div style="height:70px"></div></div>',
      seo: { title: q ? 'Search: ' + q : 'Search', noindex: true }
    };
  };

  /* ================================================================ *
   * Image zoom (lightbox)
   * ================================================================ */
  var lb = { items: [], idx: 0, release: null };
  HW.lightbox = {
    open: function (items, idx, alt) {
      lb.items = items.filter(function (it) { return it.type === 'img'; });
      if (!lb.items.length) return;
      lb.idx = Math.max(0, Math.min(idx, lb.items.length - 1)); lb.alt = alt || '';
      var box = document.getElementById('lightbox');
      box.hidden = false;
      document.body.classList.add('noscroll');
      HW.lightbox.show();
      lb.release = u.trapFocus(box.querySelector('.lb-inner'), HW.lightbox.close);
    },
    show: function () {
      var box = document.getElementById('lightbox');
      var it = lb.items[lb.idx];
      var stage = box.querySelector('.lb-stage');
      stage.classList.remove('zoomed');
      stage.innerHTML = '<img src="' + esc(HW.asset(it.src)) + '" alt="' + esc(lb.alt + (lb.items.length > 1 ? ' — photo ' + (lb.idx + 1) + ' of ' + lb.items.length : '')) + '">';
      box.querySelector('.lb-count').textContent = lb.items.length > 1 ? (lb.idx + 1) + ' / ' + lb.items.length : '';
      u.qsa('.lb-nav', box).forEach(function (b) { b.hidden = lb.items.length < 2; });
      var zb = box.querySelector('.lb-zoom'); zb.setAttribute('aria-pressed', 'false'); zb.textContent = 'Zoom in';
    },
    step: function (d) { lb.idx = (lb.idx + d + lb.items.length) % lb.items.length; HW.lightbox.show(); },
    toggleZoom: function (e) {
      var stage = document.querySelector('#lightbox .lb-stage');
      var img = stage.querySelector('img');
      var on = stage.classList.toggle('zoomed');
      var zb = document.querySelector('#lightbox .lb-zoom');
      zb.setAttribute('aria-pressed', String(on)); zb.textContent = on ? 'Zoom out' : 'Zoom in';
      if (on && e && e.clientX != null) HW.lightbox.pan(e);
      else img.style.transformOrigin = '50% 50%';
    },
    pan: function (e) {
      var stage = document.querySelector('#lightbox .lb-stage');
      if (!stage.classList.contains('zoomed')) return;
      var img = stage.querySelector('img'), r = img.getBoundingClientRect();
      var x = Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100)), y = Math.max(0, Math.min(100, (e.clientY - r.top) / r.height * 100));
      img.style.transformOrigin = x + '% ' + y + '%';
    },
    close: function () {
      var box = document.getElementById('lightbox');
      if (box.hidden) return;
      box.hidden = true;
      document.body.classList.remove('noscroll');
      if (lb.release) { lb.release(); lb.release = null; }
    }
  };

  /* ================================================================ *
   * Size guide
   * ================================================================ */
  HW.sizeGuide = {
    available: function () { return !!String((HW.DB.settings || {}).sizeGuide || '').trim(); },
    open: function (trigger) {
      var box = document.getElementById('sizeGuide');
      box.querySelector('.sg-body').innerHTML = HW.richText(m.pageText(HW.DB.settings.sizeGuide));
      box.hidden = false;
      document.body.classList.add('noscroll');
      var release = u.trapFocus(box.querySelector('.sg-inner'), close);
      function close() { box.hidden = true; document.body.classList.remove('noscroll'); release(); if (trigger && trigger.focus) trigger.focus(); box.onclick = null; }
      box.onclick = function (e) { if (e.target === box || e.target.closest('[data-sg-close]')) close(); };
    }
  };

  /* ================================================================ *
   * Cookie consent (necessary only / accept all)
   * ================================================================ */
  var CKEY = 'hw:consent';
  HW.consent = {
    get: function () { return u.store.get(CKEY, null); },
    allowed: function (kind) { var c = HW.consent.get(); return kind === 'necessary' || !!(c && c.level === 'all'); },
    set: function (level) {
      u.store.set(CKEY, { level: level, at: new Date().toISOString(), v: 1 });
      HW.consent.hide();
      u.toast(level === 'all' ? 'Thanks — all cookies accepted' : 'Only necessary cookies will be used');
      document.dispatchEvent(new CustomEvent('hw:consent', { detail: level }));
    },
    show: function () {
      var b = document.getElementById('cookieBanner');
      if (!b) return;
      b.querySelector('.cb-policy').setAttribute('href', HW.link('/page/privacy-policy'));
      b.hidden = false;
    },
    hide: function () { var b = document.getElementById('cookieBanner'); if (b) b.hidden = true; },
    init: function () { if (!HW.consent.get()) HW.consent.show(); }
  };
})(window.HW = window.HW || {});
