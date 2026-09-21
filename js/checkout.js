/* Home Weavers — checkout page (used when Snipcart is off), card payment through Stripe Checkout, and order confirmation.
   Card flow: place_order saves the order (prices checked in the database) → the worker opens a Stripe Checkout page
   for that saved order → Stripe returns to /order/HW-…?payment=success|cancelled. The Stripe webhook marks it paid. */
(function (HW) {
  'use strict';

  var u = HW.u, esc = u.esc, m = HW.m;
  var LAST = 'hw:lastOrder';
  var DRAFT = 'hw:checkoutDraft';

  var STATES = [['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
    ['PR', 'Puerto Rico'], ['GU', 'Guam'], ['VI', 'U.S. Virgin Islands'], ['AS', 'American Samoa'], ['MP', 'Northern Mariana Islands'],
    ['AA', 'Armed Forces Americas (AA)'], ['AE', 'Armed Forces Europe (AE)'], ['AP', 'Armed Forces Pacific (AP)']];

  /* A US phone number: 10 digits, or 11 starting with 1. */
  function isPhone(s) {
    var d = String(s || '').replace(/\D/g, '');
    return d.length === 10 || (d.length === 11 && d.charAt(0) === '1');
  }

  function field(id, label, type, opts) {
    opts = opts || {};
    var d = u.session.get(DRAFT, {}) || {};
    var val = d[id] != null ? d[id] : '';
    var req = opts.optional ? '' : ' required';
    var lab = '<label for="co_' + id + '">' + esc(label) + (opts.optional ? ' <span class="opt">(optional)</span>' : '') + '</label>';
    if (type === 'select') {
      return '<div class="fld">' + lab + '<select id="co_' + id + '" name="' + id + '" autocomplete="' + (opts.ac || 'off') + '"' + req + '><option value="">Select…</option>' +
        opts.options.map(function (o) { return '<option value="' + o[0] + '"' + (val === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></div>';
    }
    if (type === 'textarea') {
      return '<div class="fld">' + lab + '<textarea id="co_' + id + '" name="' + id + '" maxlength="1000" style="min-height:80px">' + esc(val) + '</textarea></div>';
    }
    return '<div class="fld">' + lab + '<input id="co_' + id + '" name="' + id + '" type="' + type + '" value="' + esc(val) + '" autocomplete="' + (opts.ac || 'off') + '"' +
      (opts.inputmode ? ' inputmode="' + opts.inputmode + '"' : '') + (opts.pattern ? ' pattern="' + opts.pattern + '"' : '') + (opts.max ? ' maxlength="' + opts.max + '"' : '') + req + '>' +
      (opts.hint ? '<span class="fld-hint">' + esc(opts.hint) + '</span>' : '') + '</div>';
  }

  function codFee() { var p = (HW.DB && HW.DB.payments) || {}; return Number(p.codFee) || 0; }
  function codMax() { var p = (HW.DB && HW.DB.payments) || {}; return Number(p.codMax) || 500; }

  /* Cash on delivery has a ceiling. Say so here, instead of letting the server refuse a filled-in order. */
  function codBlock(t, pay) {
    if (pay !== 'cod') return '';
    var total = t.total + codFee() + HW.cart.tax(t, formState(), codFee()).tax;
    if (total <= codMax()) return '';
    return 'This order is ' + u.money(total) + ', above our ' + u.money(codMax()) + ' cash-on-delivery limit. ' +
      (HW.checkout.cardPayments() ? 'Please pay by card instead, or remove a few items.' : 'Please remove a few items, or place it as two smaller orders.');
  }
  function method(form) {
    var el = (form || document).querySelector('input[name=pay]:checked') || (form || document).querySelector('input[name=pay]');
    return el ? el.value : 'card';
  }

  function formState() { var s = document.getElementById('co_state'); return s ? s.value : ((u.session.get(DRAFT, {}) || {}).state || ''); }

  function summaryHTML(t, pay, st) {
    var fee = pay === 'cod' ? codFee() : 0;
    if (st === undefined) st = formState();
    var tx = HW.cart.tax(t, st, fee), taxOn = HW.cart.taxOn();
    return '<h2>Order summary</h2>' + t.lines.map(function (l) {
      var nm = esc(HW.seo.clip(l.name, 40));
      return '<div class="co-line"><div class="thumb"><img src="' + esc(HW.asset(HW.m.thumb(l.image))) + '" alt="" width="56" height="56" loading="lazy"><span class="qty" aria-hidden="true">' + l.qty + '</span></div>' +
        '<div><div class="nm">' + esc(l.name) + '</div>' + (l.variant ? '<div class="vr">' + esc(l.variant) + '</div>' : '') +
        (!l.inStock ? '<div class="vr" style="color:var(--clay);font-weight:600">Out of stock — please remove</div>' : '') +
        '<div class="co-qty"><div class="stepper sm" role="group" aria-label="Quantity for ' + nm + '">' +
        '<button type="button" data-act="co-qty" data-key="' + esc(l.key) + '" data-d="-1" aria-label="Decrease quantity"' + (l.qty <= 1 ? ' disabled' : '') + '>–</button>' +
        '<span aria-live="polite">' + l.qty + '</span>' +
        '<button type="button" data-act="co-qty" data-key="' + esc(l.key) + '" data-d="1" aria-label="Increase quantity"' + (l.qty >= Math.min(l.max, 99) ? ' disabled' : '') + '>+</button></div>' +
        '<button class="rm" type="button" data-act="co-remove" data-key="' + esc(l.key) + '">Remove<span class="sr-only"> ' + nm + '</span></button></div></div>' +
        '<div>' + u.money(l.price * l.qty) + '</div></div>';
    }).join('') +
      '<div style="margin-top:14px">' +
      '<div class="sumrow"><span>Subtotal</span><span>' + u.money(t.sub) + '</span></div>' +
      (t.discount > 0 ? '<div class="sumrow"><span class="disc">Discount (' + esc(t.promo.code) + ')</span><span class="disc">−' + u.money(t.discount) + '</span></div>' : '') +
      (t.promo && !t.promoValid ? '<div class="promo-note err" style="margin:0 0 8px">' + esc(t.promoNote) + '</div>' : '') +
      '<div class="sumrow"><span>Shipping</span><span>' + (t.ship ? u.money(t.ship) : 'Free') + '</span></div>' +
      (fee ? '<div class="sumrow"><span>Cash on delivery fee</span><span>' + u.money(fee) + '</span></div>' : '') +
      (taxOn ? '<div class="sumrow"><span>Sales tax' + (tx.rate ? ' <span class="muted">(' + esc(String(st).toUpperCase()) + ' ' + tx.rate + '%)</span>' : '') + '</span><span>' +
        (!st ? '<span class="muted">Choose your state</span>' : tx.tax ? u.money(tx.tax) : u.money(0)) + '</span></div>' : '') +
      '<div class="sumrow total"><span>Total</span><span>' + u.money(t.total + fee + tx.tax) + '</span></div></div>' +
      '<p class="muted" style="font-size:12.5px;margin:0">Ships in ' + esc(m.shippingDays()) + '. Final total is confirmed when you ' + (pay === 'cod' ? 'place the order' : 'continue to payment') + '.</p>';
  }

  HW.views = HW.views || {};

  HW.views.checkout = function () {
    if (HW.snip.enabled()) {
      return {
        html: '<div class="wrap"><div class="confirm"><h1>Checkout</h1><p class="muted">Open your cart to check out securely.</p>' +
          '<button class="btn loom snipcart-checkout" type="button">Open cart</button></div></div>',
        seo: { title: 'Checkout', noindex: true }
      };
    }
    HW.cart.prune();
    var t = HW.cart.totals();
    if (!t.lines.length) {
      return {
        html: '<div class="wrap"><div class="confirm"><div class="weave-rule">' + HW.SVG.weave + '</div><h1>Your cart is empty</h1>' +
          '<p class="muted">Add something you love, then come back to check out.</p><a class="btn" href="' + HW.link('/') + '">Start shopping</a></div></div>',
        seo: { title: 'Checkout', noindex: true }
      };
    }
    var anyOut = t.lines.some(function (l) { return !l.inStock; });
    var card = HW.checkout.cardPayments(), cod = HW.checkout.codPayments();
    if (!card && !cod) {
      // Orders are only taken with online payment (no pay-later / cash on delivery).
      var c = HW.DB.contact || {};
      return {
        html: '<div class="wrap"><div class="confirm"><div class="weave-rule">' + HW.SVG.weave + '</div><h1>Checkout is opening soon</h1>' +
          '<p class="muted">We’re finishing secure card payments. Your cart is saved on this device, so you can check out as soon as it opens.</p>' +
          (u.isEmail(c.email) ? '<p>Questions? Email <a class="link-u" style="font-size:inherit;letter-spacing:0;text-transform:none" href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>.</p>' : '') +
          '<a class="btn" href="' + HW.link('/') + '">Continue shopping</a></div></div>',
        seo: { title: 'Checkout', noindex: true }
      };
    }
    if (HW.account) HW.account.prefillCheckout(DRAFT);
    var saved = (u.session.get(DRAFT, {}) || {}).pay;
    var pay = card && cod ? (saved === 'cod' ? 'cod' : 'card') : cod ? 'cod' : 'card';
    var pmax = Number(((HW.DB && HW.DB.payments) || {}).codMax) || 500;
    var codDesc = 'Pay in cash when your order is delivered' + (codFee() ? ' · ' + u.money(codFee()) + ' fee' : '') + ' · orders up to ' + u.money(pmax) + '.';
    var cardDesc = 'Card, Apple Pay or Google Pay on Stripe’s secure page. Your card is approved now and charged when we start preparing your order.';
    var payBlock = card && cod
      ? '<h2>Payment</h2><fieldset class="paychoice"><legend class="sr-only">How would you like to pay?</legend>' +
        '<label class="payopt"><input type="radio" name="pay" value="card"' + (pay === 'card' ? ' checked' : '') + '><span><b>Card, Apple Pay or Google Pay</b><span class="muted">' + cardDesc + '</span></span></label>' +
        '<label class="payopt"><input type="radio" name="pay" value="cod"' + (pay === 'cod' ? ' checked' : '') + '><span><b>Cash on delivery</b><span class="muted">' + codDesc + '</span></span></label></fieldset>'
      : cod ? '<h2>Payment</h2><div class="notice" role="note"><b>Cash on delivery.</b> ' + codDesc + '<input type="hidden" name="pay" value="cod"></div>' : '';
    var acct = HW.account && HW.account.get();
    return {
      html: '<div class="wrap"><div class="checkout">' +
        '<form class="form" data-form="checkout" novalidate aria-labelledby="coHead">' +
        '<nav class="crumb" aria-label="Breadcrumb"><a href="' + HW.link('/') + '">Home</a> &nbsp;/&nbsp; <span aria-current="page">Checkout</span></nav>' +
        '<h1 id="coHead">Checkout</h1>' +
        (card && !cod ? '<div class="notice" role="note"><b>Secure card payment.</b> After you enter your details you’ll pay on Stripe’s secure page (card, Apple Pay or Google Pay). Your card is approved at checkout and only charged when we start preparing your order. Your card number goes only to Stripe — we never see or store it.</div>' : '') +
        '<h2>Contact</h2>' +
        (acct ? '<p class="muted" style="font-size:13.5px;margin:0 0 10px">Signed in as <b>' + esc(acct.email) + '</b>.' + (acct.profile ? ' Your details are filled in from your last order.' : ' This order will appear in your account.') + '</p>'
          : '<p class="muted" style="font-size:13.5px;margin:0 0 10px">Checking out as a guest. <a class="link-u" style="font-size:inherit;letter-spacing:0;text-transform:none" href="' + HW.link('/account') + '?next=checkout">Sign in or create an account</a> (optional) to see your orders later and check out faster.</p>') +
        field('email', 'Email', 'email', { ac: 'email', max: 254 }) +
        '<div class="row2">' + field('name', 'Full name', 'text', { ac: 'name', max: 120 }) + field('phone', 'Phone', 'tel', { ac: 'tel', max: 40, inputmode: 'tel', hint: 'For delivery updates from the courier.' }) + '</div>' +
        '<h2>Shipping address</h2>' +
        field('line1', 'Address', 'text', { ac: 'address-line1', max: 200 }) +
        field('line2', 'Apartment, suite, etc.', 'text', { ac: 'address-line2', optional: true, max: 200 }) +
        '<div class="row3">' + field('city', 'City', 'text', { ac: 'address-level2', max: 100 }) +
        field('state', 'State', 'select', { ac: 'address-level1', options: STATES }) +
        field('zip', 'ZIP code', 'text', { ac: 'postal-code', inputmode: 'numeric', pattern: '\\d{5}(-\\d{4})?', max: 10 }) + '</div>' +
        '<p class="muted" style="font-size:13px;margin:0">We currently ship within the United States.</p>' +
        field('note', 'Order note', 'textarea', { optional: true }) +
        payBlock +
        '<p class="form-msg" id="coMsg" role="alert" hidden></p>' +
        '<button class="btn loom block" id="coSubmit" type="submit"' + (anyOut || codBlock(t, pay) ? ' disabled' : '') + '>' + submitLabel(pay, t) + '</button>' +
        '<p class="form-msg err" id="coCodNote" role="alert"' + (codBlock(t, pay) ? '' : ' hidden') + '>' + esc(codBlock(t, pay)) + '</p>' +
        (anyOut ? '<p class="muted" style="font-size:13px">Remove out-of-stock items from your cart to continue.</p>' : '') +
        '<p class="muted" style="font-size:12.5px;margin:0">By continuing you agree to our <a class="link-u" style="font-size:inherit;letter-spacing:0;text-transform:none" href="' + HW.link('/page/terms-of-service') + '">Terms</a> and <a class="link-u" style="font-size:inherit;letter-spacing:0;text-transform:none" href="' + HW.link('/page/privacy-policy') + '">Privacy Policy</a>.</p>' +
        '</form>' +
        '<aside class="co-summary" id="coSummary" aria-label="Order summary">' + summaryHTML(t, pay) + '</aside>' +
        '</div></div>',
      seo: { title: 'Checkout', noindex: true }
    };
  };

  function submitLabel(pay, t) {
    var fee = pay === 'cod' ? codFee() : 0, total = t.total + fee + HW.cart.tax(t, formState(), fee).tax;
    return pay === 'cod' ? 'Place order · ' + u.money(total) + ' cash on delivery' : 'Continue to payment · ' + u.money(total);
  }

  /* The payments server: the Supabase Edge Function "hw" unless the admin entered another address (e.g. a Cloudflare Worker). */
  /* Minutes a customer can cancel a paid order themselves. */
  HW.cancelMinutes = function () {
    var n = Number(((HW.DB && HW.DB.settings) || {}).cancelMinutes);
    return n >= 0 && n <= 1440 ? n : 30;
  };
  /* Milliseconds left in that window for an order (0 when it has passed). */
  HW.cancelLeft = function (o) {
    if (!o || o.status && o.status !== 'new') return 0;
    var started = Date.parse(o.paid_at || o.created_at || '');
    if (!started) return 0;
    // Capped at the window itself: the server clock can be a few seconds ahead of this device.
    return Math.min(HW.cancelMinutes() * 60000, Math.max(0, started + HW.cancelMinutes() * 60000 - Date.now()));
  };
  /* Proof that this visitor may cancel: the tab that placed the order (pay token), the signed link in the order
     email (cancel token), or the signed-in account. Knowing the email alone isn't enough. */
  HW.cancelProof = function (number, email) {
    var body = {}, headers = {}, ok = false;
    var last = u.session.get(LAST, null);
    if (last && last.order_number === number && last.pay_token) { body.pay_token = last.pay_token; ok = true; }
    var toks = u.session.get('hw:cancelTokens', {}) || {};
    if (toks[number]) { body.cancel_token = toks[number]; ok = true; }
    var a = HW.account && HW.account.get();
    if (a && String(a.email).toLowerCase() === String(email || '').toLowerCase()) { headers.Authorization = 'Bearer ' + a.token; ok = true; }
    return { ok: ok, body: body, headers: headers };
  };
  HW.cancelOrder = async function (number, email) {
    var res, data = {}, proof = HW.cancelProof(number, email);
    try {
      res = await fetch(workerUrl() + '/order/cancel', {
        method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, proof.headers),
        body: JSON.stringify(Object.assign({ order_number: number, email: email }, proof.body))
      });
      data = await res.json().catch(function () { return {}; });
    } catch (e) { throw new Error('We couldn’t reach the store. Please try again.'); }
    if (!res.ok) throw new Error(data.error || 'We couldn’t cancel this order. Please contact us.');
    return data;
  };

  HW.serverUrl = function () { return workerUrl(); };

  function workerUrl() {
    var custom = String(((HW.DB && HW.DB.payments) || {}).workerUrl || '').trim().replace(/\/+$/, '');
    return custom || String((window.HW_CONFIG || {}).supabaseUrl || '').replace(/\/+$/, '') + '/functions/v1/hw';
  }

  HW.checkout = {
    states: function () { return STATES; },
    /* Cash on delivery is on (Admin › Storefront › Payment methods) and Snipcart is off. */
    codPayments: function () {
      var p = (HW.DB && HW.DB.payments) || {};
      return p.cod === true && /^https:\/\//.test(workerUrl()) && !(HW.snip && HW.snip.enabled());
    },
    /* Switching between card and cash on delivery updates the button and the total. */
    /* Quantity +/− and Remove in the checkout summary. */
    qty: function (btn) {
      var key = btn.dataset.key, d = +btn.dataset.d;
      if (!HW.cart.setQty(key, d)) return;
      HW.checkout.refresh(d);
      var again = document.querySelector('#coSummary [data-act="co-qty"][data-key="' + (window.CSS && CSS.escape ? CSS.escape(key) : key) + '"][data-d="' + d + '"]');
      if (again && again.disabled) again = again.parentNode.querySelector('[data-d="' + (-d) + '"]');
      if (again) again.focus();
    },
    remove: function (btn) {
      var key = btn.dataset.key, l = HW.cart.lines().find(function (x) { return x.key === key; });
      if (!l) return;
      HW.cart.setQty(key, -l.qty);
      u.toast('Removed ' + HW.seo.clip(l.name, 40));
      HW.checkout.refresh();
      var first = document.querySelector('#coSummary [data-act="co-qty"], #coSummary .rm'); if (first) first.focus();
    },
    refresh: function () {
      var form = document.querySelector('form[data-form="checkout"]');
      if (!HW.cart.lines().length) { HW.router.run({ scroll: false }); return; }
      if (form) HW.checkout.payChanged(form);
    },
    payChanged: function (form) {
      var t = HW.cart.totals(), pay = method(form), block = codBlock(t, pay);
      var b = document.getElementById('coSubmit');
      if (b) { b.textContent = submitLabel(pay, t); b.disabled = !!block || t.lines.some(function (l) { return !l.inStock; }); }
      var note = document.getElementById('coCodNote');
      if (note) { note.textContent = block; note.hidden = !block; }
      var s = document.getElementById('coSummary'); if (s) s.innerHTML = summaryHTML(t, pay);
      HW.checkout.saveDraft(form);
    },
    /* Card payments are on when the admin turned Stripe on and gave a worker address (and Snipcart is off). */
    cardPayments: function () {
      var p = (HW.DB && HW.DB.payments) || {};
      return !!p.stripe && /^https:\/\//.test(workerUrl()) && !(HW.snip && HW.snip.enabled());
    },
    /* Opens Stripe Checkout for a saved order. Throws with a shopper-friendly message. */
    pay: async function (o) {
      var res;
      try {
        res = await fetch(workerUrl() + '/checkout/session', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_number: o.order_number, pay_token: o.pay_token })
        });
      } catch (e) { throw new Error('We couldn’t reach the payment page. Check your connection and try again.'); }
      var data = await res.json().catch(function () { return {}; });
      if (data.paid) { o.paid = true; u.session.set(LAST, o); throw new Error('This order is already paid.'); }
      if (!res.ok || !/^https:\/\/checkout\.stripe\.com\//.test(data.url || '')) throw new Error(data.error || 'We couldn’t open the payment page. Please try again.');
      window.location.assign(data.url);
    },
    /* After Stripe: poll the order until the card is approved (or give up politely after ~40 s). */
    confirmPaid: async function (o) {
      var tries = 0;
      async function once() {
        if (!document.getElementById('payWait')) return;
        var st = null;
        try {
          var res = await fetch(workerUrl() + '/order/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_number: o.order_number, pay_token: o.pay_token }) });
          st = res.ok ? await res.json() : null;
        } catch (e) { st = null; }
        if (st && /^(authorized|paid)$/.test(st.payment_status)) {
          o.paid = true; o.paid_at = st.paid_at || new Date().toISOString(); delete o.payError;
          u.session.set(LAST, o); u.session.set(DRAFT, {}); HW.cart.clear();
          if (HW.account) HW.account.invalidate();
          HW.router.navigate('/order/' + encodeURIComponent(o.order_number), { replace: true, scroll: false });
          return;
        }
        if (++tries >= 14) {
          var w = document.getElementById('payWait');
          if (w) w.innerHTML = 'We haven’t had the payment confirmation yet. If Stripe showed it as paid, it’s on its way — you’ll get an email. <button class="linkbtn" type="button" data-act="reload">Check again</button>';
          return;
        }
        setTimeout(once, 3000);
      }
      once();
    },
    payAgain: async function (btn) {
      var o = u.session.get(LAST, null), msg = document.getElementById('payMsg');
      if (!o) return;
      btn.disabled = true; var label = btn.textContent; btn.textContent = 'Opening secure payment…';
      try { await HW.checkout.pay(o); }
      catch (e) {
        btn.disabled = false; btn.textContent = label;
        if (msg) { msg.hidden = false; msg.className = 'form-msg err'; msg.textContent = e.message; }
        if (o.paid) HW.router.run({ scroll: false });
      }
    },
    saveDraft: function (form) {
      var d = {};
      u.qsa('input,select,textarea', form).forEach(function (el) {
        if (!el.name || el.name === 'email_confirm') return;
        if (el.type === 'radio') { if (el.checked) d[el.name] = el.value; return; }
        d[el.name] = el.value;
      });
      u.session.set(DRAFT, d);
    },
    submit: async function (form) {
      var msg = document.getElementById('coMsg');
      var btn = form.querySelector('button[type=submit]');
      var get = function (n) { var el = form.elements[n]; return el ? el.value.trim() : ''; };
      var errors = [];
      u.qsa('[aria-invalid]', form).forEach(function (el) { el.removeAttribute('aria-invalid'); });
      function bad(name, text) { var el = form.elements[name]; if (el) el.setAttribute('aria-invalid', 'true'); errors.push({ el: el, text: text }); }
      if (!u.isEmail(get('email'))) bad('email', 'Enter a valid email address.');
      if (!get('name')) bad('name', 'Enter your full name.');
      if (!get('line1')) bad('line1', 'Enter your street address.');
      if (!get('city')) bad('city', 'Enter your city.');
      if (!get('state')) bad('state', 'Choose your state.');
      if (!/^\d{5}(-\d{4})?$/.test(get('zip'))) bad('zip', 'Enter a 5-digit ZIP code.');
      if (!isPhone(get('phone'))) bad('phone', 'Enter a phone number the courier can call (10 digits).');
      if (errors.length) {
        msg.hidden = false; msg.className = 'form-msg err';
        msg.textContent = errors.map(function (e) { return e.text; }).join(' ');
        if (errors[0].el) errors[0].el.focus();
        return;
      }
      var t = HW.cart.totals(), pay = method(form);
      if (!t.lines.length || !(pay === 'cod' ? HW.checkout.codPayments() : HW.checkout.cardPayments())) { HW.router.navigate('/checkout'); return; }
      var block = codBlock(t, pay);
      if (block) { msg.hidden = false; msg.className = 'form-msg err'; msg.textContent = block; return; }
      if (t.promo && !t.promoValid) { msg.hidden = false; msg.className = 'form-msg err'; msg.textContent = t.promoNote + ' Remove the code from your cart to continue.'; return; }

      btn.disabled = true;
      var label = btn.textContent;
      btn.textContent = 'Saving your order…';
      msg.hidden = true;
      try {
        var result = await HW.api.rpc('place_order', {
          p_order: {
            email: get('email'), name: get('name'), phone: get('phone'), note: get('note'),
            address: { line1: get('line1'), line2: get('line2'), city: get('city'), state: get('state'), zip: get('zip'), country: 'US' },
            promoCode: t.promo && t.promoValid ? t.promo.code : '',
            paymentMethod: pay,
            items: t.lines.map(function (l) { return { productId: l.id, colorId: l.colorId, sizeId: l.sizeId, qty: l.qty }; })
          }
        });
        result.name = get('name');
        if (result.payment_method === 'cod') {
          // Nothing to pay online: the order is confirmed now. Ask the server for the "we've got your order" email.
          result.paid = true; result.cod = true; result.paid_at = result.paid_at || new Date().toISOString();
          u.session.set(LAST, result);
          u.session.set(DRAFT, {});
          HW.cart.clear();
          fetch(workerUrl() + '/order/placed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_number: result.order_number, pay_token: result.pay_token }) }).catch(function () {});
          if (HW.account) HW.account.invalidate();
          HW.router.navigate('/order/' + encodeURIComponent(result.order_number));
          return;
        }
        u.session.set(LAST, result);
        // The cart stays until Stripe confirms payment, so a shopper who backs out can still change it.
        btn.textContent = 'Opening secure payment…';
        try { await HW.checkout.pay(result); return; }
        catch (e) { result.payError = e.message; u.session.set(LAST, result); }
        HW.router.navigate('/order/' + encodeURIComponent(result.order_number));
      } catch (e) {
        btn.disabled = false; btn.textContent = label;
        msg.hidden = false; msg.className = 'form-msg err';
        msg.textContent = e.message || 'We couldn’t place your order. Please try again.';
        msg.focus && msg.setAttribute('tabindex', '-1'); msg.focus();
        if (e.code && /^PROMO_/.test(e.code) && HW.cart.promoCode()) {
          // The code can't be used: take it off so the next try goes through.
          HW.cart.removePromo();
          msg.textContent = (e.message || 'That promo code can’t be used.') + ' We removed it — check the new total and try again.';
        }
        if (e.code && /^(OUT_OF_STOCK|PRODUCT_NOT_FOUND|VARIANT_NOT_FOUND|PROMO_)/.test(e.code)) {
          // Stock or promo changed: refresh the catalog so the summary shows the truth.
          HW.reloadStore && HW.reloadStore().then(function () {
            var s = document.getElementById('coSummary'); if (s) s.innerHTML = summaryHTML(HW.cart.totals(), pay);
          });
        }
      }
    }
  };

  HW.views.order = function (params) {
    var o = u.session.get(LAST, null);
    if (!o || o.order_number !== params.number) {
      return {
        html: '<div class="wrap"><div class="confirm"><h1>Order ' + esc(params.number) + '</h1>' +
          '<p class="muted">To see this order, look it up with the email you used at checkout.</p>' +
          '<a class="btn" href="' + HW.link('/page/track-your-order') + '">Track your order</a></div></div>',
        seo: { title: 'Order', noindex: true }
      };
    }
    var payment = (function () { try { return new URLSearchParams(location.search).get('payment'); } catch (e) { return null; } })();
    if (payment === 'success' && !o.paid && !o.cod) {
      // Don't trust the address bar: ask the server whether Stripe really approved the card (the webhook can take a moment).
      return {
        html: '<div class="wrap"><div class="confirm"><div class="weave-rule">' + HW.SVG.weave + '</div><h1>Confirming your payment…</h1>' +
          '<p class="muted" id="payWait" role="status">This takes a few seconds. Please keep this page open.</p></div></div>',
        seo: { title: 'Confirming payment', noindex: true },
        after: function () { HW.checkout.confirmPaid(o); }
      };
    }
    var first = o.name ? ', ' + esc(o.name.split(' ')[0]) : '';
    var unpaid = HW.checkout.cardPayments() && !o.paid;
    var linkStyle = ' style="font-size:inherit;letter-spacing:0;text-transform:none"';
    if (o.cancelled) {
      return {
        html: '<div class="wrap"><div class="confirm"><div class="weave-rule">' + HW.SVG.weave + '</div>' +
          '<h1>Order cancelled</h1><p class="muted" style="margin:0">Order ' + esc(o.order_number) + (o.cod ? ' has been cancelled. It was cash on delivery, so there’s nothing to pay.' : ' has been cancelled and you haven’t been charged. The temporary hold on your card is released; depending on your bank it disappears within minutes to a few days.') + '</p>' +
          '<p><a class="btn" href="' + HW.link('/') + '">Continue shopping</a></p></div></div>',
        seo: { title: 'Order cancelled', noindex: true },
        after: function () { var h = document.querySelector('.confirm h1'); if (h) { h.tabIndex = -1; h.focus(); } }
      };
    }
    var head = o.paid
      ? '<h1>Thank you' + first + '!</h1><p class="muted" style="margin:0">' + (o.cod ? 'Your order is placed. Please have <b>' + u.money(o.total) + '</b> ready in cash when it’s delivered.' : 'Your order is placed and your card is approved. You’re charged when we start preparing it.') + '</p>'
      : unpaid
        ? '<h1>Your order isn’t paid yet</h1><p class="muted" style="margin:0">' + (payment === 'cancelled' ? 'Payment was cancelled, so you haven’t been charged.' : 'We saved your order, but payment wasn’t completed.') + '</p>'
        : '<h1>Order ' + esc(o.order_number) + '</h1><p class="muted" style="margin:0">This order hasn’t been paid.</p>';
    var left = o.paid && !o.cancelled ? HW.cancelLeft({ status: 'new', paid_at: o.paid_at || new Date().toISOString() }) : 0;
    var cancelBox = left > 0
      ? '<div class="notice" role="note" style="text-align:left"><b>Changed your mind?</b> You can cancel this order yourself for the next ' +
        '<span id="cancelLeft">' + Math.ceil(left / 60000) + '</span> minutes' + (o.cod ? '' : ' and you won’t be charged') + '. After that we start preparing it, so please ' +
        '<a class="link-u" style="font-size:inherit;letter-spacing:0;text-transform:none" href="' + HW.link('/page/track-your-order') + '">ask us to cancel</a> instead.' +
        '<p class="form-msg err" id="cancelMsg" role="alert" hidden></p>' +
        '<div class="btnrow" style="margin-top:10px"><button class="btn ghost sm" type="button" data-act="cancel-order" data-n="' + esc(o.order_number) + '" data-e="' + esc(o.email) + '">Cancel this order</button></div></div>'
      : '';
    // Cash on delivery only works if someone is there with the money, so say what to have ready.
    var codBox = o.paid && o.cod && !o.cancelled
      ? '<div class="notice" role="note" style="text-align:left"><b>Paying in cash.</b> Please have <b>' + u.money(o.total) +
        '</b> ready for the courier — they may not carry change. Someone over 18 needs to be at the address to take the parcel and pay. ' +
        'If the address or phone number is wrong, tell us before it ships.</div>'
      : '';
    var next = o.paid
      ? '<p>A receipt goes to <b>' + esc(o.email) + '</b>. Orders ship within ' + esc(m.shippingDays()) + '. Follow it any time in <a class="link-u" style="font-size:inherit;letter-spacing:0;text-transform:none" href="' + HW.link('/account') + '">your account</a> — just sign in with this email.</p>'
      : unpaid
        ? '<p class="form-msg err" id="payMsg" role="alert"' + (o.payError ? '' : ' hidden') + '>' + esc(o.payError || '') + '</p>' +
          '<p><button class="btn loom" type="button" data-act="pay-order">Pay ' + u.money(o.total) + ' securely</button></p>' +
          '<p class="muted" style="font-size:13.5px">Want to change something? <a class="link-u"' + linkStyle + ' href="' + HW.link('/checkout') + '">Go back to checkout</a> — your cart is still saved. Unpaid orders are cancelled automatically.</p>'
        : '<p class="muted">Online payment is closed right now, so this order can’t be paid here. Questions? Use the Contact us page.</p>';
    return {
      html: '<div class="wrap"><div class="confirm">' +
        '<div class="weave-rule">' + HW.SVG.weave + '</div>' +
        head +
        '<div class="ordno">Order ' + esc(o.order_number) + '</div>' +
        next + codBox + cancelBox +
        '<div class="panelbox">' + (o.items || []).map(function (l) {
          return '<div class="sumrow"><span>' + esc(HW.seo.clip(l.name, 60)) + (l.variant ? ' <span class="muted">(' + esc(l.variant) + ')</span>' : '') + ' × ' + l.qty + '</span><span>' + u.money(l.line_total) + '</span></div>';
        }).join('') +
        '<hr style="border:none;border-top:1px solid var(--line);margin:12px 0">' +
        '<div class="sumrow"><span>Subtotal</span><span>' + u.money(o.subtotal) + '</span></div>' +
        (o.discount > 0 ? '<div class="sumrow"><span class="disc">Discount</span><span class="disc">−' + u.money(o.discount) + '</span></div>' : '') +
        '<div class="sumrow"><span>Shipping</span><span>' + (o.shipping > 0 ? u.money(o.shipping) : 'Free') + '</span></div>' +
        (Number(o.cod_fee) > 0 ? '<div class="sumrow"><span>Cash on delivery fee</span><span>' + u.money(o.cod_fee) + '</span></div>' : '') +
        (Number(o.tax) > 0 ? '<div class="sumrow"><span>Sales tax</span><span>' + u.money(o.tax) + '</span></div>' : '') +
        '<div class="sumrow total" style="margin-bottom:0"><span>Total</span><span>' + u.money(o.total) + '</span></div></div>' +
        '<a class="btn" href="' + HW.link('/') + '">Continue shopping</a> ' +
        '<a class="btn ghost" href="' + HW.link('/page/track-your-order') + '">Track your order</a>' +
        '</div></div>',
      seo: { title: o.paid ? 'Order confirmed' : 'Payment needed', noindex: true },
      after: function () {
        var h = document.querySelector('.confirm h1'); if (h) { h.tabIndex = -1; h.focus(); }
        HW.countdown('cancelLeft', o.paid_at);
      }
    };
  };
})(window.HW = window.HW || {});
