/* Home Weavers — header, navigation, mobile menu, footer, newsletter. */
(function (HW) {
  'use strict';

  var u = HW.u, esc = u.esc;

  HW.SVG = {
    logo: '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true"><rect x="1" y="1" width="20" height="20" rx="2" stroke="#3A5A52" stroke-width="1.4"/><path d="M1 6h20M1 11h20M1 16h20M6 1v20M11 1v20M16 1v20" stroke="#3A5A52" stroke-width="1" opacity=".55"/></svg>',
    weave: '<svg viewBox="0 0 62 14" fill="none" aria-hidden="true"><path d="M2 7h58M9 2v10M20 2v10M31 2v10M42 2v10M53 2v10" stroke="#3A5A52" stroke-width="1.3" stroke-linecap="round" opacity=".7"/></svg>',
    weaveLight: '<svg viewBox="0 0 62 14" fill="none" style="width:62px" aria-hidden="true"><path d="M2 7h58M9 2v10M20 2v10M31 2v10M42 2v10M53 2v10" stroke="#C9BFAE" stroke-width="1.3" stroke-linecap="round"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.9h2.54V9.85c0-2.52 1.5-3.91 3.79-3.91 1.1 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.78-1.63 1.57v1.88h2.78l-.44 2.9h-2.34V22c4.78-.79 8.44-4.94 8.44-9.94Z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" stroke="none"/></svg>',
    pinterest: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12c0 4.08 2.45 7.59 5.96 9.13-.08-.78-.16-1.97.03-2.82.18-.78 1.15-4.94 1.15-4.94s-.29-.59-.29-1.46c0-1.37.79-2.39 1.78-2.39.84 0 1.25.63 1.25 1.39 0 .85-.54 2.11-.82 3.28-.23.98.49 1.78 1.46 1.78 1.75 0 3.1-1.85 3.1-4.51 0-2.36-1.7-4.01-4.12-4.01-2.81 0-4.46 2.1-4.46 4.28 0 .85.33 1.76.74 2.25.08.1.09.18.07.28-.08.32-.25 1-.28 1.14-.04.18-.15.22-.34.13-1.25-.58-2.03-2.4-2.03-3.87 0-3.15 2.29-6.04 6.6-6.04 3.46 0 6.16 2.47 6.16 5.77 0 3.45-2.17 6.22-5.19 6.22-1.01 0-1.97-.53-2.3-1.15l-.62 2.39c-.23.86-.83 1.94-1.24 2.6.94.29 1.92.44 2.96.44 5.52 0 10-4.48 10-10S17.52 2 12 2Z"/></svg>',
    youtube: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23 12s0-3.2-.4-4.7a2.5 2.5 0 0 0-1.8-1.8C19.2 5 12 5 12 5s-7.2 0-8.8.5A2.5 2.5 0 0 0 1.4 7.3C1 8.8 1 12 1 12s0 3.2.4 4.7a2.5 2.5 0 0 0 1.8 1.8C4.8 19 12 19 12 19s7.2 0 8.8-.5a2.5 2.5 0 0 0 1.8-1.8C23 15.2 23 12 23 12Zm-13 3V9l5 3-5 3Z"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 3c.3 2 1.6 3.6 3.5 3.9v2.6c-1.3.1-2.5-.3-3.6-1v6.1a5.6 5.6 0 1 1-5.6-5.6c.3 0 .6 0 .9.1v2.7a2.9 2.9 0 1 0 2 2.8V3H16Z"/></svg>',
    houzz: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 3l7 4V3l7 4v14h-5v-6h-4v6H5V3Z"/></svg>'
  };

  /* ---------- logo (image with silent fallback to the text logo) ---------- */
  function brandMarkHTML(forceText) {
    var bd = HW.DB.brand || {};
    var tag = bd.tagline ? '<small class="tagline">' + esc(bd.tagline) + '</small>' : '';
    var useImg = !!bd.logoImage && !forceText;
    var graphic = useImg
      ? '<img class="logo-img" src="' + esc(HW.asset(bd.logoImage)) + '" alt="' + esc(bd.name || 'Home Weavers') + '" height="66" data-logo>'
      : HW.SVG.logo;
    var hideName = useImg && bd.hideName;
    var textCol = hideName ? tag : '<span id="brandName">' + esc(bd.name || '') + '</span>' + tag;
    return graphic + (textCol ? '<span class="wordblock">' + textCol + '</span>' : '');
  }
  HW.brandMarkHTML = brandMarkHTML;

  function wireLogoFallback(root) {
    u.qsa('img[data-logo]', root).forEach(function (img) {
      img.addEventListener('error', function () {
        var mark = img.closest('.mark');
        if (mark) mark.innerHTML = brandMarkHTML(true);
        // Only admins see logo problems; shoppers just get the text logo.
        if (HW.isAdminView && HW.isAdminView()) u.toast('Logo image couldn’t load — check it is a direct image link.');
      }, { once: true });
    });
  }
  HW.wireLogoFallback = wireLogoFallback;

  /* ---------- {{tokens}} ----------
     Written text (the announcement bar, the Terms and the other policy pages) can name a figure or a way to pay
     that the admin later changes. These tokens are filled in from the settings, so published text can't drift
     from what the checkout actually does. */
  var TOKENS = {
    free_shipping: function (DB) {
      var sh = DB.shipping || {};
      return sh.enabled !== false && sh.freeThreshold ? u.money(sh.freeThreshold).replace(/\.00$/, '') : '';
    },
    cod_limit: function (DB) { return u.money(Number((DB.payments || {}).codMax) || 500); },
    cancel_minutes: function (DB) { return String(Number((DB.payments || {}).cancelMinutes) || 30); },
    flat_rate: function (DB) { return u.money(Number((DB.shipping || {}).flatRate) || 0); },
    payment_terms: function (DB) {
      var pay = DB.payments || {}, cod = !!pay.cod, card = !!pay.stripe;
      if (card && cod) return 'You can pay by card, Apple Pay or Google Pay, or with cash on delivery on orders up to ' + TOKENS.cod_limit(DB) +
        '. Card orders are approved at checkout and charged when we start preparing your order; an order that isn’t paid is cancelled automatically.';
      if (cod) return 'Orders are paid with cash on delivery: you pay the courier in cash when your order arrives, on orders up to ' + TOKENS.cod_limit(DB) +
        '. Nothing is charged online and we never see a card number.';
      if (card) return 'We take card, Apple Pay and Google Pay. Your card is approved at checkout and charged when we start preparing your order. ' +
        'We don’t take cash on delivery or pay-later orders, and an order that isn’t paid is cancelled automatically.';
      return 'Checkout is closed while we finish setting up payments.';
    },
    tax_terms: function (DB) {
      var tax = DB.tax || {};
      return tax.enabled && (tax.rates || []).length ? 'Any sales tax that applies to your delivery state is shown at checkout, before you place the order.'
        : 'The price you see is the price you pay — we don’t add sales tax at checkout.';
    }
  };
  HW.tokens = function (text) {
    var DB = HW.DB || {};
    return String(text == null ? '' : text).replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, function (all, name) {
      var fn = TOKENS[String(name).toLowerCase()];
      return fn ? fn(DB) : all;
    });
  };

  /* ---------- header + footer ---------- */
  HW.paintChrome = function () {
    var DB = HW.DB, m = HW.m;
    var ann = HW.tokens(DB.announcement || '').trim();
    var annBar = document.getElementById('announce');
    var annText = document.getElementById('announceText');
    // While a sale is on, the bar carries it and counts down; afterwards the usual line comes back.
    var sale = m.saleNow ? m.saleNow() : null;
    annBar.classList.toggle('sale', !!sale);
    annBar.classList.toggle('sale-final', !!sale && sale.endsAt - Date.now() < 24 * 3600 * 1000);
    if (sale) {
      var last = sale.endsAt - Date.now() < 24 * 3600 * 1000;
      annText.innerHTML = (last ? 'Last day — ' : '') + u.esc(sale.name) + ' · ends in ' +
        '<b data-sale-ends="' + sale.endsAt + '" data-sale-style="bar"></b>';
      annBar.hidden = false;
      if (HW.saleClock) HW.saleClock.start();
    } else {
      annText.textContent = ann;
      annBar.hidden = !ann;
    }

    var mark = document.querySelector('header.site .brand .mark');
    mark.innerHTML = brandMarkHTML(false);
    wireLogoFallback(mark);
    var brandLink = document.querySelector('header.site .brand');
    brandLink.setAttribute('href', HW.link('/'));
    brandLink.setAttribute('aria-label', (DB.brand.name || 'Home Weavers') + ' home');

    var cats = m.visibleCategories();
    document.getElementById('topnav').innerHTML = cats.map(function (c) {
      var subs = m.visibleSubcategories(c);
      var fly = subs.length
        ? '<div class="flyout">' + subs.map(function (s) {
            return '<a href="' + HW.link('/category/' + c.slug + '?sub=' + encodeURIComponent(s.slug)) + '">' + esc(s.name) + '</a>';
          }).join('') + '<a class="shopall" href="' + HW.link('/category/' + c.slug) + '">Shop all ' + esc(c.name) + '</a></div>'
        : '';
      return '<div class="navitem"><a href="' + HW.link('/category/' + c.slug) + '">' + esc(c.name) + '</a>' + fly + '</div>';
    }).join('');

    document.getElementById('mnavLinks').innerHTML = cats.map(function (c) {
      var subs = m.visibleSubcategories(c);
      return '<a href="' + HW.link('/category/' + c.slug) + '">' + esc(c.name) + '</a>' +
        (subs.length ? '<div class="msub">' + subs.map(function (s) {
          return '<a href="' + HW.link('/category/' + c.slug + '?sub=' + encodeURIComponent(s.slug)) + '">' + esc(s.name) + '</a>';
        }).join('') + '</div>' : '');
    }).join('') + '<a href="' + HW.link('/account') + '">Your account</a>' + visiblePages('service').concat(visiblePages('company')).map(function (p) {
      return '<a href="' + HW.link('/page/' + p.slug) + '">' + esc(p.title) + '</a>';
    }).join('');

    var shopLinks = cats.map(function (c) { return '<a href="' + HW.link('/category/' + c.slug) + '">' + esc(c.name) + '</a>'; }).join('');
    function pageCol(key, label, first) {
      var links = (first || '') + visiblePages(key).map(function (p) { return '<a href="' + HW.link('/page/' + p.slug) + '">' + esc(p.title) + '</a>'; }).join('');
      return links ? '<div class="fcol"><h2 class="h5">' + esc(label) + '</h2>' + links + '</div>' : '';
    }
    document.getElementById('footLinks').innerHTML =
      (shopLinks ? '<div class="fcol"><h2 class="h5">Shop</h2>' + shopLinks + '</div>' : '') +
      pageCol('service', 'Customer service', '<a href="' + HW.link('/account') + '">Your account</a>') + pageCol('company', 'Our company');

    var soc = DB.social || {};
    var socials = [['facebook', 'Facebook'], ['instagram', 'Instagram'], ['pinterest', 'Pinterest'], ['youtube', 'YouTube'], ['tiktok', 'TikTok'], ['houzz', 'Houzz']]
      .filter(function (x) { return /^https?:\/\//i.test((soc[x[0]] || '').trim()); })
      .map(function (x) {
        return '<a href="' + esc(soc[x[0]].trim()) + '" target="_blank" rel="noopener noreferrer" aria-label="' + x[1] + ' (opens in a new tab)" title="' + x[1] + '">' + HW.SVG[x[0]] + '</a>';
      }).join('');
    var fsoc = document.getElementById('footSocial');
    fsoc.innerHTML = socials;
    fsoc.hidden = !socials;

    document.getElementById('footLegal').innerHTML = visiblePages('legal').map(function (p) {
      return '<a href="' + HW.link('/page/' + p.slug) + '">' + esc(p.title) + '</a>';
    }).join('');
    document.getElementById('footName').textContent = DB.brand.name || 'Home Weavers';
    document.getElementById('yr').textContent = new Date().getFullYear();

    var code = (DB.newsletter || {}).couponCode;
    var promo = code ? m.findPromo(code) : null;
    document.getElementById('newsLabel').textContent = promo
      ? 'Sign up for email updates — first look at new arrivals, plus ' + m.promoLabel(promo) + ' your first order.'
      : 'Sign up for email updates — first look at new arrivals and offers.';

    var wl = document.getElementById('wishLink');
    if (wl) wl.setAttribute('href', HW.link('/wishlist'));
    var al = document.getElementById('acctLink');
    if (al) al.setAttribute('href', HW.link('/account'));
    if (HW.account) HW.account.paintHeader();
    if (HW.wishlist) HW.wishlist.renderCount();
    if (HW.cart) HW.cart.render();
  };

  function visiblePages(group) {
    return (HW.DB.pages || []).filter(function (p) { return p.group === group && p.show !== false; });
  }

  /* ---------- mobile menu ---------- */
  var releaseMenu = null;
  HW.menu = {
    open: function () {
      var nav = document.getElementById('mnav');
      nav.classList.add('open');
      document.getElementById('mnavScrim').classList.add('open');
      document.getElementById('menuBtn').setAttribute('aria-expanded', 'true');
      nav.removeAttribute('aria-hidden');
      // Start the focus trap once the slide-in has made the links visible; before that they can't take focus.
      var started = false;
      var start = function () {
        if (started || !nav.classList.contains('open')) return;
        started = true; nav.removeEventListener('transitionend', start);
        releaseMenu = u.trapFocus(nav, HW.menu.close);
      };
      nav.addEventListener('transitionend', start);
      setTimeout(start, 420);
    },
    close: function (restore) {
      var nav = document.getElementById('mnav');
      if (!nav.classList.contains('open')) return;
      nav.classList.remove('open');
      document.getElementById('mnavScrim').classList.remove('open');
      document.getElementById('menuBtn').setAttribute('aria-expanded', 'false');
      nav.setAttribute('aria-hidden', 'true');
      if (releaseMenu) { releaseMenu(restore); releaseMenu = null; }
      if (nav.contains(document.activeElement)) { if (restore === false) document.activeElement.blur(); else document.getElementById('menuBtn').focus(); }
    }
  };

  /* ---------- newsletter ---------- */
  HW.subscribe = async function (form) {
    var input = form.querySelector('input[type=email]');
    var res = document.getElementById('newsResult');
    var btn = form.querySelector('button');
    var email = input.value.trim();
    if (!u.isEmail(email)) {
      res.className = 'news-result err';
      res.textContent = 'Please enter a valid email address.';
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    input.removeAttribute('aria-invalid');
    btn.disabled = true;
    try {
      var out = await HW.api.server('/public/subscribe', { email: email, source: 'footer' });
      input.value = '';
      var promo = out && out.code ? HW.m.findPromo(out.code) : null;
      res.className = 'news-result ok';
      if (promo) {
        res.innerHTML = 'You’re on the list ✓ Use code <b>' + esc(promo.code) + '</b> for ' + esc(HW.m.promoLabel(promo)) + ' your first order.';
      } else {
        res.textContent = 'You’re on the list ✓ Thanks for signing up.';
      }
      sendWelcomeEmail(email, promo);
    } catch (e) {
      res.className = 'news-result err';
      res.textContent = e.message || 'Something went wrong. Please try again.';
    } finally {
      btn.disabled = false;
    }
  };

  /* Optional: welcome email through the admin-configured worker. Never blocks sign-up. */
  function sendWelcomeEmail(email, promo) {
    var endpoint = ((HW.DB.newsletter || {}).emailEndpoint || '').trim();
    if (!/^https:\/\//i.test(endpoint)) return;
    try {
      fetch(endpoint.replace(/\/+$/, '') + '/welcome', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, code: promo ? promo.code : '', offer: promo ? HW.m.promoLabel(promo) : '', brand: HW.DB.brand.name })
      }).catch(function () {});
    } catch (e) {}
  }
})(window.HW = window.HW || {});
