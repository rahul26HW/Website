/* Home Weavers — checkout page (used when Snipcart is off) and order confirmation. */
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
      '<p class="muted" style="font-size:12.5px;margin:0">Ships in ' + esc(m.shippingDays()) + '. Final total is confirmed when you place the order.</p>';
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
    return {
      html: '<div class="wrap"><div class="checkout">' +
        '<form class="form" data-form="checkout" novalidate aria-labelledby="coHead">' +
        '<nav class="crumb" aria-label="Breadcrumb"><a href="' + HW.link('/') + '">Home</a> &nbsp;/&nbsp; <span aria-current="page">Checkout</span></nav>' +
        '<h1 id="coHead">Checkout</h1>' +
        '<div class="notice" role="note"><b>Online payments aren’t enabled yet.</b> Place your order and we’ll email you within one business day to confirm it and arrange payment. You won’t be charged now.</div>' +
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
        '<button class="btn loom block" type="submit"' + (anyOut ? ' disabled' : '') + '>Place order · ' + u.money(t.total) + '</button>' +
        (anyOut ? '<p class="muted" style="font-size:13px">Remove out-of-stock items from your cart to continue.</p>' : '') +
        '<p class="muted" style="font-size:12.5px;margin:0">By placing your order you agree to our <a class="link-u" style="font-size:inherit;letter-spacing:0;text-transform:none" href="' + HW.link('/page/terms-of-service') + '">Terms</a> and <a class="link-u" style="font-size:inherit;letter-spacing:0;text-transform:none" href="' + HW.link('/page/privacy-policy') + '">Privacy Policy</a>.</p>' +
        '</form>' +
        '<aside class="co-summary" id="coSummary" aria-label="Order summary">' + summaryHTML(t) + '</aside>' +
        '</div></div>',
      seo: { title: 'Checkout', noindex: true }
    };
  };

  HW.checkout = {
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
      if (!t.lines.length) { HW.router.navigate('/checkout'); return; }
      if (t.promo && !t.promoValid) { msg.hidden = false; msg.className = 'form-msg err'; msg.textContent = t.promoNote + ' Remove the code from your cart to continue.'; return; }

      btn.disabled = true;
      var label = btn.textContent;
      btn.textContent = 'Placing order…';
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
        u.session.set(DRAFT, {});
        HW.cart.clear();
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
    return {
      html: '<div class="wrap"><div class="confirm">' +
        '<div class="weave-rule">' + HW.SVG.weave + '</div>' +
        '<h1>Thank you' + (o.name ? ', ' + esc(o.name.split(' ')[0]) : '') + '!</h1>' +
        '<p class="muted" style="margin:0">Your order has been received.</p>' +
        '<div class="ordno">Order ' + esc(o.order_number) + '</div>' +
        '<p>We’ll email <b>' + esc(o.email) + '</b> within one business day to confirm your order and arrange payment. Orders ship within ' + esc(m.shippingDays()) + ' after payment.</p>' +
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
      seo: { title: 'Order confirmed', noindex: true },
      after: function () { var h = document.querySelector('.confirm h1'); if (h) { h.tabIndex = -1; h.focus(); } }
    };
  };
})(window.HW = window.HW || {});
