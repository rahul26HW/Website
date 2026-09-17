/* Home Weavers — storefront database calls (Supabase REST, publishable key only).
   The admin uses supabase-js for sign-in and uploads; shoppers never load it. */
(function (HW) {
  'use strict';

  var cfg = window.HW_CONFIG || {};
  var CACHE_KEY = 'hw:store:v2';

  function configured() { return !!(cfg.supabaseUrl && cfg.supabasePublishableKey); }

  function headers(extra) {
    var h = { apikey: cfg.supabasePublishableKey, 'Content-Type': 'application/json' };
    Object.keys(extra || {}).forEach(function (k) { h[k] = extra[k]; });
    return h;
  }

  function friendly(code, fallback) {
    var map = {
      INVALID_EMAIL: 'Please enter a valid email address.',
      INVALID_NAME: 'Please enter your name.',
      INVALID_ADDRESS: 'Please complete your shipping address.',
      EMPTY_CART: 'Your cart is empty.',
      INVALID_QTY: 'One of the quantities in your cart isn’t valid.',
      PRODUCT_NOT_FOUND: 'An item in your cart is no longer available. Please remove it and try again.',
      VARIANT_NOT_FOUND: 'An option in your cart is no longer available. Please remove it and try again.',
      PRICE_MISSING: 'An item in your cart can’t be priced right now. Please contact us.',
      PROMO_INVALID: 'That promo code isn’t valid.',
      PROMO_NOT_STARTED: 'That promo code isn’t active yet.',
      PROMO_EXPIRED: 'That promo code has expired.',
      PROMO_MIN_ORDER: 'Your order doesn’t meet the minimum for that promo code.',
      PROMO_USED_UP: 'That promo code has reached its usage limit.',
      PROMO_ALREADY_USED: 'You’ve already used that promo code.',
      RATE_LIMIT: 'You’ve sent a few messages already. Please wait a few minutes and try again.'
    };
    if (/^OUT_OF_STOCK:/.test(code)) return '“' + code.slice(13) + '” doesn’t have enough stock for your quantity.';
    return map[code] || fallback || 'Something went wrong. Please try again.';
  }

  async function request(path, opts) {
    if (!configured()) throw { code: 'NOT_CONFIGURED', message: 'The store isn’t connected yet.' };
    var res;
    try {
      res = await fetch(cfg.supabaseUrl + path, opts);
    } catch (e) {
      throw { code: 'NETWORK', message: 'We couldn’t reach the store. Check your connection and try again.' };
    }
    var text = await res.text();
    var body = null;
    try { body = text ? JSON.parse(text) : null; } catch (e) { body = text; }
    if (!res.ok) {
      var code = (body && body.message) || ('HTTP_' + res.status);
      throw { code: code, status: res.status, message: friendly(code) };
    }
    return body;
  }

  HW.api = {
    configured: configured,
    friendly: friendly,

    cachedStore: function () {
      var c = HW.u.store.get(CACHE_KEY, null);
      return c && c.data && Array.isArray(c.data.products) ? c : null;
    },

    /* Fast path: a copy of the store published to Supabase Storage (served from a CDN) on every admin save.
       Falls back to the database if the copy is missing or slow. */
    loadStore: function () {
      // Ask the CDN copy and the database at the same time; use whichever valid answer arrives first.
      var url = cfg.supabaseUrl + '/storage/v1/object/public/media/public/store.json';
      // index.html may already have started this download; use it only if it asked the same project.
      var snapshot = (window.HW_SNAPSHOT && window.HW_SNAPSHOT_URL === url ? window.HW_SNAPSHOT
        : fetch(url).then(function (res) { return res.ok ? res.json() : Promise.reject(new Error('no snapshot')); }))
        .then(function (snap) {
          if (!(snap && snap.data && Array.isArray(snap.data.products) && snap.at)) throw new Error('bad snapshot');
          return { data: snap.data, updated_at: snap.at, fromSnapshot: true };
        });
      var db = HW.api.loadStoreFromDb();
      return new Promise(function (resolve, reject) {
        var failed = 0, done = false;
        function win(row) { if (done) return; done = true; HW.u.store.set(CACHE_KEY, { at: row.updated_at, data: row.data }); resolve(row); }
        function lose(err) { if (++failed === 2 && !done) reject(err); }
        snapshot.then(win, lose);
        db.then(function (row) { if (row && row.data) win(row); else lose(new Error('empty')); }, lose);
      });
    },

    loadStoreFromDb: async function () {
      var row = await request('/rest/v1/store?id=eq.main&select=data,updated_at', {
        headers: headers({ Accept: 'application/vnd.pgrst.object+json' })
      });
      if (row && row.data) HW.u.store.set(CACHE_KEY, { at: row.updated_at, data: row.data });
      return row;
    },

    /* Returns the latest store only if it changed since `at` (a tiny request when nothing changed). */
    checkFresh: async function (at) {
      var row = await request('/rest/v1/store?id=eq.main&select=updated_at', {
        headers: headers({ Accept: 'application/vnd.pgrst.object+json' })
      });
      if (!row || row.updated_at === at) return null;
      return HW.api.loadStoreFromDb();
    },

    rpc: function (name, args) {
      return request('/rest/v1/rpc/' + name, { method: 'POST', headers: headers(), body: JSON.stringify(args || {}) });
    },

    insert: function (table, row) {
      return request('/rest/v1/' + table, {
        method: 'POST', headers: headers({ Prefer: 'return=minimal' }), body: JSON.stringify(row)
      });
    }
  };
})(window.HW = window.HW || {});
