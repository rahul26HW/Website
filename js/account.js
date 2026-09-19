/* Home Weavers — customer account panel.
   Sign in or sign up with a 6-digit code sent by email (one step, no passwords anywhere). Signed in, the panel has
   Overview, Orders, Wishlist, Addresses, Payment methods, Notifications, Returns and Settings.
   Guest checkout is unchanged: orders belong to the email they were placed with. */
(function (HW) {
  'use strict';

  var u = HW.u, esc = u.esc;
  var KEY = 'hw:account';          // { token, email, expires, name, checkout } — this device only; "Sign out" removes it
  var PENDING = 'hw:accountEmail'; // email waiting for its code (this tab only)
  var SEEN = 'hw:accountSeen';     // { email: time } — notifications read up to
  var GKEY = 'hw:googleSignIn';    // { state, nonce } for one "Continue with Google" round trip (this tab only)
  var NEXT = 'hw:accountNext';     // where to go after signing in (this tab only)
  var GOOGLE_G = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A11.9 11.9 0 0 1 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
  var linkStyle = ' style="font-size:inherit;letter-spacing:0;text-transform:none"';
  var state = { data: null, email: null, loading: null, editing: null };

  function googleId() {
    var id = String(((HW.DB && HW.DB.settings) || {}).googleClientId || '').trim();
    return /^[\w.-]+\.apps\.googleusercontent\.com$/.test(id) ? id : '';
  }
  function randomToken() {
    var b = new Uint8Array(24); crypto.getRandomValues(b);
    return btoa(String.fromCharCode.apply(null, b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function takeNext() { var n = u.session.get(NEXT, null); u.session.set(NEXT, null); return /^\/(account(\/[a-z]+)?|checkout)$/.test(n || '') ? n : '/account'; }

  function authShell(inner) {
    var bd = HW.DB.brand || {}, name = bd.name || 'Home Weavers';
    return '<div class="auth">' +
      '<div class="auth-brand"><a class="auth-logo" href="' + HW.link('/') + '"><svg width="26" height="26" viewBox="0 0 22 22" fill="none" aria-hidden="true"><rect x="1" y="1" width="20" height="20" rx="2" stroke="currentColor" stroke-width="1.4"/><path d="M1 6h20M1 11h20M1 16h20M6 1v20M11 1v20M16 1v20" stroke="currentColor" stroke-width="1" opacity=".55"/></svg><span>' + esc(name) + '</span></a>' +
      '<div class="auth-pitch"><p class="auth-eyebrow">' + esc(bd.tagline || 'Woven for the way you live') + '</p><p class="auth-title">Welcome home</p>' +
      '<p class="auth-text">Track your orders, save your addresses and check out faster — all in one place.</p></div>' +
      '<p class="auth-foot">© ' + new Date().getFullYear() + ' ' + esc(name) + '</p></div>' +
      '<div class="auth-panel"><div class="auth-box">' + inner + '<p class="auth-back"><a href="' + HW.link('/') + '">← Back to store</a></p></div></div></div>';
  }
  function authMsg(text, ok) {
    var m = document.getElementById('authMsg');
    if (!m) { u.toast(text); return; }
    m.hidden = !text; m.className = 'form-msg ' + (ok ? 'ok' : 'err'); m.textContent = text || '';
  }

  function prod(id) { return (HW.DB.products || []).find(function (p) { return p.id === id && !p.hidden; }); }

  function get() {
    var a = u.store.get(KEY, null);
    if (!a || !a.token || !(Date.parse(a.expires) > Date.now())) return null;
    return a;
  }

  async function post(path, body, token) {
    var res, data = {};
    try {
      var headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = 'Bearer ' + token;
      res = await fetch(HW.serverUrl() + path, { method: 'POST', headers: headers, body: JSON.stringify(body || {}) });
      data = await res.json().catch(function () { return {}; });
    } catch (e) { throw new Error('We couldn’t reach the store. Check your connection and try again.'); }
    if (!res.ok) { var err = new Error(data.error || 'Something went wrong. Please try again.'); err.status = res.status; err.data = data; throw err; }
    return data;
  }
  /* Signed-in call; a refused session signs this device out. */
  async function call(path, body) {
    var a = get();
    if (!a) { expired(); throw new Error('Please sign in again.'); }
    try { return await post(path, body, a.token); }
    catch (e) { if (e.status === 401) expired(); throw e; }
  }
  function expired() {
    u.store.del(KEY); state.data = null; paintHeader();
    u.toast('Please sign in again');
    if (HW.router.current && HW.router.current.name === 'account') HW.router.navigate('/account');
  }

  function say(form, text, ok) {
    var msg = form.querySelector('.form-msg');
    if (!msg) return;
    msg.hidden = !text; msg.className = 'form-msg ' + (ok ? 'ok' : 'err'); msg.textContent = text || '';
  }
  function busy(btn, text) {
    if (!btn) return function () {};
    var label = btn.textContent;
    btn.disabled = true; btn.textContent = text; btn.setAttribute('aria-busy', 'true');
    return function () { btn.disabled = false; btn.textContent = label; btn.removeAttribute('aria-busy'); };
  }

  /* ---------- data ---------- */
  function defaultAddress(d) {
    var list = (d && d.profile && d.profile.addresses) || [];
    return list.find(function (x) { return x.is_default; }) || list[0] || null;
  }
  /* The customer's name: from Settings, else a saved address (default first), the last order, or what checkout remembered. */
  function fullName(d) {
    var p = (d && d.profile) || {};
    var saved = (defaultAddress(d) || {}).name || (p.addresses || []).map(function (x) { return x && x.name; }).filter(Boolean)[0];
    var a = get() || {};
    return [p.first_name, p.last_name].filter(Boolean).join(' ') || saved || (d && d.lastAddress && d.lastAddress.name) ||
      (a.checkout && a.checkout.name) || a.name || '';
  }
  /* Keeps what checkout needs on this device (the default address, or the last order's). */
  function remember(d) {
    var a = get(); if (!a) return;
    var def = defaultAddress(d), last = d.lastAddress;
    a.name = fullName(d);
    a.checkout = def ? { name: def.name, phone: def.phone || (d.profile || {}).phone || '', address: def }
      : last ? { name: last.name, phone: last.phone || '', address: last.address || {} } : null;
    u.store.set(KEY, a);
  }
  async function load(force) {
    var a = get();
    if (!a) return null;
    if (state.data && state.email === a.email && !force) return state.data;
    if (!state.loading || force) {
      state.loading = call('/account/orders', {}).then(function (d) {
        state.data = d; state.email = a.email; remember(d); paintHeader(); return d;
      }).finally(function () { state.loading = null; });
    }
    return state.loading;
  }

  /* ---------- small pieces ---------- */
  var ICON = {
    overview: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    orders: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
    wishlist: '<path d="M12 20.5s-7.5-4.6-9.3-9.2C1.6 8.4 3.4 5 6.8 5c2 0 3.4 1.1 4.2 2.4C11.8 6.1 13.2 5 15.2 5c3.4 0 5.2 3.4 4.1 6.3C19.5 15.9 12 20.5 12 20.5z"/>',
    addresses: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    payments: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19M6 15h4"/>',
    notifications: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    returns: '<path d="M4 11a8 8 0 1 1 2.3 5.7"/><path d="M4 5v6h6"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    signout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"/>',
    arrow: '<path d="M7 17 17 7M9 7h8v8"/>',
    truck: '<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
    check: '<path d="m5 12 4.5 4.5L19 7"/>'
  };
  function icon(name, size) {
    return '<svg class="aic" width="' + (size || 18) + '" height="' + (size || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[name] + '</svg>';
  }
  var NAV = [['', 'Overview', 'overview'], ['orders', 'Orders', 'orders'], ['wishlist', 'Wishlist', 'wishlist'], ['addresses', 'Addresses', 'addresses'],
    ['payments', 'Payment methods', 'payments'], ['notifications', 'Notifications', 'notifications'], ['returns', 'Returns', 'returns'], ['settings', 'Settings', 'settings']];
  var STATUS = { new: 'Received', accepted: 'Being prepared', packed: 'Being prepared', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled', refunded: 'Refunded' };
  function badge(o) {
    var s = o.return_requested_at && !/^(refunded|cancelled)$/.test(o.status) ? 'return' : o.status;
    var label = s === 'return' ? 'Return requested' : (STATUS[s] || s);
    return '<span class="abadge s-' + esc(s) + '">' + esc(label) + '</span>';
  }
  function itemCount(o) { return (o.items || []).reduce(function (n, i) { return n + (Number(i.qty) || 0); }, 0); }
  function thumbs(o, max) {
    return '<span class="athumbs">' + (o.items || []).slice(0, max || 2).map(function (i) {
      return i.image ? '<img src="' + esc(HW.asset(HW.m.thumb(i.image))) + '" alt="" width="56" height="56" loading="lazy">' : '<span class="athumb-empty"></span>';
    }).join('') + '</span>';
  }
  function initials(name, email) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    var s = parts.length ? (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')) : String(email || '?').slice(0, 2);
    return s.toUpperCase();
  }
  function first(d) { var n = fullName(d); return n ? n.split(' ')[0] : ''; }
  function addrLines(a) {
    return [a.line1, a.line2, [a.city, a.state].filter(Boolean).join(', ') + (a.zip ? ' ' + a.zip : '')].filter(function (x) { return x && x.trim(); }).map(esc).join('<br>');
  }
  function returnable(o) {
    var shipped = Date.parse(o.shipped_at || o.accepted_at || o.created_at);
    return /^(shipped|delivered)$/.test(o.status) && o.payment_status === 'paid' && !o.return_requested_at && shipped > Date.now() - 45 * 86400000;
  }
  function empty(ic, title, text, cta) {
    return '<div class="aempty">' + icon(ic, 28) + '<h2>' + esc(title) + '</h2><p>' + text + '</p>' + (cta || '') + '</div>';
  }
  function head(eyebrow, title, sub, action) {
    return '<div class="ahead"><div>' + (eyebrow ? '<p class="aeyebrow">' + esc(eyebrow) + '</p>' : '') + '<h1>' + esc(title) + '</h1>' + (sub ? '<p class="asub">' + sub + '</p>' : '') + '</div>' + (action || '') + '</div>';
  }

  /* ---------- notifications (built from order updates) ---------- */
  function events(d) {
    var out = [];
    (d.orders || []).forEach(function (o) {
      var n = o.order_number, add = function (t, title, text) { if (t) out.push({ t: Date.parse(t), title: title, text: text, n: n }); };
      add(o.paid_at || o.created_at, 'Order ' + n + ' placed', 'We’ve received your order of ' + u.money(o.total) + '.');
      add(o.accepted_at, 'Order ' + n + ' is being prepared', 'Your order is confirmed and we’re getting it ready.');
      add(o.shipped_at, 'Order ' + n + ' has shipped', o.tracking_number ? 'Tracking: ' + (o.carrier ? o.carrier + ' ' : '') + o.tracking_number : 'It’s on its way.');
      add(o.cancelled_at, 'Order ' + n + ' cancelled', o.payment_status === 'voided' ? 'You weren’t charged.' : 'Your payment is refunded in full.');
      add(o.return_requested_at, 'Return requested for ' + n, 'We’ll email you with how to send it back.');
    });
    return out.filter(function (e) { return e.t; }).sort(function (a, b) { return b.t - a.t; });
  }
  function seen(email) { return Number((u.store.get(SEEN, {}) || {})[email] || 0); }
  function unread(d, email) { var s = seen(email); return events(d).filter(function (e) { return e.t > s; }).length; }

  /* ---------- sections ---------- */
  function orderRow(o) {
    return '<a class="arow" href="' + HW.link('/account/orders/' + encodeURIComponent(o.order_number)) + '">' + thumbs(o, 2) +
      '<span class="arow-main"><span class="arow-top"><b>' + esc(o.order_number) + '</b> ' + badge(o) + '</span>' +
      '<span class="arow-sub">' + itemCount(o) + ' item' + (itemCount(o) === 1 ? '' : 's') + ' · ' + u.money(o.total) + ' · ' + esc(u.fmtDate(o.created_at)) + '</span></span>' +
      '<span class="arow-go">' + icon('arrow', 16) + '</span></a>';
  }

  function orderCard(o, i, email) {
    var link = HW.trackingUrl(o.carrier, o.tracking_number), a = o.shipping_address || {};
    var pay = o.payment_status === 'cod' ? 'Cash on delivery — pay ' + u.money(o.total) + ' when it arrives'
      : o.payment_method === 'cod' && o.payment_status === 'paid' ? 'Paid in cash on delivery'
      : o.payment_status === 'authorized' ? 'Card approved — charged when we start preparing your order'
      : o.payment_status === 'voided' ? 'Card hold released — you weren’t charged'
      : o.payment_status === 'refunded' ? 'Refunded to your card'
      : o.payment_status === 'failed' ? 'Charging your card didn’t work — please contact us' : 'Paid by card';
    var line = function (label, value, cls) { return '<div class="sumrow' + (cls ? ' ' + cls : '') + '"><span>' + label + '</span><span>' + value + '</span></div>'; };
    return '<article class="aorder" id="o-' + esc(o.order_number) + '" aria-labelledby="aoh' + i + '">' +
      '<header class="aorder-head"><div><h2 id="aoh' + i + '">' + esc(o.order_number) + '</h2><span class="muted">Placed ' + esc(u.fmtDate(o.created_at)) + '</span></div>' + badge(o) + '<b class="aorder-total">' + u.money(o.total) + '</b></header>' +
      '<div class="aorder-body"><div class="aorder-main">' +
      (o.items || []).map(function (it) {
        return '<div class="aitem">' + (it.image ? '<img src="' + esc(HW.asset(HW.m.thumb(it.image))) + '" alt="" width="64" height="64" loading="lazy">' : '<span class="athumb-empty"></span>') +
          '<div class="aitem-txt"><div class="aitem-name">' + esc(it.name) + '</div>' + (it.variant ? '<div class="muted">' + esc(it.variant) + '</div>' : '') +
          '<div class="muted">' + u.money(it.unit_price != null ? it.unit_price : (it.line_total / (it.qty || 1))) + ' × ' + Number(it.qty) + '</div></div><div class="aitem-price">' + u.money(it.line_total) + '</div></div>';
      }).join('') +
      HW.orderSteps(o) +
      (o.tracking_number ? '<p class="atrack">' + icon('truck', 16) + ' <span><b>Tracking:</b> ' + esc(o.carrier ? o.carrier + ' ' : '') +
        (link ? '<a class="link-u"' + linkStyle + ' href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">' + esc(o.tracking_number) + '</a>' : esc(o.tracking_number)) + '</span></p>' : '') +
      (a.line1 ? '<div class="aaddr">' + icon('addresses', 16) + '<div><b>' + esc(o.name || '') + '</b><br>' + addrLines(a) + '</div></div>' : '') +
      HW.cancelBlock(o, o.order_number, email, String(i)) +
      (o.return_requested_at ? '<p class="form-msg ok" style="margin:14px 0 0">Return requested ' + esc(u.fmtDate(o.return_requested_at)) + '. We’ll email you with how to send it back.</p>' : '') +
      '</div><aside class="aorder-side"><h3>Payment summary</h3>' +
      line('Subtotal', u.money(o.subtotal)) +
      (Number(o.discount) ? line('Discount' + (o.promo_code ? ' (' + esc(o.promo_code) + ')' : ''), '−' + u.money(o.discount), 'disc') : '') +
      line('Shipping', Number(o.shipping) ? u.money(o.shipping) : 'Free') +
      (Number(o.cod_fee) ? line('Cash on delivery fee', u.money(o.cod_fee)) : '') +
      (Number(o.tax) ? line('Tax', u.money(o.tax)) : '') +
      line('Total', u.money(o.total), 'total') +
      '<p class="apay">' + icon('payments', 16) + ' ' + esc(pay) + '</p>' +
      '<div class="btnrow">' +
      (link ? '<a class="btn ghost sm" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">' + icon('truck', 15) + ' Track</a>' : '') +
      (returnable(o) ? '<a class="btn ghost sm" href="' + HW.link('/account/returns') + '?order=' + encodeURIComponent(o.order_number) + '">' + icon('returns', 15) + ' Return</a>' : '') +
      '</div></aside></div></article>';
  }

  var SECTIONS = {
    '': function (d, a) {
      var w = HW.wishlist ? HW.wishlist.ids().filter(prod).length : 0;
      var stat = function (key, label, n, ic) { return '<a class="astat" href="' + HW.link('/account/' + key) + '"><span><span class="alabel">' + label + '</span><b>' + n + '</b></span>' + icon(ic, 22) + '</a>'; };
      return head('Overview', first(d) ? 'Hi, ' + first(d) : 'Welcome back', 'Here’s what’s happening with your account.') +
        '<div class="astats">' + stat('orders', 'Orders', d.orders.length, 'orders') + stat('wishlist', 'Wishlist', w, 'wishlist') + stat('addresses', 'Addresses', d.profile.addresses.length, 'addresses') + '</div>' +
        '<div class="asec-head"><h2>Recent orders</h2>' + (d.orders.length ? '<a href="' + HW.link('/account/orders') + '">View all</a>' : '') + '</div>' +
        (d.orders.length ? '<div class="arows">' + d.orders.slice(0, 3).map(orderRow).join('') + '</div>'
          : empty('orders', 'No orders yet', 'When you check out with <b>' + esc(a.email) + '</b>, your orders show up here.', '<a class="btn" href="' + HW.link('/') + '">Start shopping</a>'));
    },

    orders: function (d, a, params) {
      var list = d.orders;
      if (params.id) {
        var o = list.find(function (x) { return x.order_number === String(params.id).toUpperCase(); });
        return '<p class="aback"><a href="' + HW.link('/account/orders') + '">← All orders</a></p>' +
          (o ? orderCard(o, 0, a.email) : empty('orders', 'Order not found', 'This order isn’t on your account. Check that you’re signed in with the email you used at checkout.'));
      }
      return head('', 'Orders', 'Track and manage your purchases.') +
        (list.length ? list.map(function (o, i) { return orderCard(o, i, a.email); }).join('')
          : empty('orders', 'No orders yet', 'Orders you place with <b>' + esc(a.email) + '</b> show up here — including ones placed as a guest.', '<a class="btn" href="' + HW.link('/') + '">Start shopping</a>'));
    },

    wishlist: function () {
      var items = HW.wishlist ? HW.wishlist.ids().map(prod).filter(Boolean) : [];
      return head('', 'Wishlist', 'Pieces you’ve saved for later, on this device.') +
        (items.length ? '<div class="p-grid awish">' + items.map(function (p) { return HW.productCard(p, { heading: 'h2' }); }).join('') + '</div>'
          : empty('wishlist', 'Your wishlist is empty', 'Tap the heart on any product to save it here.', '<a class="btn" href="' + HW.link('/') + '">Browse the collection</a>'));
    },

    addresses: function (d) {
      var list = d.profile.addresses, ed = state.editing;
      var add = '<button class="btn sm" type="button" data-act="acct-addr-new">+ Add address</button>';
      var form = ed ? addressForm(ed === 'new' ? {} : list.find(function (x) { return x.id === ed; }) || {}) : '';
      var cards = list.map(function (x) {
        return '<div class="acard">' + (x.is_default ? '<span class="abadge s-delivered">Default</span>' : '') + (x.label ? '<div class="alabel">' + esc(x.label) + '</div>' : '') +
          '<p><b>' + esc(x.name) + '</b><br>' + addrLines(x) + (x.phone ? '<br>' + esc(x.phone) : '') + '</p>' +
          '<div class="btnrow"><button class="linkbtn" type="button" data-act="acct-addr-edit" data-id="' + esc(x.id) + '">Edit</button>' +
          (x.is_default ? '' : '<button class="linkbtn" type="button" data-act="acct-addr-default" data-id="' + esc(x.id) + '">Set as default</button>') +
          '<button class="linkbtn" type="button" data-act="acct-addr-del" data-id="' + esc(x.id) + '">Remove</button></div></div>';
      }).join('');
      var last = d.lastAddress && d.lastAddress.address && d.lastAddress.address.line1 && !list.length && !ed
        ? '<div class="notice" role="note" style="text-align:left">Save the address from your last order? <b>' + esc(d.lastAddress.name) + '</b>, ' + esc(d.lastAddress.address.line1) + ', ' + esc(d.lastAddress.address.city || '') +
          ' <button class="linkbtn" type="button" data-act="acct-addr-import">Save it</button></div>' : '';
      return head('', 'Addresses', 'Manage your saved delivery addresses. Your default fills in at checkout.', list.length && !ed ? add : '') + form + last +
        (list.length ? '<div class="acards">' + cards + '</div>' : ed ? '' : empty('addresses', 'No saved addresses', 'Add one to check out faster next time.', add));
    },

    payments: function () {
      return head('', 'Payment methods', 'How you pay at ' + esc((HW.DB.brand || {}).name || 'Home Weavers') + '.') +
        '<div class="apanel"><div class="apanel-row">' + icon('lock', 22) + '<div><h2>We never store your card</h2>' +
        '<p>You pay on Stripe’s secure checkout page. Your card number goes straight to Stripe and never reaches us, so there’s nothing saved here that could leak.</p></div></div>' +
        '<h3>Ways to pay</h3><div class="achips"><span>Visa</span><span>Mastercard</span><span>American Express</span><span>Discover</span><span>Apple Pay</span><span>Google Pay</span></div>' +
        '<p class="muted" style="margin:14px 0 0;font-size:13.5px">At checkout your card is only approved. It’s charged when we start preparing your order, so cancelling within ' + HW.cancelMinutes() + ' minutes costs nothing.</p></div>';
    },

    notifications: function (d, a) {
      var ev = events(d), s = seen(a.email);
      return head('', 'Notifications', 'Choose what you hear about — and catch up on the latest.', ev.some(function (e) { return e.t > s; }) ? '<button class="linkbtn" type="button" data-act="acct-read">Mark all read</button>' : '') +
        '<div class="apanel aprefs">' +
        '<label class="apref"><span><b>Order updates</b><span class="muted">Payment, shipping, delivery and returns by email. Always on — we need them to get your order to you.</span></span><input type="checkbox" role="switch" checked disabled></label>' +
        '<label class="apref"><span><b>New arrivals &amp; offers</b><span class="muted">An occasional email about new products, restocks and offers.</span></span><input type="checkbox" role="switch" data-act="acct-sub"' + (d.subscribed ? ' checked' : '') + '></label></div>' +
        '<div class="asec-head"><h2>Recent</h2></div>' +
        (ev.length ? '<ul class="aevents">' + ev.slice(0, 30).map(function (e) {
          return '<li class="' + (e.t > s ? 'new' : '') + '"><a href="' + HW.link('/account/orders/' + encodeURIComponent(e.n)) + '"><b>' + esc(e.title) + (e.t > s ? ' <span class="adot" aria-label="new"></span>' : '') + '</b>' +
            '<span class="muted">' + esc(e.text) + '</span><span class="aevent-when">' + esc(u.fmtDate(new Date(e.t).toISOString())) + '</span></a></li>';
        }).join('') + '</ul>' : empty('notifications', 'Nothing yet', 'Updates about your orders show up here.'));
    },

    returns: function (d, a, params) {
      var asked = d.orders.filter(function (o) { return o.return_requested_at; });
      var can = d.orders.filter(returnable);
      var pick = String(params.order || '').toUpperCase();
      var chosen = can.find(function (o) { return o.order_number === pick; }) || can[0];
      var REASONS = ['Doesn’t fit or wrong size', 'Not as described or pictured', 'Arrived damaged or defective', 'Wrong item sent', 'Changed my mind', 'Other'];
      var form = chosen ? '<form class="form apanel" data-form="acct-return" novalidate aria-labelledby="retHead"><h2 id="retHead">Start a return</h2>' +
        '<div class="fld"><label for="ret_order">Order</label><select id="ret_order" name="order" data-act="acct-ret-order">' + can.map(function (o) {
          return '<option value="' + esc(o.order_number) + '"' + (o === chosen ? ' selected' : '') + '>' + esc(o.order_number) + ' · ' + esc(u.fmtDate(o.created_at)) + ' · ' + u.money(o.total) + '</option>';
        }).join('') + '</select></div>' +
        '<fieldset class="fld"><legend>Items to return</legend>' + (chosen.items || []).map(function (it, i) {
          return '<label class="acheck"><input type="checkbox" name="item" value="' + i + '"' + ((chosen.items || []).length === 1 ? ' checked' : '') + '> ' + esc(it.name) + (it.variant ? ' (' + esc(it.variant) + ')' : '') + ' × ' + Number(it.qty) + '</label>';
        }).join('') + '</fieldset>' +
        '<div class="fld"><label for="ret_reason">Reason</label><select id="ret_reason" name="reason" required><option value="">Choose…</option>' + REASONS.map(function (r) { return '<option>' + esc(r) + '</option>'; }).join('') + '</select></div>' +
        '<div class="fld"><label for="ret_details">Anything else? <span class="opt">(optional)</span></label><textarea id="ret_details" name="details" maxlength="500" style="min-height:80px"></textarea></div>' +
        '<p class="form-msg" role="status" hidden></p><button class="btn loom" type="submit">Request return</button>' +
        '<p class="muted" style="font-size:13px;margin:12px 0 0">Items must be unused and unwashed, with their tags. See our <a class="link-u"' + linkStyle + ' href="' + HW.link('/page/refund-policy') + '">Refund Policy</a>.</p></form>' : '';
      return head('', 'Returns', 'Return unused, unwashed items within 30 days of delivery.') +
        (asked.length ? '<div class="asec-head"><h2>Your return requests</h2></div><div class="arows">' + asked.map(function (o) {
          return '<a class="arow" href="' + HW.link('/account/orders/' + encodeURIComponent(o.order_number)) + '">' + thumbs(o, 2) + '<span class="arow-main"><span class="arow-top"><b>' + esc(o.order_number) + '</b> ' +
            (o.status === 'refunded' ? '<span class="abadge s-delivered">Refunded</span>' : '<span class="abadge s-return">Requested</span>') + '</span>' +
            '<span class="arow-sub">Asked ' + esc(u.fmtDate(o.return_requested_at)) + (o.status === 'refunded' ? ' · refunded to your card' : ' · we’ll email you with how to send it back') + '</span></span><span class="arow-go">' + icon('arrow', 16) + '</span></a>';
        }).join('') + '</div>' : '') +
        (form || (asked.length ? '' : empty('returns', 'Nothing to return', 'You’ll be able to start a return once an order has shipped.', '<a class="btn" href="' + HW.link('/') + '">Shop new arrivals</a>')));
    },

    settings: function (d, a) {
      var p = d.profile;
      var f = function (id, label, val, extra) { return '<div class="fld"><label for="st_' + id + '">' + label + '</label><input id="st_' + id + '" name="' + id + '" value="' + esc(val || '') + '"' + (extra || '') + '></div>'; };
      return head('', 'Settings', 'Manage your profile and preferences.') +
        '<form class="form apanel" data-form="acct-profile" novalidate aria-labelledby="stHead"><h2 id="stHead">Profile</h2>' +
        '<div class="row2">' + f('first_name', 'First name', p.first_name, ' autocomplete="given-name" maxlength="60"') + f('last_name', 'Last name', p.last_name, ' autocomplete="family-name" maxlength="60"') + '</div>' +
        '<div class="row2">' + f('email', 'Email', a.email, ' type="email" readonly aria-describedby="stEmailNote"') + f('phone', 'Phone <span class="opt">(optional)</span>', p.phone, ' type="tel" autocomplete="tel" maxlength="40"') + '</div>' +
        '<p class="muted" id="stEmailNote" style="font-size:13px;margin:-4px 0 12px">Your email is how you sign in and how we find your orders. To change it, contact us.</p>' +
        '<p class="form-msg" role="status" hidden></p><button class="btn loom" type="submit">Save changes</button></form>' +
        '<div class="apanel"><h2>Signing in</h2><p>There’s no password to remember or leak: each time you sign in we email you a one-time code.</p>' +
        '<button class="btn ghost sm" type="button" data-act="acct-signout-all">Sign out on all devices</button></div>' +
        '<div class="apanel adanger"><h2>Delete account</h2><p>Removes your name, phone, saved addresses and email sign-up, and signs you out everywhere. Your orders are kept for our records (taxes, returns and warranty), as our <a class="link-u"' + linkStyle + ' href="' + HW.link('/page/privacy-policy') + '">Privacy Policy</a> explains. You can still check out as a guest any time.</p>' +
        '<button class="btn ghost sm" type="button" data-act="acct-delete">Delete my account</button></div>';
    }
  };

  function addressForm(x) {
    var STATES = HW.checkout && HW.checkout.states ? HW.checkout.states() : [];
    var f = function (id, label, val, extra, opt) { return '<div class="fld"><label for="ad_' + id + '">' + label + (opt ? ' <span class="opt">(optional)</span>' : '') + '</label><input id="ad_' + id + '" name="' + id + '" value="' + esc(val || '') + '"' + (extra || '') + '></div>'; };
    return '<form class="form apanel" data-form="acct-address" data-id="' + esc(x.id || '') + '" novalidate aria-labelledby="adHead"><h2 id="adHead">' + (x.id ? 'Edit address' : 'Add an address') + '</h2>' +
      '<div class="row2">' + f('name', 'Full name', x.name, ' autocomplete="name" maxlength="120" required') + f('phone', 'Phone', x.phone, ' type="tel" autocomplete="tel" maxlength="40"', true) + '</div>' +
      f('line1', 'Address', x.line1, ' autocomplete="address-line1" maxlength="200" required') +
      f('line2', 'Apartment, suite, etc.', x.line2, ' autocomplete="address-line2" maxlength="200"', true) +
      '<div class="row3">' + f('city', 'City', x.city, ' autocomplete="address-level2" maxlength="100" required') +
      '<div class="fld"><label for="ad_state">State</label><select id="ad_state" name="state" autocomplete="address-level1" required><option value="">Select…</option>' +
      STATES.map(function (s) { return '<option value="' + s[0] + '"' + (x.state === s[0] ? ' selected' : '') + '>' + esc(s[1]) + '</option>'; }).join('') + '</select></div>' +
      f('zip', 'ZIP code', x.zip, ' inputmode="numeric" autocomplete="postal-code" maxlength="10" required') + '</div>' +
      f('label', 'Label', x.label, ' maxlength="40" placeholder="Home, Work…"', true) +
      '<label class="acheck"><input type="checkbox" name="is_default"' + (x.is_default || !x.id ? ' checked' : '') + '> Use as my default address</label>' +
      '<p class="muted" style="font-size:13px;margin:6px 0 12px">We currently ship within the United States.</p>' +
      '<p class="form-msg" role="status" hidden></p><div class="btnrow"><button class="btn loom" type="submit">Save address</button><button class="linkbtn" type="button" data-act="acct-addr-cancel">Cancel</button></div></form>';
  }

  function shell(a, d, section, inner) {
    var name = fullName(d), n = d ? unread(d, a.email) : 0;
    return '<div class="wrap"><div class="apanel-layout">' +
      '<aside class="aside"><div class="aprofile"><span class="aavatar" aria-hidden="true">' + esc(initials(name, a.email)) + '</span><span><b>' + esc(name || 'Your account') + '</b><span class="muted">' + esc(a.email) + '</span></span></div>' +
      '<nav class="anav" aria-label="Your account">' + NAV.map(function (x) {
        var on = x[0] === section;
        return '<a href="' + HW.link('/account' + (x[0] ? '/' + x[0] : '')) + '"' + (on ? ' aria-current="page" class="on"' : '') + '>' + icon(x[2]) + '<span>' + x[1] + '</span>' +
          (x[0] === 'notifications' && n ? '<span class="acount" aria-label="' + n + ' new">' + n + '</span>' : '') + '</a>';
      }).join('') + '</nav>' +
      '<button class="anav-out" type="button" data-act="acct-signout">' + icon('signout') + '<span>Sign out</span></button></aside>' +
      '<section class="amain" id="acctMain" aria-live="polite">' + inner + '</section></div></div>';
  }

  function renderMain() {
    var main = document.getElementById('acctMain');
    if (!main) return;
    HW.router.run({ scroll: false });
  }

  /* The header icon shows the customer's initials once signed in. */
  function paintHeader() {
    var el = document.getElementById('acctLink'); if (!el) return;
    var a = get();
    var ini = el.querySelector('.acct-ini');
    if (a) {
      if (!ini) { ini = document.createElement('span'); ini.className = 'acct-ini'; ini.setAttribute('aria-hidden', 'true'); el.appendChild(ini); }
      ini.textContent = initials(a.name, a.email);
      el.classList.add('signed');
      el.setAttribute('aria-label', 'Your account (signed in)');
    } else {
      if (ini) ini.remove();
      el.classList.remove('signed');
      el.setAttribute('aria-label', 'Your account');
    }
  }

  async function saveProfile(patch, btn, form, okText) {
    var done = busy(btn, 'Saving…');
    try {
      var r = await call('/account/profile', patch);
      state.data.profile = r.profile;
      if (typeof r.subscribed === 'boolean') state.data.subscribed = r.subscribed;
      remember(state.data);
      return r;
    } catch (e) { if (form) say(form, e.message); else u.toast(e.message); throw e; }
    finally { done(); }
  }

  HW.account = {
    get: get,
    /* Forget the loaded data (after a cancel or request elsewhere), so the next view reloads it. */
    invalidate: function () { state.data = null; },
    paintHeader: paintHeader,

    /* Checkout: fill an empty form with the default address (or the last order's). */
    prefillCheckout: function (draftKey) {
      var a = get();
      var d = u.session.get(draftKey, null);
      if (!a || (d && Object.keys(d).length)) return;
      var c = a.checkout || {}, ad = c.address || {};
      u.session.set(draftKey, { email: a.email, name: c.name || a.name || '', phone: c.phone || '', line1: ad.line1 || '', line2: ad.line2 || '', city: ad.city || '', state: ad.state || '', zip: ad.zip || '' });
    },

    sendCode: async function (form, emailArg) {
      var email = emailArg || form.elements.email.value.trim();
      if (!u.isEmail(email)) { say(form, 'Enter a valid email address.'); form.elements.email && form.elements.email.focus(); return; }
      var done = busy(form.querySelector('button[type=submit]'), 'Sending your code…'); say(form, '');
      try {
        await post('/account/code', { email: email });
        u.session.set(PENDING, email.toLowerCase());
        HW.router.run({ scroll: false });
      } catch (e) { say(form, e.message); done(); }
    },

    resend: async function (btn) {
      var email = u.session.get(PENDING, null), form = btn.closest('form');
      if (!email) return HW.account.restart();
      btn.disabled = true; say(form, 'Sending a new code…', true);
      try { await post('/account/code', { email: email }); say(form, 'We’ve sent a new code. Use the newest one.', true); }
      catch (e) { say(form, e.message); }
      finally { setTimeout(function () { btn.disabled = false; }, 20000); }
    },

    restart: function () { u.session.set(PENDING, null); HW.router.run({ scroll: false }); },

    verify: async function (form) {
      var email = u.session.get(PENDING, null);
      var code = form.elements.code.value.replace(/\D/g, '');
      if (!email) return HW.account.restart();
      if (code.length !== 6) { say(form, 'Enter the 6-digit code from the email.'); form.elements.code.focus(); return; }
      var done = busy(form.querySelector('button[type=submit]'), 'Signing in…'); say(form, '');
      try {
        var r = await post('/account/verify', { email: email, code: code });
        u.store.set(KEY, { token: r.token, email: r.email, expires: r.expires });
        u.session.set(PENDING, null);
        state.data = null;
        u.toast('You’re signed in');
        await load(true).catch(function () {});
        HW.router.navigate(takeNext());
      } catch (e) {
        say(form, e.message + (e.data && e.data.triesLeft != null ? ' (' + e.data.triesLeft + ' tries left)' : ''));
        done(); form.elements.code.select();
      }
    },

    /* "Continue with Google": off to Google's own page; it comes back to /account/login with a signed ID token. */
    google: function () {
      var cid = googleId();
      if (!cid) return;
      var st = { state: randomToken(), nonce: randomToken() };
      u.session.set(GKEY, st);
      var q = new URLSearchParams({ client_id: cid, redirect_uri: location.origin + HW.link('/account/login'), response_type: 'id_token',
        scope: 'openid email profile', nonce: st.nonce, state: st.state, prompt: 'select_account' });
      location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + q.toString());
    },

    finishGoogle: async function (q) {
      var st = u.session.get(GKEY, null);
      u.session.set(GKEY, null);
      if (q.get('error')) { authMsg(q.get('error') === 'access_denied' ? 'Google sign-in was cancelled.' : 'Google sign-in didn’t work. Please try again or use your email.'); return; }
      if (!st || !st.state || q.get('state') !== st.state || !q.get('id_token')) { authMsg('That Google sign-in expired. Please try again.'); return; }
      authMsg('Signing you in…', true);
      try {
        var r = await post('/account/google', { id_token: q.get('id_token'), nonce: st.nonce });
        u.store.set(KEY, { token: r.token, email: r.email, expires: r.expires });
        state.data = null;
        await load(true).catch(function () {});
        u.toast('You’re signed in');
        HW.router.navigate(takeNext(), { replace: true });
      } catch (e) { authMsg(e.message); }
    },

    signOut: function (quiet) {
      var a = get();
      if (a) post('/account/signout', {}, a.token).catch(function () {});
      u.store.del(KEY);
      u.session.set(PENDING, null);
      u.session.set('hw:checkoutDraft', {});
      state.data = null; state.editing = null;
      paintHeader();
      if (!quiet) u.toast('You’re signed out');
      HW.router.navigate('/account');
    },

    signOutAll: async function (btn) {
      if (!confirm('Sign out on every device, including this one?')) return;
      var done = busy(btn, 'Signing out…');
      try { await call('/account/signout-all', {}); u.toast('Signed out on all devices'); HW.account.signOut(true); }
      catch (e) { u.toast(e.message); } finally { done(); }
    },

    remove: async function (btn) {
      if (!confirm('Delete your account? Your name, phone, saved addresses and email sign-up are removed. Your orders are kept for our records.')) return;
      var done = busy(btn, 'Deleting…');
      try { await call('/account/delete', {}); u.toast('Your account is deleted'); HW.account.signOut(true); }
      catch (e) { u.toast(e.message); done(); }
    },

    saveSettings: async function (form) {
      var v = function (n) { return form.elements[n].value.trim(); };
      say(form, '');
      try { await saveProfile({ first_name: v('first_name'), last_name: v('last_name'), phone: v('phone') }, form.querySelector('button[type=submit]'), form); }
      catch (e) { return; }
      paintHeader();
      HW.router.run({ scroll: false });
      u.toast('Changes saved');
    },

    subscribe: async function (el) {
      el.disabled = true;
      try { await saveProfile({ subscribed: el.checked }); u.toast(el.checked ? 'You’ll get our emails' : 'You’re unsubscribed'); }
      catch (e) { el.checked = !el.checked; }
      finally { el.disabled = false; }
    },

    markRead: function () {
      var a = get(); if (!a) return;
      var s = u.store.get(SEEN, {}) || {}; s[a.email] = Date.now(); u.store.set(SEEN, s);
      HW.router.run({ scroll: false });
    },

    addr: {
      edit: function (id) { state.editing = id || 'new'; HW.router.run({ scroll: false }); var f = document.getElementById('ad_name'); if (f) f.focus(); },
      cancel: function () { state.editing = null; HW.router.run({ scroll: false }); },
      save: async function (form) {
        var el = form.elements, v = function (n) { return el[n].value.trim(); };
        var errs = [];
        if (!v('name')) errs.push('Enter the full name.');
        if (!v('line1') || !v('city')) errs.push('Enter the street address and city.');
        if (!v('state')) errs.push('Choose a state.');
        if (!/^\d{5}(-\d{4})?$/.test(v('zip'))) errs.push('Enter a 5-digit ZIP code.');
        if (errs.length) { say(form, errs.join(' ')); return; }
        var list = state.data.profile.addresses.slice();
        var one = { id: form.dataset.id || undefined, name: v('name'), phone: v('phone'), line1: v('line1'), line2: v('line2'), city: v('city'), state: v('state'), zip: v('zip'), label: v('label'), is_default: el.is_default.checked };
        if (one.is_default) list.forEach(function (x) { x.is_default = false; });
        var i = list.findIndex(function (x) { return x.id === one.id; });
        if (i > -1) list[i] = one; else list.push(one);
        try { await saveProfile({ addresses: list }, form.querySelector('button[type=submit]'), form); } catch (e) { return; }
        state.editing = null; u.toast('Address saved'); HW.router.run({ scroll: false });
      },
      setDefault: async function (btn) {
        var list = state.data.profile.addresses.map(function (x) { return Object.assign({}, x, { is_default: x.id === btn.dataset.id }); });
        try { await saveProfile({ addresses: list }, btn); } catch (e) { return; }
        u.toast('Default address updated'); HW.router.run({ scroll: false });
      },
      remove: async function (btn) {
        if (!confirm('Remove this address?')) return;
        var list = state.data.profile.addresses.filter(function (x) { return x.id !== btn.dataset.id; });
        try { await saveProfile({ addresses: list }, btn); } catch (e) { return; }
        u.toast('Address removed'); HW.router.run({ scroll: false });
      },
      importLast: async function (btn) {
        var l = state.data.lastAddress, ad = l.address || {};
        var one = { name: l.name, phone: l.phone, line1: ad.line1, line2: ad.line2, city: ad.city, state: ad.state, zip: ad.zip, is_default: true };
        try { await saveProfile({ addresses: [one] }, btn); } catch (e) { return; }
        u.toast('Address saved'); HW.router.run({ scroll: false });
      }
    },

    returnOrder: function (sel) { HW.router.navigate('/account/returns?order=' + encodeURIComponent(sel.value), { replace: true }); },

    requestReturn: async function (form) {
      var el = form.elements;
      var items = u.qsa('input[name=item]:checked', form).map(function (x) { return Number(x.value); });
      if (!items.length) { say(form, 'Choose at least one item to return.'); return; }
      if (!el.reason.value) { say(form, 'Choose a reason.'); el.reason.focus(); return; }
      var done = busy(form.querySelector('button[type=submit]'), 'Sending…'); say(form, '');
      try {
        await call('/account/return', { order_number: el.order.value, reason: el.reason.value, items: items, details: el.details.value.trim() });
        await load(true);
        u.toast('Return requested — we’ll email you');
        HW.router.navigate('/account/returns', { replace: true });
      } catch (e) { say(form, e.message); done(); }
    }
  };

  HW.views = HW.views || {};
  HW.views.account = function (params) {
    params = params || {};
    var a = get(), pending = u.session.get(PENDING, null);
    var section = Object.prototype.hasOwnProperty.call(SECTIONS, params.section || '') ? (params.section || '') : null;
    var title = 'Your account';
    if (a && section === null && params.section === 'login') {
      return { html: '', seo: { title: 'Your account', noindex: true }, after: function () { HW.router.navigate(takeNext(), { replace: true }); } };
    }
    if (a) {
      if (section === null) return HW.views.notfound();
      var d = state.data && state.email === a.email ? state.data : null;
      var nav = NAV.find(function (x) { return x[0] === section; });
      title = nav && section ? nav[1] : 'Your account';
      if (!d) {
        return {
          html: shell(a, null, section, '<p class="muted">Loading your account…</p>'),
          seo: { title: title, noindex: true, path: '/account' + (section ? '/' + section : '') },
          after: function () {
            load().then(function () { if (HW.router.current && HW.router.current.name === 'account') renderMain(); })
              .catch(function (e) { var m = document.getElementById('acctMain'); if (m) m.innerHTML = '<p class="form-msg err">' + esc(e.message) + '</p><p><button class="btn ghost sm" type="button" data-act="reload">Try again</button></p>'; });
          }
        };
      }
      return {
        html: shell(a, d, section, SECTIONS[section](d, a, params)),
        seo: { title: title, noindex: true, path: '/account' + (section ? '/' + section : '') },
        after: function () {
          paintHeader();
          var open = d.orders.findIndex(function (o) { return HW.cancelLeft({ status: o.status, paid_at: o.paid_at, created_at: o.created_at }) > 0 && /^(paid|authorized|cod)$/.test(o.payment_status); });
          if (open > -1 && document.getElementById('cancelLeft' + (section === 'orders' && !params.id ? open : 0))) {
            HW.countdown('cancelLeft' + (section === 'orders' && !params.id ? open : 0), d.orders[open].paid_at);
          }
          if (section === 'orders' && location.hash) { var t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
        }
      };
    }
    /* Signed out: the sign-in page (split screen, header and footer hidden). */
    var box;
    if (pending) {
      box = '<h1 class="auth-h">Check your email</h1>' +
        '<p class="auth-sub">We’ve emailed a 6-digit code to <b>' + esc(pending) + '</b>. It works for 10 minutes — check your spam folder too.</p>' +
        '<form class="form" data-form="acct-code" novalidate aria-label="Enter your code">' +
        '<div class="fld"><label for="ac_code">6-digit code</label><input class="acct-code" id="ac_code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required></div>' +
        '<p class="form-msg" role="status" hidden></p>' +
        '<button class="btn loom block" type="submit">Sign in</button>' +
        '<div class="auth-links"><button class="linkbtn" type="button" data-act="acct-resend">Send a new code</button>' +
        '<button class="linkbtn" type="button" data-act="acct-restart">Use a different email</button></div></form>';
    } else {
      var gid = googleId();
      box = '<h1 class="auth-h">Welcome back</h1>' +
        '<p class="auth-sub">Sign in or create an account to track orders, save addresses and check out faster.</p>' +
        '<p class="form-msg" id="authMsg" role="status" hidden></p>' +
        (gid ? '<button class="gbtn" type="button" data-act="acct-google">' + GOOGLE_G + '<span>Continue with Google</span></button><div class="auth-or"><span>or</span></div>' : '') +
        '<form class="form" data-form="acct-email" novalidate aria-label="Sign in with email">' +
        '<div class="fld"><label for="ac_email">Email</label><input id="ac_email" name="email" type="email" autocomplete="email" maxlength="254" required></div>' +
        '<p class="form-msg" role="status" hidden></p>' +
        '<button class="btn loom block" type="submit">Continue with email</button></form>' +
        '<p class="auth-note">No password needed — we email you a 6-digit code. New here? The same step creates your account. Already ordered as a guest? Use that email and your orders appear automatically.</p>';
    }
    if (section && section !== 'login' && SECTIONS[section]) u.session.set(NEXT, '/account/' + section);
    else if (params.next === 'checkout') u.session.set(NEXT, '/checkout');
    return {
      html: authShell(box),
      seo: { title: 'Sign in', noindex: true, path: '/account/login' },
      after: function () {
        document.body.classList.add('auth-page');
        paintHeader();
        if (/[#&](id_token|error)=/.test(location.hash)) {
          var q = new URLSearchParams(location.hash.slice(1));
          // Take the token out of the address bar and history straight away.
          history.replaceState(null, '', location.pathname + location.search);
          HW.account.finishGoogle(q);
          return;
        }
        var f = document.getElementById(pending ? 'ac_code' : 'ac_email'); if (f && pending) f.focus();
      }
    };
  };
})(window.HW = window.HW || {});
