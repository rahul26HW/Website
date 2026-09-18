/* Home Weavers — path routing that works on GitHub Pages sub-paths (/Website/). */
(function (HW) {
  'use strict';

  var ROUTES = ['category', 'product', 'page', 'admin', 'checkout', 'order', 'search', 'wishlist', 'account'];

  function computeBase() {
    var cfg = window.HW_CONFIG || {};
    if (cfg.basePath) return ('/' + cfg.basePath.replace(/^\/+|\/+$/g, '') + '/').replace(/\/+/g, '/');
    try {
      var segs = location.pathname.split('/').filter(Boolean);
      if (/github\.io$/i.test(location.hostname) && segs.length && ROUTES.indexOf(segs[0]) < 0 && !/\.html?$/.test(segs[0])) {
        return '/' + segs[0] + '/';
      }
    } catch (e) {}
    return '/';
  }

  var r = HW.router = { base: computeBase(), current: { name: 'home', params: {} } };

  /* App path ("/product/x") -> real href ("/Website/product/x"). */
  HW.link = function (p) {
    p = String(p == null ? '/' : p);
    if (/^(https?:|mailto:|tel:)/i.test(p)) return p;
    if (/^#\//.test(p)) p = p.slice(1);
    if (p.charAt(0) === '/') p = p.slice(1);
    return r.base + p;
  };
  /* Local asset ("assets/x.jpg") -> absolute under the base. Full URLs pass through. */
  HW.asset = function (p) {
    p = String(p == null ? '' : p);
    if (!p || /^(https?:|data:|blob:)/i.test(p)) return p;
    if (p.charAt(0) === '/') p = p.slice(1);
    return r.base + p;
  };
  /* Absolute URL for canonical / Open Graph / feeds. */
  HW.absUrl = function (p) {
    var site = ((HW.DB && HW.DB.settings && HW.DB.settings.siteUrl) || '').trim();
    var path = HW.link(p);
    if (site) return site.replace(/\/+$/, '') + '/' + path.slice(r.base.length);
    return location.origin + path;
  };

  r.parse = function () {
    var path = location.pathname;
    if (path.indexOf(r.base) === 0) path = path.slice(r.base.length);
    path = path.replace(/^\/+/, '').replace(/index\.html$/, '');
    var parts = path.split('/').filter(Boolean).map(function (x) { try { return decodeURIComponent(x); } catch (e) { return x; } });
    var q = {};
    try { new URLSearchParams(location.search).forEach(function (v, k) { q[k] = v; }); } catch (e) {}
    if (!parts.length) return { name: 'home', params: q };
    switch (parts[0]) {
      case 'admin': return { name: 'admin', params: q };
      case 'category': return parts[1] ? { name: 'category', params: { slug: parts[1], sub: q.sub, sort: q.sort } } : { name: 'notfound', params: {} };
      case 'product': return parts[1] ? { name: 'product', params: { slug: parts[1] } } : { name: 'notfound', params: {} };
      case 'page': return parts[1] ? { name: 'page', params: { slug: parts[1] } } : { name: 'notfound', params: {} };
      case 'checkout': return { name: 'checkout', params: q };
      case 'order': return parts[1] ? { name: 'order', params: { number: parts[1] } } : { name: 'notfound', params: {} };
      case 'search': return { name: 'search', params: { q: q.q || '' } };
      case 'wishlist': return { name: 'wishlist', params: {} };
      case 'account': return { name: 'account', params: Object.assign({}, q, { section: parts[1] || '', id: parts[2] || '' }) };
      default: return { name: 'notfound', params: {} };
    }
  };

  r.navigate = function (p, opts) {
    opts = opts || {};
    var href = HW.link(p);
    if (opts.replace) history.replaceState({}, '', href);
    else history.pushState({}, '', href);
    r.run({ scroll: opts.scroll !== false });
  };

  r.run = function (opts) {
    opts = opts || {};
    r.current = r.parse();
    if (HW.onRoute) HW.onRoute(r.current, opts);
  };

  r.start = function () {
    // Deep link that arrived through 404.html ("/?/product/x").
    if (window.HW_REDIRECT) {
      // Pin the tab icon to its full address first; relative, it would be looked up under the restored folder.
      var icon = document.querySelector('link[rel="icon"]'); if (icon) icon.href = icon.href;
      history.replaceState(null, '', window.HW_REDIRECT); window.HW_REDIRECT = null;
    }
    // Legacy "#/product/x" links from the old site.
    if (/^#\//.test(location.hash)) history.replaceState({}, '', HW.link(location.hash.slice(1)));

    window.addEventListener('popstate', function () { r.run({ scroll: false }); });

    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest ? e.target.closest('a[href]') : null;
      if (!a || a.closest('#snipcart')) return;
      var href = a.getAttribute('href');
      if (!href || a.target === '_blank' || a.hasAttribute('download') || a.dataset.native != null) return;
      if (href.charAt(0) === '#') {
        if (href.charAt(1) === '/') { e.preventDefault(); r.navigate(href.slice(1)); }
        return;
      }
      if (/^(mailto:|tel:)/i.test(href)) return;
      var url;
      try { url = new URL(a.href, location.href); } catch (err) { return; }
      if (url.origin !== location.origin || url.pathname.indexOf(r.base) !== 0) return;
      if (/\.(json|xml|txt|jpe?g|png|webp|pdf|csv)$/i.test(url.pathname)) return;
      e.preventDefault();
      history.pushState({}, '', url.pathname + url.search + url.hash);
      r.run({ scroll: true });
    });

    r.run({ scroll: false, first: true });
  };
})(window.HW = window.HW || {});
