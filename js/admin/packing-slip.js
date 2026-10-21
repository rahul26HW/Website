/* Home Weavers — the packing slip that goes in the box.

   Printed from the browser rather than built as a PDF on the server: the slip
   carries a logo, four photographs, a QR code and a barcode, and the browser
   already knows how to put all of that on paper. Print → Save as PDF if a file
   is wanted.

   On a gift order the prices come off. That is the whole point of the flag: the
   person opening the box did not pay for it and should not be told what it cost.
   Nothing about the charge changes — the buyer's own invoice is unaffected. */
(function (HW) {
  'use strict';

  var A = HW.A, u = HW.u, esc = u.esc;

  /* The PDF the shop designed has a line under each category. They are not in the
     catalogue, so they live here until there is a reason to make them editable. */
  var TAGLINES = {
    towels: 'Soft. Absorbent. Everyday luxury.',
    rugs: 'Plush comfort for every step.',
    'bath-rugs': 'Plush comfort for every step.',
    'shower-curtains': 'Stylish designs for a refreshing look.',
    'bath-accessories': 'Function meets everyday style.',
  };

  function money(n) { return u.money(n); }

  function addressLines(a) {
    var cityState = [a.city, a.state].filter(Boolean).join(', ');
    return [a.line1, a.line2, [cityState, a.zip, a.country].filter(Boolean).join(' ')]
      .filter(Boolean).map(esc).join('<br>');
  }

  function shippedVia(o) {
    if (o.carrier && o.tracking_number) return esc(o.carrier);
    if (o.carrier) return esc(o.carrier);
    return 'Not shipped yet';
  }

  /* Where the QR points: the customer's own order, where the review form for each
     item in it now lives. */
  function reviewUrl(o) {
    var site = String((A.draft.settings || {}).siteUrl || 'https://www.homeweavers.com/').replace(/\/?$/, '/');
    return site + 'account/orders#o-' + encodeURIComponent(o.order_number);
  }

  function tiles() {
    var cats = (A.draft.categories || []).filter(function (c) { return c.show !== false; }).slice(0, 4);
    return cats.map(function (c) {
      var img = c.image ? '<img src="' + esc(HW.asset(c.image)) + '" alt="">' : '<span class="ps-noimg"></span>';
      return '<div class="ps-tile">' + img +
        '<b>' + esc(c.name) + '</b>' +
        '<span>' + esc(TAGLINES[c.slug] || '') + '</span></div>';
    }).join('');
  }

  function itemRows(o, gift) {
    return (o.order_items || []).map(function (i) {
      return '<tr><td class="ps-sku">' + esc(i.sku || '') + '</td>' +
        '<td>' + esc(i.name) + (i.variant ? ' <span class="ps-opt">Option: ' + esc(i.variant) + '</span>' : '') + '</td>' +
        '<td class="ps-num">' + Number(i.qty) + '</td>' +
        (gift ? '' : '<td class="ps-num">' + money(i.unit_price) + '</td><td class="ps-num ps-tot">' + money(i.line_total) + '</td>') +
        '</tr>';
    }).join('');
  }

  function totals(o) {
    var row = function (label, value, cls) {
      return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + label + '</td><td class="ps-num">' + value + '</td></tr>';
    };
    return '<table class="ps-totals">' +
      row('Subtotal', money(o.subtotal)) +
      (Number(o.discount) ? row('Discount' + (o.promo_code ? ' (' + esc(o.promo_code) + ')' : ''), '−' + money(o.discount)) : '') +
      row('Shipping', Number(o.shipping) ? money(o.shipping) : 'Free') +
      (Number(o.cod_fee) ? row('Cash on delivery fee', money(o.cod_fee)) : '') +
      row('Tax', money(o.tax)) +
      row('<b>Order total</b>', '<b>' + money(o.total) + '</b>', 'ps-grand') +
      '</table>';
  }

  A.packingSlipHTML = function (o) {
    var bd = A.draft.brand || {}, contact = A.draft.contact || {};
    var gift = !!o.is_gift;
    var a = o.shipping_address || {};
    var free = Number((A.draft.shipping || {}).freeThreshold || 75);
    var site = String((A.draft.settings || {}).siteUrl || 'https://www.homeweavers.com/')
      .replace(/^https?:\/\//, '').replace(/\/+$/, '');

    return '<div class="ps-page">' +

      '<header class="ps-head">' +
      '<div class="ps-brand">' +
      (bd.logoImage ? '<img src="' + esc(HW.asset(bd.logoImage)) + '" alt="">' : '') +
      '<div><b>' + esc(bd.name || 'Home Weavers') + '</b>' +
      (bd.tagline ? '<span>' + esc(bd.tagline) + '</span>' : '') + '</div></div>' +
      '<div class="ps-meta">Order <b>#' + esc(o.order_number) + '</b>' +
      '<span>Order Date: ' + esc(u.fmtDate(o.created_at)) + '</span></div>' +
      '</header>' +

      '<section class="ps-hello">' +
      '<div><h1>' + esc(String(o.name || '').toUpperCase()) + '</h1>' +
      '<p class="ps-thanks">Thank you!</p>' +
      '<p class="ps-note">Every piece in this box was woven to be used and loved every day. ' +
      'We hope it makes your space feel a little more like home.</p>' +
      '<p class="ps-sign">— The ' + esc(bd.name || 'Home Weavers') + ' team</p>' +
      (gift && o.gift_message ? '<p class="ps-gift"><b>A note with your gift:</b><br>' + esc(o.gift_message) + '</p>' : '') +
      '</div>' +
      '<aside class="ps-ship"><b>SHIPPING TO</b><p>' + esc(o.name || '') + '<br>' + addressLines(a) + '</p>' +
      '<b>SHIPPED VIA</b><p>' + shippedVia(o) + '</p></aside>' +
      '</section>' +

      '<table class="ps-items"><thead><tr><th>SKU</th><th>IN THIS BOX</th><th class="ps-num">QTY</th>' +
      (gift ? '' : '<th class="ps-num">PRICE</th><th class="ps-num">TOTAL</th>') +
      '</tr></thead><tbody>' + itemRows(o, gift) + '</tbody></table>' +

      (gift
        ? '<p class="ps-giftnote">Prices are left off a gift slip. The receipt went to whoever placed the order.</p>'
        : totals(o)) +

      '<section class="ps-look"><b class="ps-eyebrow">COMPLETE THE LOOK</b>' +
      '<h2>Made for every corner of your bath.</h2>' +
      '<div class="ps-tiles">' + tiles() + '</div></section>' +

      '<p class="ps-strip">Free shipping on orders of ' + money(free) + ' or more' +
      '<span> · </span>Sign up at ' + esc(site) + ' for a first look at new arrivals</p>' +

      '<section class="ps-review"><div><b>We’d love your review.</b>' +
      '<p>Thank you for choosing ' + esc(bd.name || 'Home Weavers') + '. If you loved your purchase, ' +
      'please share a product review at ' + esc(site) + '. Have a wonderful day!</p>' +
      '<p class="ps-scan">SCAN THE QR CODE TO REVIEW YOUR ORDER →</p></div>' +
      HW.qrSvg(reviewUrl(o), 104, 2) + '</section>' +

      '<section class="ps-foot">' +
      '<div><b>RETURNS</b><p>Unused, unwashed items in original packaging within 30 days of delivery.</p>' +
      HW.code128Svg(o.order_number, 150, 32) + '</div>' +
      '<div><b>DAMAGED OR WRONG ITEM?</b><p>Email us within 7 days with your order # and a photo.</p></div>' +
      '<div><b>QUESTIONS</b><p>' + esc(contact.email || '') + '<br>' + esc(contact.hours || '') + '</p></div>' +
      '</section></div>';
  };

  /* Printed from the page itself. A new window would be stopped by a pop-up blocker,
     and the slip needs the admin's own stylesheet to look like anything. */
  A.actions['order-slip'] = function (el) {
    var o = (A.orderById && A.orderById(el.dataset.id)) || null;
    if (!o) { u.toast('Open the order first.'); return; }
    var root = document.getElementById('slipRoot');
    if (!root) {
      root = document.createElement('div');
      root.id = 'slipRoot';
      document.body.appendChild(root);
    }
    root.innerHTML = A.packingSlipHTML(o);
    document.body.classList.add('printing-slip');
    var done = function () {
      document.body.classList.remove('printing-slip');
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    /* A frame's grace so the browser has laid the slip out before the dialog opens. */
    setTimeout(function () { window.print(); }, 60);
  };
})(window.HW = window.HW || {});
