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
      CHECKOUT_CLOSED: 'Checkout is closed right now. Please try again later.',
      COD_UNAVAILABLE: 'Cash on delivery isn’t available right now. Please choose another way to pay.',
      COD_LIMIT: 'This order is above our cash-on-delivery limit. Please pay by card, or split it into smaller orders.',
      TOO_MANY_ORDERS: 'You’ve started several orders in the last hour. Please pay for an open order or try again later.',
      SHIPPING_COUNTRY: 'We currently ship within the United States only.',
      INVALID_PRODUCT: 'That product isn’t available.',
      ORDER_NOT_FOUND: 'We couldn’t find an order with that number and email.',
      RATE_LIMIT: 'Too many tries. Please wait a while and try again.'
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

    /* The shopper's view of the store: no promo codes (except the one advertised to newsletter sign-ups) and
       no draft products. The table itself is admin-only. */
    loadStoreFromDb: async function () {
      var row = await request('/rest/v1/rpc/public_store', { method: 'POST', headers: headers(), body: '{}' });
      if (row && row.data) HW.u.store.set(CACHE_KEY, { at: row.updated_at, data: row.data });
      return row;
    },

    /* Returns the latest store only if it changed since `at` (a tiny request when nothing changed). */
    checkFresh: async function (at) {
      var ts = await request('/rest/v1/rpc/public_store_version', { method: 'POST', headers: headers(), body: '{}' });
      if (!ts || ts === at || (Date.parse(ts) && Date.parse(ts) === Date.parse(at))) return null;
      return HW.api.loadStoreFromDb();
    },

    /* The store's own server (Edge Function "hw"): visitor forms go through it so they can be rate-limited. */
    server: async function (path, body, extraHeaders) {
      var base = HW.serverUrl ? HW.serverUrl() : String(cfg.supabaseUrl || '').replace(/\/+$/, '') + '/functions/v1/hw';
      var res;
      try {
        res = await fetch(base + path, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, extraHeaders || {}), body: JSON.stringify(body || {}) });
      } catch (e) {
        throw { code: 'NETWORK', message: 'We couldn’t reach the store. Check your connection and try again.' };
      }
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) {
        var code = data.code || (/^[A-Z_]{4,40}$/.test(data.error || '') ? data.error : '');
        throw { code: code, status: res.status, data: data, message: code ? friendly(code, data.error) : (data.error || friendly('')) };
      }
      return data;
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
