/* Home Weavers — first-party measurement for the admin's Analytics screen.
   What it records: a page was visited, a product was looked at, a product card was seen or clicked,
   something went in a cart, checkout was opened — plus where the visit came from and whether it is a
   phone, tablet or computer. What it never records: names, emails, addresses, order contents, IP
   addresses or anything that follows a person between visits. The visit id is a random number kept for
   this browser tab only and is gone when the tab closes; nothing is sent to another company. */
(function (HW) {
  'use strict';

  var cfg = window.HW_CONFIG || {};
  var VKEY = 'hw:visit', SKEY = 'hw:visit:src', SEEN = 'hw:seen', STARTED = 'hw:visit:on';
  var queue = [], timer = null, seenCards = {}, viewedPath = {};

  function ok() { return !!(cfg.supabaseUrl && cfg.supabasePublishableKey); }

  function rnd() {
    var a = new Uint8Array(12);
    (window.crypto || {}).getRandomValues ? window.crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.random() * 256; });
    return Array.prototype.map.call(a, function (b) { return (b + 0x100).toString(16).slice(1); }).join('');
  }

  function session(key, make) {
    try {
      var v = sessionStorage.getItem(key);
      if (!v && make) { v = make(); sessionStorage.setItem(key, v); }
      return v || '';
    } catch (e) { return make ? make() : ''; }
  }

  /* Where this visit came from: what the address bar says first, then the site that linked here. */
  function origin() {
    var saved = session(SKEY, null);
    if (saved) { try { return JSON.parse(saved); } catch (e) { /* fall through */ } }
    var q = new URLSearchParams(location.search);
    var src = (q.get('utm_source') || '').slice(0, 60), med = (q.get('utm_medium') || '').slice(0, 20);
    var ref = '';
    try { ref = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : ''; } catch (e) { ref = ''; }
    var here = location.hostname.replace(/^www\./, '');
    var out;
    if (src) out = { s: src, m: med || 'referral' };
    else if (q.get('gclid')) out = { s: 'Google Ads', m: 'paid' };
    else if (q.get('fbclid')) out = { s: 'Facebook', m: 'paid' };
    else if (!ref || ref === here) out = { s: 'Direct', m: 'direct' };
    else if (/(^|\.)google\./.test(ref)) out = { s: 'Google — free search', m: 'organic' };
    else if (/(^|\.)(bing|duckduckgo|yahoo|ecosia)\./.test(ref)) out = { s: ref.split('.')[0].replace(/^./, function (c) { return c.toUpperCase(); }) + ' — free search', m: 'organic' };
    else if (/instagram\./.test(ref)) out = { s: 'Instagram', m: 'social' };
    else if (/facebook\.|fb\./.test(ref)) out = { s: 'Facebook', m: 'social' };
    else if (/pinterest\./.test(ref)) out = { s: 'Pinterest', m: 'social' };
    else if (/tiktok\./.test(ref)) out = { s: 'TikTok', m: 'social' };
    else if (/(^|\.)(x|twitter)\./.test(ref)) out = { s: 'X', m: 'social' };
    else out = { s: ref.slice(0, 60), m: 'referral' };
    try { sessionStorage.setItem(SKEY, JSON.stringify(out)); } catch (e) { /* private window */ }
    return out;
  }

  function device() {
    var w = window.innerWidth || 1200;
    return w < 768 ? 'mobile' : w < 1100 ? 'tablet' : 'desktop';
  }

  function firstTime() {
    try {
      if (localStorage.getItem(SEEN)) return false;
      localStorage.setItem(SEEN, '1');
      return true;
    } catch (e) { return false; }
  }

  function send(leaving) {
    if (!queue.length || !ok()) return;
    var batch = queue.splice(0, 30);
    var body = JSON.stringify({ p_batch: batch });
    var url = cfg.supabaseUrl + '/rest/v1/rpc/track_events';
    try {
      // On the way out a beacon still gets through; the key goes in the address because a beacon carries no headers.
      if (leaving && navigator.sendBeacon) {
        navigator.sendBeacon(url + '?apikey=' + encodeURIComponent(cfg.supabasePublishableKey), new Blob([body], { type: 'application/json' }));
        return;
      }
      fetch(url, {
        method: 'POST', keepalive: !!leaving, mode: 'cors',
        headers: { apikey: cfg.supabasePublishableKey, 'Content-Type': 'application/json' },
        body: body
      }).catch(function () { /* measurement must never get in the way */ });
    } catch (e) { /* ignore */ }
  }

  function push(e) {
    if (!ok()) return;
    e.v = session(VKEY, rnd);
    queue.push(e);
    if (queue.length >= 20) { clearTimeout(timer); send(false); return; }
    clearTimeout(timer);
    timer = setTimeout(function () { send(false); }, 900);
  }

  var M = {
    source: function () { return origin(); },

    /* One "visit" per browser tab, then a "view" for every page. */
    page: function (path, productId) {
      if (!ok()) return;
      var o = origin();
      // One visit per browser tab, even when a link loads a fresh page.
      if (!session(STARTED, null)) {
        try { sessionStorage.setItem(STARTED, '1'); } catch (e) { /* private window */ }
        push({ k: 'visit', p: path, s: o.s, m: o.m, d: device(), n: firstTime() ? '1' : '' });
      }
      if (viewedPath[path + '|' + (productId || '')]) return;
      viewedPath[path + '|' + (productId || '')] = 1;
      push({ k: 'view', p: path, id: productId || '', s: o.s, m: o.m, d: device() });
    },

    /* A product card actually scrolled into view, counted once per product per tab. */
    cards: function (root) {
      if (!ok() || !window.IntersectionObserver) return;
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          io.unobserve(en.target);
          var id = en.target.getAttribute('data-pid');
          if (!id || seenCards[id]) return;
          seenCards[id] = 1;
          push({ k: 'impression', id: id, d: device() });
        });
      }, { threshold: 0.5 });
      HW.u.qsa('.pcard[data-pid]', root || document).forEach(function (c) { io.observe(c); });
    },

    click: function (productId) { push({ k: 'click', id: productId || '', d: device() }); },
    cart: function (productId, sku) { push({ k: 'cart', id: productId || '', sku: sku || '', d: device() }); },
    checkout: function () { push({ k: 'checkout', d: device() }); }
  };

  window.addEventListener('pagehide', function () { clearTimeout(timer); send(true); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) { clearTimeout(timer); send(true); } });

  HW.measure = M;
})(window.HW = window.HW || {});
