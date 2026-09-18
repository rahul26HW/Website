/* Home Weavers — customer account.
   Sign in with a 6-digit code sent to the email used at checkout (no passwords anywhere), then see every order
   placed with that email, follow deliveries, cancel inside the free window, and check out with details filled in.
   Guest checkout is unchanged: an account is simply "the orders placed with this email". */
(function (HW) {
  'use strict';

  var u = HW.u, esc = u.esc;
  var KEY = 'hw:account';          // { token, email, expires, profile } — this device only; "Sign out" removes it
  var PENDING = 'hw:accountEmail'; // email waiting for its code (this tab only)
  var linkStyle = ' style="font-size:inherit;letter-spacing:0;text-transform:none"';

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

  function say(form, text, ok) {
    var msg = form.querySelector('.form-msg');
    msg.hidden = !text; msg.className = 'form-msg ' + (ok ? 'ok' : 'err'); msg.textContent = text || '';
  }

  var STATUS = { new: 'Received', accepted: 'Being prepared', packed: 'Packed', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled', refunded: 'Refunded' };

  function orderCard(o, i) {
    var link = HW.trackingUrl(o.carrier, o.tracking_number);
    var pay = o.payment_status === 'authorized' ? 'Card approved — charged when we start preparing it'
      : o.payment_status === 'voided' ? 'You weren’t charged'
      : o.payment_status === 'refunded' ? 'Refunded'
      : o.payment_status === 'failed' ? 'Payment didn’t go through — please contact us' : '';
    return '<section class="acct-order" aria-labelledby="ao' + i + '">' +
      '<div class="acct-head"><h2 id="ao' + i + '">' + esc(o.order_number) + '</h2><span class="acct-status">' + esc(STATUS[o.status] || o.status) + '</span></div>' +
      '<p class="muted" style="margin:4px 0 0;font-size:13.5px">Placed ' + esc(u.fmtDate(o.created_at)) + ' · ' + u.money(o.total) + (pay ? ' · ' + esc(pay) : '') + '</p>' +
      HW.orderSteps(o) +
      (o.tracking_number ? '<p style="margin:10px 0 0"><b>Tracking:</b> ' + esc(o.carrier ? o.carrier + ' ' : '') +
        (link ? '<a class="link-u"' + linkStyle + ' href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">' + esc(o.tracking_number) + '</a>' : esc(o.tracking_number)) + '</p>' : '') +
      HW.cancelBlock(o, o.order_number, (get() || {}).email, String(i)) +
      '<ul class="acct-items">' + (o.items || []).map(function (it) {
        var label = HW.seo.clip(it.name, 80) + (it.variant ? ' (' + it.variant + ')' : '') + ' × ' + it.qty;
        return '<li title="' + esc(label) + '">' + (it.image ? '<img src="' + esc(HW.asset(HW.m.thumb(it.image))) + '" alt="' + esc(label) + '" width="56" height="56" loading="lazy">' : '<span class="muted">' + esc(label) + '</span>') + '</li>';
      }).join('') + '</ul></section>';
  }

  HW.account = {
    get: get,

    /* Checkout: fill an empty form from the last order (only for a signed-in customer). */
    prefillCheckout: function (draftKey) {
      var a = get();
      var d = u.session.get(draftKey, null);
      if (!a || (d && Object.keys(d).length)) return;
      var p = a.profile || {}, ad = p.address || {};
      u.session.set(draftKey, { email: a.email, name: p.name || '', phone: p.phone || '', line1: ad.line1 || '', line2: ad.line2 || '', city: ad.city || '', state: ad.state || '', zip: ad.zip || '' });
    },

    sendCode: async function (form, emailArg) {
      var email = emailArg || form.elements.email.value.trim();
      if (!u.isEmail(email)) { say(form, 'Enter the email you used at checkout.'); form.elements.email && form.elements.email.focus(); return; }
      var btn = form.querySelector('button[type=submit]'); btn.disabled = true; say(form, '');
      try {
        await post('/account/code', { email: email });
        u.session.set(PENDING, email.toLowerCase());
        HW.router.run({ scroll: false });
      } catch (e) { say(form, e.message); btn.disabled = false; }
    },

    resend: async function (btn) {
      var email = u.session.get(PENDING, null), form = btn.closest('form');
      if (!email) return HW.account.restart();
      btn.disabled = true;
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
      var btn = form.querySelector('button[type=submit]'); btn.disabled = true; say(form, '');
      try {
        var r = await post('/account/verify', { email: email, code: code });
        u.store.set(KEY, { token: r.token, email: r.email, expires: r.expires });
        u.session.set(PENDING, null);
        u.toast('You’re signed in');
        var next = (function () { try { return new URLSearchParams(location.search).get('next'); } catch (e) { return ''; } })();
        if (next === 'checkout') { await HW.account.refresh(); HW.router.navigate('/checkout'); }
        else HW.router.navigate('/account');
      } catch (e) {
        say(form, e.message + (e.data && e.data.triesLeft != null ? ' (' + e.data.triesLeft + ' tries left)' : ''));
        btn.disabled = false; form.elements.code.select();
      }
    },

    signOut: function () {
      u.store.del(KEY);
      u.session.set(PENDING, null);
      u.session.set('hw:checkoutDraft', {});
      u.toast('You’re signed out');
      HW.router.navigate('/account');
    },

    /* Loads the orders (and the last address, kept for checkout). Returns the list, or null when signed out. */
    refresh: async function () {
      var a = get();
      if (!a) return null;
      try {
        var r = await post('/account/orders', {}, a.token);
        a.profile = r.profile || null;
        u.store.set(KEY, a);
        return r.orders || [];
      } catch (e) {
        if (e.status === 401) { u.store.del(KEY); return null; }
        throw e;
      }
    },

    load: async function () {
      var box = document.getElementById('acctOrders');
      if (!box) return;
      try {
        var orders = await HW.account.refresh();
        if (!document.getElementById('acctOrders')) return;
        if (orders === null) { u.toast('Please sign in again'); HW.router.run({ scroll: false }); return; }
        box.innerHTML = orders.length
          ? orders.map(orderCard).join('')
          : '<div class="panelbox"><p style="margin:0">No orders with this email yet. When you check out with <b>' + esc(get().email) + '</b>, your orders show up here.</p></div>';
        var open = orders.findIndex(function (o) { return HW.cancelLeft({ status: o.status, paid_at: o.paid_at, created_at: o.created_at }) > 0 && /^(paid|authorized)$/.test(o.payment_status); });
        if (open > -1) HW.countdown('cancelLeft' + open, orders[open].paid_at);
      } catch (e) {
        box.innerHTML = '<p class="form-msg err">' + esc(e.message) + '</p><p><button class="btn ghost sm" type="button" data-act="reload">Try again</button></p>';
      }
    }
  };

  HW.views = HW.views || {};
  HW.views.account = function () {
    var a = get(), pending = u.session.get(PENDING, null);
    var crumb = '<nav class="crumb" aria-label="Breadcrumb"><a href="' + HW.link('/') + '">Home</a> &nbsp;/&nbsp; <span aria-current="page">Your account</span></nav>';
    var body;
    if (a) {
      body = '<h1>Your orders</h1>' +
        '<p class="muted" style="margin:0 0 20px">Signed in as <b>' + esc(a.email) + '</b> · <button class="linkbtn" type="button" data-act="acct-signout">Sign out</button></p>' +
        '<div id="acctOrders" aria-live="polite"><p class="muted">Loading your orders…</p></div>';
    } else if (pending) {
      body = '<h1>Check your email</h1>' +
        '<form class="form panelbox" data-form="acct-code" novalidate aria-label="Enter your code">' +
        '<p style="margin:0 0 12px">If <b>' + esc(pending) + '</b> has orders with us, we’ve just emailed it a 6-digit code. It works for 10 minutes — check your spam folder too.</p>' +
        '<div class="fld"><label for="ac_code">6-digit code</label><input class="acct-code" id="ac_code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required></div>' +
        '<p class="form-msg" role="status" hidden></p>' +
        '<div class="btnrow"><button class="btn loom" type="submit">Sign in</button>' +
        '<button class="linkbtn" type="button" data-act="acct-resend">Send a new code</button>' +
        '<button class="linkbtn" type="button" data-act="acct-restart">Use a different email</button></div>' +
        '<p class="muted" style="font-size:13px;margin:14px 0 0">No email? Make sure it’s the address you used at checkout. Your account appears after your first order.</p>' +
        '</form>';
    } else {
      body = '<h1>Your account</h1>' +
        '<p class="muted" style="margin:0 0 20px">See all your orders, follow deliveries and check out faster. There’s no password — we email you a one-time code.</p>' +
        '<form class="form panelbox" data-form="acct-email" novalidate aria-labelledby="acctHead">' +
        '<h2 id="acctHead" style="font-size:24px;margin:0 0 4px;color:var(--ink)">Sign in</h2>' +
        '<div class="fld"><label for="ac_email">Email you used at checkout</label><input id="ac_email" name="email" type="email" autocomplete="email" maxlength="254" required></div>' +
        '<p class="form-msg" role="status" hidden></p>' +
        '<button class="btn loom" type="submit">Email me a code</button>' +
        '</form>' +
        '<p class="muted" style="font-size:13.5px;margin:16px 0 0">No account needed to shop — guest checkout works as always. You can also <a class="link-u"' + linkStyle + ' href="' + HW.link('/page/track-your-order') + '">track one order</a> with its number and email.</p>';
    }
    return {
      html: '<div class="wrap">' + crumb + '<div class="acct">' + body + '</div></div>',
      seo: { title: 'Your account', noindex: true, path: '/account' },
      after: function () {
        if (a) HW.account.load();
        else { var f = document.getElementById(pending ? 'ac_code' : 'ac_email'); if (f && pending) f.focus(); }
      }
    };
  };
})(window.HW = window.HW || {});
