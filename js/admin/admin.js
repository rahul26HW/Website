/* Home Weavers — admin loader. Loads the admin styles, supabase-js and the admin modules on /admin only. */
(function (HW) {
  'use strict';

  var FILES = ['core.js', 'media.js', 'sample.js', 'tab-dashboard.js', 'tab-storefront.js', 'tab-banner.js', 'tab-pages.js',
    'tab-categories.js', 'tab-products.js', 'tab-products-csv.js', 'tab-inventory.js', 'tab-orders.js', 'tab-promotions.js', 'tab-marketing.js'];
  // Served from this site (copied from the npm package @supabase/supabase-js 2.116.0) — no third-party script CDN.
  var SUPABASE_JS = HW.asset('js/vendor/supabase-js-2.116.0.js');
  var loading = null;

  function script(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.async = false;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Could not load ' + src)); };
      document.body.appendChild(s);
    });
  }

  function load() {
    if (loading) return loading;
    if (!document.querySelector('link[data-admin-css]')) {
      var css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = HW.asset('css/admin.css'); css.setAttribute('data-admin-css', '');
      document.head.appendChild(css);
    }
    loading = (window.supabase ? Promise.resolve() : script(SUPABASE_JS))
      .then(function () {
        return FILES.reduce(function (p, f) { return p.then(function () { return script(HW.asset('js/admin/' + f)); }); }, Promise.resolve());
      });
    return loading;
  }

  HW.admin = {
    enter: function () {
      var root = document.getElementById('admin');
      // Never run the admin inside another site's frame (clickjacking). GitHub Pages can't send a frame-blocking header.
      if (window.top !== window.self) {
        root.innerHTML = '<div class="login"><div class="box"><p>For your security, the admin can’t be opened inside another page.</p><p><a href="' + HW.u.esc(location.href) + '" target="_top" rel="noopener">Open the admin directly</a></p></div></div>';
        return;
      }
      if (!HW.A) root.innerHTML = '<div class="login"><div class="box"><p class="muted" style="margin:0">Loading admin…</p></div></div>';
      load().then(function () { HW.A.enter(); }).catch(function (e) {
        loading = null;
        root.innerHTML = '<div class="login"><div class="box"><p>The admin couldn’t load. Check your connection and refresh.</p><p class="hint">' + HW.u.esc(e.message) + '</p></div></div>';
      });
    }
  };
})(window.HW = window.HW || {});
