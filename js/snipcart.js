/* Home Weavers — optional Snipcart checkout (public API key only). */
(function (HW) {
  'use strict';

  var u = HW.u, esc = u.esc, m = HW.m;
  var loaded = false;

  /* Snipcart shows a fixed "TEST MODE" bar in test mode. Push our header down by its height. */
  function fitTestModeBar() {
    function calc() {
      var off = 0;
      u.qsa('#snipcart *, body > div').forEach(function (el) {
        if (el.children.length > 2) return;
        if (/^test mode$/i.test((el.textContent || '').trim())) {
          var r = el.getBoundingClientRect();
          if (r.top < 70 && r.bottom > off) off = r.bottom;
        }
      });
      document.documentElement.style.setProperty('--snip-top', Math.round(off) + 'px');
    }
    calc();
    var n = 0, iv = setInterval(function () { calc(); if (++n > 24) clearInterval(iv); }, 500);
    window.addEventListener('resize', calc);
  }

  function snipCat(s) { return String(s || '').replace(/[^A-Za-z0-9 \-]/g, '').replace(/\s+/g, ' ').trim(); }

  var snip = HW.snip = {
    enabled: function () {
      var s = HW.DB && HW.DB.snipcart;
      return !!(s && s.enabled && String(s.apiKey || '').trim());
    },
    /* Feed URL always includes the GitHub Pages sub-path (e.g. /Website/products.json). */
    feedUrl: function () {
      var s = (HW.DB && HW.DB.snipcart) || {};
      var f = String(s.feedUrl || '').trim();
      if (/^https?:\/\//i.test(f)) return f;
      return HW.absUrl('/' + (f.replace(/^\/+/, '') || 'products.json'));
    },
    categories: function (p) {
      var cat = m.categoryById(p.categoryId);
      var sub = cat && (cat.subcategories || []).find(function (s) { return s.id === p.subcategoryId; });
      return [snipCat(cat && cat.name), snipCat(sub && sub.name)].filter(Boolean);
    },
    simpleItem: function (p) {
      return { id: m.simpleSku(p), name: p.name, price: m.simplePrice(p).effective, image: HW.asset(m.primaryImage(p)),
        description: HW.htmlToText(p.description).slice(0, 180), weight: p.weight, categories: snip.categories(p) };
    },
    variantItem: function (p, v) {
      return { id: v.sku, name: p.name, price: v.effective, image: HW.asset(m.firstPhoto(v.rawImages, v.primary) || m.colorImage(p, v.color)),
        description: HW.htmlToText(p.description).slice(0, 180), weight: p.weight, categories: snip.categories(p),
        custom: [{ name: 'Color', value: v.color.label }, { name: 'Size', value: v.size.label }] };
    },
    attrs: function (o) {
      var a = 'data-item-id="' + esc(o.id) + '" data-item-name="' + esc(o.name) + '" data-item-price="' + (+o.price || 0).toFixed(2) + '" data-item-url="' + esc(snip.feedUrl()) + '"';
      if (o.image) a += ' data-item-image="' + esc(o.image) + '"';
      if (o.description) a += ' data-item-description="' + esc(o.description) + '"';
      (o.custom || []).forEach(function (c, i) {
        a += ' data-item-custom' + (i + 1) + '-name="' + esc(c.name) + '" data-item-custom' + (i + 1) + '-value="' + esc(c.value) + '" data-item-custom' + (i + 1) + '-type="readonly"';
      });
      if (o.weight) a += ' data-item-weight="' + Math.round(+o.weight) + '"';
      if (o.categories && o.categories.length) a += ' data-item-categories="' + esc(o.categories.join('|')) + '"';
      return a;
    },
    /* Full product feed Snipcart crawls to validate prices. Plain-text descriptions. */
    feed: function () {
      var out = [];
      (HW.DB.products || []).forEach(function (p) {
        if (p.hidden) return;
        if (m.isCollection(p)) {
          m.eachVariant(p, function (v) {
            var it = snip.variantItem(p, v);
            out.push({ id: it.id, name: it.name, price: +(+it.price).toFixed(2), url: snip.feedUrl(), image: it.image, description: it.description, categories: it.categories });
          });
        } else {
          var it = snip.simpleItem(p);
          out.push({ id: it.id, name: it.name, price: +(+it.price).toFixed(2), url: snip.feedUrl(), image: it.image, description: it.description, categories: it.categories });
        }
      });
      return out;
    },
    init: function () {
      var cartBtn = document.getElementById('cartBtn');
      var acct = document.getElementById('acctBtn');
      if (!snip.enabled()) { if (acct) acct.hidden = true; return; }
      var s = HW.DB.snipcart;
      var ver = String(s.version || '3.7.1').trim().replace(/[^0-9.]/g, '');
      if (!loaded) {
        loaded = true;
        window.SnipcartSettings = { publicApiKey: s.apiKey.trim(), loadStrategy: 'on-user-interaction', modalStyle: s.mode || 'side', currency: s.currency || 'usd' };
        var div = document.createElement('div');
        div.id = 'snipcart'; div.hidden = true;
        div.dataset.apiKey = s.apiKey.trim(); div.dataset.configModalStyle = s.mode || 'side'; div.dataset.currency = s.currency || 'usd';
        document.body.appendChild(div);
        var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://cdn.snipcart.com/themes/v' + ver + '/default/snipcart.css'; document.head.appendChild(css);
        var js = document.createElement('script'); js.src = 'https://cdn.snipcart.com/themes/v' + ver + '/default/snipcart.js'; js.async = true; document.body.appendChild(js);
      }
      if (cartBtn) { cartBtn.dataset.act = ''; cartBtn.classList.add('snipcart-checkout'); cartBtn.removeAttribute('aria-expanded'); cartBtn.removeAttribute('aria-controls'); }
      var cc = document.getElementById('cartCount'); if (cc) { cc.classList.add('snipcart-items-count'); cc.textContent = '0'; }
      if (acct) acct.hidden = false;
      fitTestModeBar();
    },
    refresh: function () {}
  };
})(window.HW = window.HW || {});
