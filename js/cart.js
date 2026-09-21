/* Home Weavers — cart (saved in this browser), drawer, promo codes and totals.
   Totals here are a preview; the database re-checks everything when the order is placed. */
(function (HW) {
  'use strict';

  var u = HW.u, esc = u.esc, m = HW.m;
  var KEY = 'hw:cart:v2';
  var state = u.store.get(KEY, { lines: [], promo: '' });
  if (!state || !Array.isArray(state.lines)) state = { lines: [], promo: '' };
  if (state.promoData && state.promoData.code) HW.promoCache[String(state.promoData.code).toLowerCase()] = state.promoData;
  var promoMsg = '';
  var UNTRACKED_MAX = 10;   // the most of one line a shopper can order while stock isn't tracked

  /* "Only 3 available" when we count stock; a plain per-order limit when we don't. */
  function capNote(r) {
    return r && r.max < UNTRACKED_MAX ? 'Only ' + r.max + ' available.' : 'You can order up to ' + UNTRACKED_MAX + ' of this at a time.';
  }
  var release = null;

  function save() { u.store.set(KEY, state); }

  /* Rebuild a line from the live catalog (price, name, image, stock). */
  function resolve(line) {
    var p = (HW.DB.products || []).find(function (x) { return x.id === line.id; });
    if (!p || p.hidden) return null;
    if (m.isCollection(p)) {
      if (!line.colorId || !line.sizeId) return null;
      var cOk = m.optColor(p).values.some(function (c) { return c.id === line.colorId; });
      var sOk = m.optSize(p).values.some(function (s) { return s.id === line.sizeId; });
      if (!cOk || !sOk) return null;
      if (!m.isOffered(p, line.colorId, line.sizeId)) return null;
      var v = m.resolveVariant(p, line.colorId, line.sizeId);
      return { p: p, name: p.name, variant: v.color.label + ' / ' + v.size.label, price: v.effective, sku: v.sku, inStock: v.inStock,
        image: m.firstPhoto(v.rawImages, v.primary) || m.colorImage(p, v.color) || m.weaveSwatch(v.color.hex, v.color.label),
        max: m.invTracked(v.sku) ? m.invQty(v.sku) : UNTRACKED_MAX };
    }
    var sp = m.simplePrice(p);
    var key = m.simpleQtyKey(p);
    return { p: p, name: p.name, variant: '', price: sp.effective, sku: m.simpleSku(p), inStock: m.simpleInStock(p),
      image: m.imageOrSwatch(p), max: m.invTracked(key) ? m.invQty(key) : UNTRACKED_MAX };
  }

  var cart = HW.cart = {
    lines: function () {
      return state.lines.map(function (l) { var r = resolve(l); return r ? Object.assign({}, l, r) : null; }).filter(Boolean);
    },
    count: function () { return cart.lines().reduce(function (s, l) { return s + l.qty; }, 0); },

    /* Drop lines that no longer exist (deleted products, removed options). */
    prune: function () {
      var before = state.lines.length;
      state.lines = state.lines.filter(function (l) { return !!resolve(l); });
      if (state.lines.length !== before) {
        save();
        var gone = before - state.lines.length;
        setTimeout(function () { u.toast(gone === 1 ? 'An item in your cart is no longer available, so we removed it.' : gone + ' items in your cart are no longer available, so we removed them.'); }, 600);
      }
    },

    add: function (id, qty, colorId, sizeId) {
      var p = (HW.DB.products || []).find(function (x) { return x.id === id; });
      if (!p) return;
      qty = Math.max(1, parseInt(qty, 10) || 1);
      if (m.isCollection(p) && (!colorId || !sizeId)) { HW.router.navigate('/product/' + p.slug); return; }
      var key = m.isCollection(p) ? p.id + '|' + colorId + '|' + sizeId : p.id;
      var r = resolve({ id: id, colorId: colorId, sizeId: sizeId });
      if (!r || !r.inStock) { u.toast('Sorry, that’s out of stock.'); return; }
      var ex = state.lines.find(function (l) { return l.key === key; });
      var have = ex ? ex.qty : 0;
      var next = Math.min(have + qty, r.max, 99);
      if (next <= have) { u.toast(capNote(r)); return; }
      if (ex) ex.qty = next; else state.lines.push({ key: key, id: id, colorId: colorId || null, sizeId: sizeId || null, qty: next });
      if (next < have + qty) u.toast(capNote(r) + ' Added what we could.');
      save();
      cart.render();
      cart.open();
    },
    change: function (key, d) {
      var l = state.lines.find(function (x) { return x.key === key; });
      if (!l) return;
      var r = resolve(l);
      var q = l.qty + d;
      if (r && q > Math.min(r.max, 99)) { u.toast(capNote(r)); return; }
      if (q <= 0) state.lines = state.lines.filter(function (x) { return x.key !== key; });
      else l.qty = q;
      promoMsg = '';
      save(); cart.render();
      // Keep keyboard focus on the same button after the list is redrawn.
      var again = document.querySelector('#cartItems [data-act="cart-qty"][data-key="' + (window.CSS && CSS.escape ? CSS.escape(key) : key) + '"][data-d="' + d + '"]');
      if (again && again.disabled) again = again.parentNode.querySelector('[data-d="' + (-d) + '"]');
      if (again) again.focus();
      else { var first = document.querySelector('#cartItems button, #cartDrawer .iconbtn'); if (first) first.focus(); }
    },
    remove: function (key) {
      state.lines = state.lines.filter(function (x) { return x.key !== key; });
      promoMsg = '';
      save(); cart.render();
      var first = document.querySelector('#cartItems button, #cartDrawer .iconbtn');
      if (first) first.focus();
    },
    clear: function () { state = { lines: [], promo: '' }; promoMsg = ''; save(); cart.render(); },

    promoCode: function () { return state.promo || ''; },
    applyPromo: async function (code) {
      code = String(code || '').trim().slice(0, 40);
      if (!code) { promoMsg = ''; cart.render(); return; }
      var found = m.findPromo(code);
      if (!found) {
        try { found = await HW.api.rpc('check_promo', { p_code: code }); } catch (e) { found = null; }
        if (found && found.code) HW.promoCache[String(found.code).toLowerCase()] = found;
      }
      if (!found || !found.code) { state.promo = ''; state.promoData = null; promoMsg = 'err:That code isn’t valid.'; save(); cart.render(); focusPromo(); return; }
      state.promo = found.code; state.promoData = found; promoMsg = ''; save(); cart.render();
      var t = cart.totals();
      if (t.promoValid) u.toast(found.code + ' applied');
    },
    removePromo: function () { state.promo = ''; state.promoData = null; promoMsg = ''; save(); cart.render(); focusPromo(); },

    totals: function () {
      var lines = cart.lines();
      // Out-of-stock lines stay visible (to be removed) but never count toward the totals.
      var subCents = lines.reduce(function (s, l) { return s + (l.inStock ? Math.round(l.price * 100) * l.qty : 0); }, 0);
      var sub = subCents / 100;
      var sh = HW.DB.shipping || { enabled: true, freeThreshold: 75, flatRate: 9.95 };
      var promo = state.promo ? m.findPromo(state.promo) : null;
      var discount = 0, promoValid = true, promoNote = '';
      if (promo) {
        promoNote = m.promoProblem(promo, sub);
        if (promoNote) promoValid = false;
        // Whole cents, rounded like the database (half away from zero), so the total shown is the total charged.
        else discount = promo.type === 'percent' ? Math.round(subCents * Number(promo.value) / 100) / 100 : Math.min(Math.round(Number(promo.value) * 100), subCents) / 100;
      }
      var ship = 0, freeShip = true, remaining = 0;
      if (sh.enabled) {
        if (sub >= sh.freeThreshold || sub === 0) { freeShip = true; ship = 0; }
        else { freeShip = false; ship = Number(sh.flatRate) || 0; remaining = u.round2(sh.freeThreshold - sub); }
      }
      return { lines: lines, sub: sub, discount: discount, ship: ship, total: (Math.max(0, subCents - Math.round(discount * 100)) + Math.round(ship * 100)) / 100,
        promo: promo, promoValid: promoValid, promoNote: promoNote, freeShip: freeShip, remaining: remaining, sh: sh };
    },

    /* Sales tax for a state, worked out exactly like place_order (whole cents, rate per state from the admin). */
    tax: function (t, state, fee) {
      var tx = HW.DB.tax || {};
      if (!tx.enabled || !state) return { tax: 0, rate: 0, known: !!tx.enabled && !!state };
      var r = (tx.rates || []).find(function (x) { return String(x.state || '').toUpperCase() === String(state).toUpperCase(); });
      var rate = r ? Math.min(Number(r.rate) || 0, 20) : 0;
      if (!(rate > 0)) return { tax: 0, rate: 0, known: true };
      var baseCents = Math.max(0, Math.round(t.sub * 100) - Math.round(t.discount * 100)) + (r.shipping === false ? 0 : Math.round(t.ship * 100));
      return { tax: Math.round(baseCents * Math.round(rate * 1000) / 100000) / 100, rate: rate, known: true };
    },
    taxOn: function () { return !!(HW.DB.tax && HW.DB.tax.enabled && (HW.DB.tax.rates || []).length); },
    /* Quantity change without the drawer's focus handling (used by the checkout summary). */
    setQty: function (key, d) {
      var l = state.lines.find(function (x) { return x.key === key; });
      if (!l) return false;
      var r = resolve(l), q = l.qty + d;
      if (r && q > Math.min(r.max, 99)) { u.toast(capNote(r)); return false; }
      if (q <= 0) state.lines = state.lines.filter(function (x) { return x.key !== key; }); else l.qty = q;
      save(); cart.render();
      return true;
    },

    render: function () {
      var n = cart.count();
      var cc = document.getElementById('cartCount');
      if (cc && !(HW.snip && HW.snip.enabled())) cc.textContent = n;
      var btn = document.getElementById('cartBtn');
      if (btn && !(HW.snip && HW.snip.enabled())) btn.setAttribute('aria-label', 'Cart, ' + u.plural(n, 'item'));
      var items = document.getElementById('cartItems'), foot = document.getElementById('cartFoot');
      if (!items) return;
      if (state.promo && !m.findPromo(state.promo)) { state.promo = ''; state.promoData = null; save(); }
      var t = cart.totals();
      if (!t.lines.length) {
        promoMsg = '';
        if (state.promo) { state.promo = ''; state.promoData = null; save(); } // an empty cart keeps no code
        items.innerHTML = '<div class="empty-cart"><div class="weave-rule" style="margin-bottom:14px">' + HW.SVG.weaveLight + '</div><p>Your cart is empty.</p><a class="link-u" href="' + HW.link('/') + '" data-act="cart-close">Start shopping</a></div>';
        foot.innerHTML = '';
        return;
      }
      items.innerHTML = '<ul style="list-style:none;margin:0;padding:0">' + t.lines.map(function (l) {
        return '<li class="citem">' +
          '<div class="thumb"><img src="' + esc(HW.asset(m.thumb(l.image))) + '" alt="" width="74" height="74" loading="lazy"></div>' +
          '<div><h3 class="h4" style="font-family:var(--disp);font-size:16px;margin:0 0 3px;line-height:1.25">' + esc(HW.seo.clip(l.name, 90)) + '</h3>' +
          (l.variant ? '<div class="muted" style="font-size:12.5px;margin:-1px 0 2px">' + esc(l.variant) + '</div>' : '') +
          (!l.inStock ? '<div style="font-size:12.5px;color:var(--clay);font-weight:600">Out of stock — please remove</div>' : '') +
          '<div class="muted" style="font-size:13px">' + u.money(l.price) + ' each</div>' +
          '<div class="stepper" role="group" aria-label="Quantity for ' + esc(HW.seo.clip(l.name, 40)) + '" style="margin-top:8px;transform:scale(.85);transform-origin:left">' +
          '<button type="button" data-act="cart-qty" data-key="' + esc(l.key) + '" data-d="-1" aria-label="Decrease quantity"' + (l.qty <= 1 ? ' disabled' : '') + '>–</button><span>' + l.qty + '</span>' +
          '<button type="button" data-act="cart-qty" data-key="' + esc(l.key) + '" data-d="1" aria-label="Increase quantity">+</button></div></div>' +
          '<div style="text-align:right"><div style="font-weight:600">' + u.money(l.price * l.qty) + '</div>' +
          '<button class="rm" type="button" data-act="cart-remove" data-key="' + esc(l.key) + '">Remove<span class="sr-only"> ' + esc(HW.seo.clip(l.name, 40)) + '</span></button></div></li>';
      }).join('') + '</ul>';

      var shipBar = '';
      if (t.sh.enabled) {
        shipBar = t.freeShip
          ? '<div class="shipbar"><div class="msg free">✓ Your order qualifies for free shipping</div></div>'
          : '<div class="shipbar"><div class="track" role="progressbar" aria-label="Progress to free shipping" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.min(100, Math.round(t.sub / t.sh.freeThreshold * 100)) + '"><i style="width:' + Math.min(100, Math.round(t.sub / t.sh.freeThreshold * 100)) + '%"></i></div>' +
            '<div class="msg">You’re ' + u.money(t.remaining) + ' away from <b>free shipping</b></div></div>';
      }
      var promoArea;
      if (t.promo) {
        promoArea = '<div class="promo-wrap"><div class="promo-chip"><span><b>' + esc(t.promo.code) + '</b> — ' + esc(m.promoLabel(t.promo)) + '</span>' +
          '<button type="button" data-act="promo-remove">Remove<span class="sr-only"> promo code</span></button></div>' +
          (!t.promoValid ? '<div class="promo-note err" role="alert">' + esc(t.promoNote) + '</div>' : '') + '</div>';
      } else {
        var err = promoMsg.indexOf('err:') === 0;
        promoArea = '<form class="promo-wrap" data-form="promo" novalidate><div class="promo-row">' +
          '<label class="sr-only" for="promoInput">Promo code</label>' +
          '<input id="promoInput" class="fld-inline" placeholder="Promo code" autocomplete="off" style="border:1px solid var(--line);border-radius:var(--r);padding:9px 12px;font-size:14px;font-family:inherit;background:#fff"' + (err ? ' aria-invalid="true" aria-describedby="promoNote"' : '') + '>' +
          '<button class="btn ghost sm" type="submit">Apply</button></div>' +
          (promoMsg ? '<div id="promoNote" class="promo-note ' + (err ? 'err' : 'ok') + '" role="alert">' + esc(promoMsg.replace(/^err:/, '')) + '</div>' : '') + '</form>';
      }
      var anyOut = t.lines.some(function (l) { return !l.inStock; });
      var pay = HW.DB.payments || {};
      // Cash on delivery is capped. Say it here rather than after a filled-in checkout form.
      var overCod = pay.cod && !pay.stripe && t.total > (Number(pay.codMax) || 500);
      foot.innerHTML = shipBar + promoArea +
        '<div class="sumrow"><span>Subtotal</span><span>' + u.money(t.sub) + '</span></div>' +
        (t.discount > 0 ? '<div class="sumrow"><span class="disc">Discount (' + esc(t.promo.code) + ')</span><span class="disc">−' + u.money(t.discount) + '</span></div>' : '') +
        '<div class="sumrow"><span>Shipping</span><span>' + (t.sh.enabled ? (t.ship ? u.money(t.ship) : 'Free') : 'Calculated at checkout') + '</span></div>' +
        '<div class="sumrow total"><span>Total</span><span>' + u.money(t.total) + '</span></div>' +
        (cart.taxOn() ? '<p class="muted center" style="font-size:12px;margin:-4px 0 12px">Sales tax, if any, is added at checkout.</p>' : '') +
        (anyOut || overCod
          ? '<button class="btn loom block" type="button" disabled>Checkout</button><p class="muted center" style="font-size:12px;margin:12px 0 0">' +
            (anyOut ? 'Remove out-of-stock items to continue.' : 'Orders are paid in cash on delivery, up to ' + u.money(Number(pay.codMax) || 500) + '. Please remove a few items, or order in two parts.') + '</p>'
          : '<a class="btn loom block" href="' + HW.link('/checkout') + '" data-act="cart-close">Checkout</a>');
    },

    open: function () {
      var d = document.getElementById('cartDrawer');
      if (d.classList.contains('open')) return;
      HW.menu.close(false);
      cart.render();
      d.classList.add('open');
      d.removeAttribute('aria-hidden');
      document.getElementById('cartScrim').classList.add('open');
      document.getElementById('cartBtn').setAttribute('aria-expanded', 'true');
      release = u.trapFocus(d, function () { cart.close(); });
    },
    close: function (restore) {
      var d = document.getElementById('cartDrawer');
      if (!d.classList.contains('open')) return;
      d.classList.remove('open');
      d.setAttribute('aria-hidden', 'true');
      document.getElementById('cartScrim').classList.remove('open');
      var btn = document.getElementById('cartBtn');
      btn.setAttribute('aria-expanded', 'false');
      if (release) { release(restore); release = null; }
      // If focus had nowhere to go back to, don't leave it inside the hidden drawer.
      if (d.contains(document.activeElement)) { if (restore === false) document.activeElement.blur(); else btn.focus(); }
    },
    toggle: function () {
      var d = document.getElementById('cartDrawer');
      if (d.classList.contains('open')) cart.close(); else cart.open();
    }
  };

  function focusPromo() { setTimeout(function () { var i = document.getElementById('promoInput'); if (i) i.focus(); }, 0); }

  /* Keep carts in sync across tabs. */
  window.addEventListener('storage', function (e) {
    if (e.key !== KEY) return;
    state = u.store.get(KEY, { lines: [], promo: '' }) || { lines: [], promo: '' };
    if (HW.DB) cart.render();
  });
})(window.HW = window.HW || {});
