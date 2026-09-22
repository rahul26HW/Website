/* Home Weavers — boot, rendering, and one delegated event layer for the storefront. */
(function (HW) {
  'use strict';

  var u = HW.u;
  var main = function () { return document.getElementById('view'); };
  var firstRender = true;

  HW.isAdminView = function () { return document.body.classList.contains('admin-mode'); };

  /* ---------- scroll reveals ---------- */
  var io = null;
  HW.observeReveals = function () {
    var els = u.qsa('.reveal:not(.in)');
    if (!('IntersectionObserver' in window) || u.reducedMotion()) { els.forEach(function (el) { el.classList.add('in'); }); return; }
    if (io) io.disconnect();
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.12 });
    els.forEach(function (el) { io.observe(el); });
  };

  /* ---------- routing -> views ---------- */
  HW.onRoute = function (route, opts) {
    HW.menu.close(false);
    HW.cart.close(false);
    if (HW.searchPanel) HW.searchPanel.close(false);
    if (HW.lightbox) HW.lightbox.close();
    if (HW.hero) HW.hero.stop();

    if (route.name === 'admin') { enterAdmin(); return; }
    document.body.classList.remove('admin-mode');
    document.body.classList.remove('auth-page');

    var viewFn = HW.views[route.name] || HW.views.notfound;
    var view;
    try { view = viewFn(route.params || {}); }
    catch (e) { console.error(e); view = HW.views.notfound(); }

    main().innerHTML = view.html;
    main().classList.remove('booting');
    HW.seo.set(view.seo || {});
    if (view.after) { try { view.after(); } catch (e) { console.error(e); } }
    HW.observeReveals();
    if (HW.rails) HW.rails.init();
    if (HW.measure) {
      var pid = route.name === 'product' && HW.pdp && HW.pdp.currentId ? HW.pdp.currentId() : '';
      HW.measure.page(location.pathname.slice(HW.router.base.length) || '/', pid);
      HW.measure.cards(main());
      if (route.name === 'checkout') HW.measure.checkout();
    }
    if (firstRender && HW.consent) HW.consent.init();

    if (opts && opts.scroll) window.scrollTo(0, 0);
    if (!firstRender) {
      // Move keyboard / screen-reader focus to the new page content.
      var h1 = main().querySelector('h1');
      var target = h1 && !h1.classList.contains('sr-only') ? h1 : main();
      if (target !== main()) target.setAttribute('tabindex', '-1');
      try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
    }
    firstRender = false;
  };

  function enterAdmin() {
    document.body.classList.add('admin-mode');
    HW.seo.set({ title: 'Admin', noindex: true });
    // Never run inside another site's frame (clickjacking); GitHub Pages can't send X-Frame-Options.
    var framed = true; try { framed = window.top !== window.self; } catch (e) {}
    if (framed) { document.getElementById('admin').innerHTML = '<div class="loading">Open the admin in its own tab.</div>'; return; }
    if (HW.admin) { HW.admin.enter(); return; }
    var s = document.createElement('script');
    s.src = HW.asset('js/admin/admin.js');
    s.onload = function () { if (HW.admin) HW.admin.enter(); };
    s.onerror = function () { document.getElementById('admin').innerHTML = '<div class="loading">The admin couldn’t load. Check your connection and refresh.</div>'; };
    document.body.appendChild(s);
  }

  /* ---------- delegated events ---------- */
  var actions = {
    'menu-open': function () { HW.menu.open(); },
    'menu-close': function () { HW.menu.close(); },
    'cart-toggle': function () { HW.cart.toggle(); },
    'cart-close': function () { HW.cart.close(false); },
    'cart-qty': function (el) { HW.cart.change(el.dataset.key, +el.dataset.d); },
    'cart-remove': function (el) { HW.cart.remove(el.dataset.key); },
    'promo-remove': function () { HW.cart.removePromo(); },
    add: function (el) {
      var qty = el.dataset.from === 'pdp' ? HW.pdp.getQty() : 1;
      HW.cart.add(el.dataset.id, qty, el.dataset.color, el.dataset.size);
    },
    'hero-prev': function () { HW.hero.step(-1); },
    'hero-next': function () { HW.hero.step(1); },
    'hero-to': function (el) { HW.hero.to(+el.dataset.i); },
    'hero-toggle': function (el) { HW.hero.toggle(el); },
    rail: function (el) { HW.rails.scroll(el.dataset.rail, +el.dataset.dir); },
    color: function (el) { HW.pdp.color(el.dataset.id); },
    'sw-scroll': function (el) { HW.pdp.swScroll(+el.dataset.dir); },
    size: function (el) { HW.pdp.size(el.dataset.id); },
    qty: function (el) { HW.pdp.qty(+el.dataset.d); },
    tab: function (el) { HW.pdp.tab(el.dataset.tab); },
    'desc-more': function (el) { HW.pdp.moreDesc(el); },
    gal: function (el) { HW.gallery.set(+el.dataset.i); },
    'gal-step': function (el) { HW.gallery.step(+el.dataset.dir); },
    'gal-scroll': function (el) { HW.gallery.scroll(+el.dataset.dir); },
    'cf-clear': function () { HW.catalog.clear(); },
    'cf-toggle': function (el) { HW.catalog.toggleSidebar(el); },
    'search-open': function () { HW.searchPanel.open(); },
    'search-close': function () { HW.searchPanel.close(); },
    wish: function (el) { HW.wishlist.toggle(el.dataset.id, el); },
    zoom: function (el) { HW.pdp.zoom(el); },
    'lb-close': function () { HW.lightbox.close(); },
    'lb-step': function (el) { HW.lightbox.step(+el.dataset.dir); },
    'lb-zoom': function (el, e) { HW.lightbox.toggleZoom(el.classList.contains('lb-stage') ? e : null); },
    'size-guide': function (el) { HW.sizeGuide.open(el); },
    consent: function (el) { HW.consent.set(el.dataset.level); },
    'pay-order': function (el) { HW.checkout.payAgain(el); },
    'cancel-order': function (el) { HW.orderCancel.run(el); },
    'co-qty': function (el) { HW.checkout.qty(el); },
    'co-remove': function (el) { HW.checkout.remove(el); },
    'cancel-ask': function (el) { HW.orderCancel.request(el); },
    'acct-signout': function () { HW.account.signOut(); },
    'acct-restart': function () { HW.account.restart(); },
    'acct-resend': function (el) { HW.account.resend(el); },
    'acct-signout-all': function (el) { HW.account.signOutAll(el); },
    'acct-delete': function (el) { HW.account.remove(el); },
    'acct-read': function () { HW.account.markRead(); },
    'acct-addr-new': function () { HW.account.addr.edit(); },
    'acct-addr-edit': function (el) { HW.account.addr.edit(el.dataset.id); },
    'acct-addr-cancel': function () { HW.account.addr.cancel(); },
    'acct-addr-default': function (el) { HW.account.addr.setDefault(el); },
    'acct-addr-del': function (el) { HW.account.addr.remove(el); },
    'acct-addr-import': function (el) { HW.account.addr.importLast(el); },
    reload: function () { location.reload(); },
    'consent-settings': function () { HW.consent.show(); var b = document.querySelector('#cookieBanner button'); if (b) b.focus(); }
  };

  var forms = {
    newsletter: function (f) { HW.subscribe(f); },
    promo: function (f) { HW.cart.applyPromo(f.querySelector('input').value); },
    checkout: function (f) { HW.checkout.submit(f); },
    contact: function (f) { HW.contact.submit(f); },
    track: function (f) { HW.track.submit(f); },
    'acct-email': function (f) { HW.account.sendCode(f); },
    'acct-code': function (f) { HW.account.verify(f); },
    'acct-profile': function (f) { HW.account.saveSettings(f); },
    'acct-address': function (f) { HW.account.addr.save(f); },
    'acct-return': function (f) { HW.account.requestReturn(f); },

    notify: function (f) { HW.pdp.notify(f); },
    search: function (f) {
      var q = f.querySelector('input[name=q]').value.trim();
      HW.searchPanel.close(false);
      HW.router.navigate('/search' + (q ? '?q=' + encodeURIComponent(q) : ''));
    }
  };

  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    var b = document.querySelector('form[data-form="checkout"] button[type=submit]');
    if (b && b.disabled && /Opening secure payment|Saving your order/.test(b.textContent)) HW.router.run({ scroll: false });
  });

  function wireEvents() {
    /* A small image that fails (a CDN hiccup) would leave an empty box, so fall back to the full-size photo. */
    document.addEventListener('error', function (e) {
      var img = e.target;
      if (!img || img.tagName !== 'IMG' || img.dataset.fallback) return;
      img.dataset.fallback = '1';
      var src = img.currentSrc || img.src, thumbs = (HW.DB && HW.DB.thumbs) || {}, full = '';
      for (var k in thumbs) { if (HW.asset(thumbs[k]) === src) { full = k; break; } }
      img.removeAttribute('srcset');
      img.src = full ? HW.asset(full) : src + (src.indexOf('?') < 0 ? '?' : '&') + 'retry=1';
    }, true);

    document.addEventListener('click', function (e) {
      var card = e.target.closest && e.target.closest('[data-pclick]');
      if (card && HW.measure) HW.measure.click(card.getAttribute('data-pclick'));
      var el = e.target.closest('[data-act]');
      if (!el || HW.isAdminView() && !el.closest('.store, #cartDrawer, #mnav')) return;
      var fn = actions[el.dataset.act];
      if (!fn || el.tagName === 'INPUT' || el.tagName === 'SELECT') return;
      if (el.tagName === 'BUTTON') e.preventDefault();
      fn(el, e);
    });
    document.addEventListener('submit', function (e) {
      var f = e.target.closest('form[data-form]');
      if (!f || !forms[f.dataset.form]) return;
      e.preventDefault();
      forms[f.dataset.form](f);
    });
    document.addEventListener('change', function (e) {
      var el = e.target;
      if (el.dataset.act === 'cf') HW.catalog.toggle(el);
      else if (el.dataset.act === 'cf-num') HW.catalog.num(el);
      else if (el.dataset.act === 'sort') HW.catalog.sort(el);
      else if (el.dataset.act === 'acct-sub') HW.account.subscribe(el);
      else if ((el.name === 'pay' || el.id === 'co_state') && el.closest('form[data-form="checkout"]')) HW.checkout.payChanged(el.closest('form'));
      else if (el.dataset.act === 'acct-ret-order') HW.account.returnOrder(el);
    });
    document.addEventListener('input', function (e) {
      var el = e.target;
      if (el.id === 'searchInput') HW.searchPanel.update();
      if (el.dataset.act === 'cf-range') HW.catalog.range(el);
      var f = el.closest('form[data-form="checkout"]');
      if (f) HW.checkout.saveDraft(f);
    });
    document.addEventListener('mousemove', function (e) {
      if (e.target.closest && e.target.closest('#lightbox .lb-stage')) HW.lightbox.pan(e);
    }, { passive: true });
    document.addEventListener('keydown', function (e) {
      if (!document.getElementById('lightbox').hidden && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { HW.lightbox.step(e.key === 'ArrowLeft' ? -1 : 1); return; }
      // "/" opens search (outside text fields).
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !HW.isAdminView()) { e.preventDefault(); HW.searchPanel.open(); return; }
      if (e.target.classList && e.target.classList.contains('pdt-btn')) HW.pdp.tabKey(e);
      if (e.target.closest && e.target.closest('#galMain, .vmain') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        HW.gallery.step(e.key === 'ArrowLeft' ? -1 : 1);
      }
    });
    window.addEventListener('resize', u.debounce(function () {
      if (HW.rails) HW.rails.init();
      if (HW.gallery) HW.gallery.fit();
      if (HW.fitSwatches) HW.fitSwatches();
    }, 150));
  }

  /* ---------- data ---------- */
  function useData(data) {
    HW.DB = HW.schema.normalizeStore(JSON.parse(JSON.stringify(data || {})));
    HW.cart.prune();
  }

  HW.reloadStore = async function () {
    var row = await HW.api.loadStore();
    useData(row && row.data);
    HW.paintChrome();
    return HW.DB;
  };

  function showFatal(text) {
    main().innerHTML = '<div class="wrap"><div class="loading"><div><div class="weave-rule" style="margin-bottom:14px">' + HW.SVG.weave + '</div>' +
      '<p>' + u.esc(text) + '</p><button class="btn" type="button" data-act="reload">Try again</button></div></div></div>';
  }

  async function boot() {
    wireEvents();
    if (!HW.api.configured()) { showFatal('The store isn’t connected yet. Add your Supabase details to js/config.js.'); return; }

    var cached = HW.api.cachedStore();
    if (cached) {
      useData(cached.data);
      HW.paintChrome();
      HW.snip.init();
      HW.router.start();
      refreshInBackground(cached.at);
      return;
    }

    var row;
    try {
      row = await HW.api.loadStore();
      useData(row && row.data);
    } catch (e) {
      showFatal('We’re having trouble loading the store. Please check your connection and try again.');
      return;
    }
    HW.paintChrome();
    HW.snip.init();
    HW.router.start();
    if (row && row.fromSnapshot) refreshInBackground(row.updated_at);
  }

  /* If the store changed since this copy, swap in the new data. Re-render only pages without forms in progress. */
  function refreshInBackground(at) {
    HW.api.checkFresh(at).then(function (row) {
      if (!row || !row.data) return;
      useData(row.data);
      HW.paintChrome();
      var r = HW.router.current.name;
      var typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      if (['home', 'category', 'product', 'notfound', 'search', 'wishlist'].indexOf(r) >= 0 && !typing) HW.router.run({ scroll: false });
    }).catch(function () {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.HW = window.HW || {});
