/* Home Weavers — checkout page (used when Snipcart is off), card payment through Stripe Checkout, and order confirmation.
   Card flow: place_order saves the order (prices checked in the database) → the worker opens a Stripe Checkout page
   for that saved order → Stripe returns to /order/HW-…?payment=success|cancelled. The Stripe webhook marks it paid. */
(function (HW) {
  'use strict';

  var u = HW.u, esc = u.esc, m = HW.m;
  var LAST = 'hw:lastOrder';
  var DRAFT = 'hw:checkoutDraft';

  var STATES = [['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming']];

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
      (opts.inputmode ? ' inputmode="' + opts.inputmode + '"' : '') + (opts.pattern ? ' pattern="' + opts.pattern + '"' : '') + (opts.max ? ' maxlength="' + opts.max + '"' : '') + req + '></div>';
  }

  function summaryHTML(t) {
    return '<h2>Order summary</h2>' + t.lines.map(function (l) {
      return '<div class="co-line"><div class="thumb"><img src="' + esc(HW.asset(HW.m.thumb(l.image))) + '" alt="" width="56" height="56" loading="lazy"><span class="qty" aria-label="Quantity ' + l.qty + '">' + l.qty + '</span></div>' +
        '<div><div class="nm">' + esc(l.name) + '</div>' + (l.variant ? '<div class="vr">' + esc(l.variant) + '</div>' : '') + '</div>' +
        '<div>' + u.money(l.price * l.qty) + '</div></div>';
    }).join('') +
      '<div style="margin-top:14px">' +
      '<div class="sumrow"><span>Subtotal</span><span>' + u.money(t.sub) + '</span></div>' +
      (t.discount > 0 ? '<div class="sumrow"><span class="disc">Discount (' + esc(t.promo.code) + ')</span><span class="disc">−' + u.money(t.discount) + '</span></div>' : '') +
      (t.promo && !t.promoValid ? '<div class="promo-note err" style="margin:0 0 8px">' + esc(t.promoNote) + '</div>' : '') +
      '<div class="sumrow"><span>Shipping</span><span>' + (t.ship ? u.money(t.ship) : 'Free') + '</span></div>' +
      '<div class="sumrow total"><span>Total</span><span>' + u.money(t.total) + '</span></div></div>' +
      '<p class="muted" style="font-size:12.5px;margin:0">Ships in ' + esc(m.shippingDays()) + '. Final total is confirmed when you ' + (HW.checkout.cardPayments() ? 'continue to payment' : 'place the order') + '.</p>';
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
    var card = HW.checkout.cardPayments();
    if (!card) {
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
    return {
      html: '<div class="wrap"><div class="checkout">' +
        '<form class="form" data-form="checkout" novalidate aria-labelledby="coHead">' +
        '<nav class="crumb" aria-label="Breadcrumb"><a href="' + HW.link('/') + '">Home</a> &nbsp;/&nbsp; <span aria-current="page">Checkout</span></nav>' +
        '<h1 id="coHead">Checkout</h1>' +
        '<div class="notice" role="note"><b>Secure card payment.</b> After you enter your details you’ll pay on Stripe’s secure page. Your card number goes only to Stripe — we never see or store it.</div>' +
        '<h2>Contact</h2>' +
        field('email', 'Email', 'email', { ac: 'email', max: 254 }) +
        '<div class="row2">' + field('name', 'Full name', 'text', { ac: 'name', max: 120 }) + field('phone', 'Phone', 'tel', { ac: 'tel', optional: true, max: 40 }) + '</div>' +
        '<h2>Shipping address</h2>' +
        field('line1', 'Address', 'text', { ac: 'address-line1', max: 200 }) +
        field('line2', 'Apartment, suite, etc.', 'text', { ac: 'address-line2', optional: true, max: 200 }) +
        '<div class="row3">' + field('city', 'City', 'text', { ac: 'address-level2', max: 100 }) +
        field('state', 'State', 'select', { ac: 'address-level1', options: STATES }) +
        field('zip', 'ZIP code', 'text', { ac: 'postal-code', inputmode: 'numeric', pattern: '\\d{5}(-\\d{4})?', max: 10 }) + '</div>' +
        '<p class="muted" style="font-size:13px;margin:0">We currently ship within the United States.</p>' +
        field('note', 'Order note', 'textarea', { optional: true }) +
        '<p class="form-msg" id="coMsg" role="alert" hidden></p>' +
        '<button class="btn loom block" type="submit"' + (anyOut ? ' disabled' : '') + '>Continue to payment · ' + u.money(t.total) + '</button>' +
        (anyOut ? '<p class="muted" style="font-size:13px">Remove out-of-stock items from your cart to continue.</p>' : '') +
        '<p class="muted" style="font-size:12.5px;margin:0">By continuing you agree to our <a class="link-u" style="font-size:inherit;letter-spacing:0;text-transform:none" href="' + HW.link('/page/terms-of-service') + '">Terms</a> and <a class="link-u" style="font-size:inherit;letter-spacing:0;text-transform:none" href="' + HW.link('/page/privacy-policy') + '">Privacy Policy</a>.</p>' +
        '</form>' +
        '<aside class="co-summary" id="coSummary" aria-label="Order summary">' + summaryHTML(t) + '</aside>' +
        '</div></div>',
      seo: { title: 'Checkout', noindex: true }
    };
  };

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
    return Math.max(0, started + HW.cancelMinutes() * 60000 - Date.now());
  };
  HW.cancelOrder = async function (number, email) {
    var res, data = {};
    try {
      res = await fetch(workerUrl() + '/order/cancel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_number: number, email: email })
      });
      data = await res.json().catch(function () { return {}; });
    } catch (e) { throw new Error('We couldn’t reach the store. Please try again.'); }
    if (!res.ok) throw new Error(data.error || 'We couldn’t cancel this order. Please contact us.');
    return data;
  };

  function workerUrl() {
    var custom = String(((HW.DB && HW.DB.payments) || {}).workerUrl || '').trim().replace(/\/+$/, '');
    return custom || String((window.HW_CONFIG || {}).supabaseUrl || '').replace(/\/+$/, '') + '/functions/v1/hw';
  }

  HW.checkout = {
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
      u.qsa('input,select,textarea', form).forEach(function (el) { if (el.name && el.name !== 'email_confirm') d[el.name] = el.value; });
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
      if (errors.length) {
        msg.hidden = false; msg.className = 'form-msg err';
        msg.textContent = errors.map(function (e) { return e.text; }).join(' ');
        if (errors[0].el) errors[0].el.focus();
        return;
      }
      var t = HW.cart.totals();
      if (!t.lines.length || !HW.checkout.cardPayments()) { HW.router.navigate('/checkout'); return; }
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
            items: t.lines.map(function (l) { return { productId: l.id, colorId: l.colorId, sizeId: l.sizeId, qty: l.qty }; })
          }
        });
        result.name = get('name');
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
        if (e.code && /^(OUT_OF_STOCK|PRODUCT_NOT_FOUND|VARIANT_NOT_FOUND|PROMO_)/.test(e.code)) {
          // Stock or promo changed: refresh the catalog so the summary shows the truth.
          HW.reloadStore && HW.reloadStore().then(function () {
            var s = document.getElementById('coSummary'); if (s) s.innerHTML = summaryHTML(HW.cart.totals());
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
    if (payment === 'success' && !o.paid) {
      // Display only: the Stripe webhook is what marks the order paid in the database.
      o.paid = true; o.paid_at = o.paid_at || new Date().toISOString();
      delete o.payError; delete o.pay_token; u.session.set(LAST, o);
      u.session.set(DRAFT, {});
      HW.cart.clear();
    }
    var first = o.name ? ', ' + esc(o.name.split(' ')[0]) : '';
    var unpaid = HW.checkout.cardPayments() && !o.paid;
    var linkStyle = ' style="font-size:inherit;letter-spacing:0;text-transform:none"';
    if (o.cancelled) {
      return {
        html: '<div class="wrap"><div class="confirm"><div class="weave-rule">' + HW.SVG.weave + '</div>' +
          '<h1>Order cancelled</h1><p class="muted" style="margin:0">Order ' + esc(o.order_number) + ' has been cancelled and your payment refunded in full. Refunds usually reach your bank in 5–10 business days.</p>' +
          '<p><a class="btn" href="' + HW.link('/') + '">Continue shopping</a></p></div></div>',
        seo: { title: 'Order cancelled', noindex: true },
        after: function () { var h = document.querySelector('.confirm h1'); if (h) { h.tabIndex = -1; h.focus(); } }
      };
    }
    var head = o.paid
      ? '<h1>Thank you' + first + '!</h1><p class="muted" style="margin:0">Your payment went through and your order is confirmed.</p>'
      : unpaid
        ? '<h1>Your order isn’t paid yet</h1><p class="muted" style="margin:0">' + (payment === 'cancelled' ? 'Payment was cancelled, so you haven’t been charged.' : 'We saved your order, but payment wasn’t completed.') + '</p>'
        : '<h1>Order ' + esc(o.order_number) + '</h1><p class="muted" style="margin:0">This order hasn’t been paid.</p>';
    var left = o.paid && !o.cancelled ? HW.cancelLeft({ status: 'new', paid_at: o.paid_at || new Date().toISOString() }) : 0;
    var cancelBox = left > 0
      ? '<div class="notice" role="note" style="text-align:left"><b>Changed your mind?</b> You can cancel this order yourself for the next ' +
        '<span id="cancelLeft">' + Math.ceil(left / 60000) + '</span> minutes and get a full refund. After that we start packing it, so please ' +
        '<a class="link-u" style="font-size:inherit;letter-spacing:0;text-transform:none" href="' + HW.link('/page/track-your-order') + '">ask us to cancel</a> instead.' +
        '<p class="form-msg err" id="cancelMsg" role="alert" hidden></p>' +
        '<div class="btnrow" style="margin-top:10px"><button class="btn ghost sm" type="button" data-act="cancel-order" data-n="' + esc(o.order_number) + '" data-e="' + esc(o.email) + '">Cancel this order</button></div></div>'
      : '';
    var next = o.paid
      ? '<p>A receipt goes to <b>' + esc(o.email) + '</b>. Orders ship within ' + esc(m.shippingDays()) + ', and you can follow yours on Track your order.</p>'
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
        next + cancelBox +
        '<div class="panelbox">' + (o.items || []).map(function (l) {
          return '<div class="sumrow"><span>' + esc(HW.seo.clip(l.name, 60)) + (l.variant ? ' <span class="muted">(' + esc(l.variant) + ')</span>' : '') + ' × ' + l.qty + '</span><span>' + u.money(l.line_total) + '</span></div>';
        }).join('') +
        '<hr style="border:none;border-top:1px solid var(--line);margin:12px 0">' +
        '<div class="sumrow"><span>Subtotal</span><span>' + u.money(o.subtotal) + '</span></div>' +
        (o.discount > 0 ? '<div class="sumrow"><span class="disc">Discount</span><span class="disc">−' + u.money(o.discount) + '</span></div>' : '') +
        '<div class="sumrow"><span>Shipping</span><span>' + (o.shipping > 0 ? u.money(o.shipping) : 'Free') + '</span></div>' +
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
