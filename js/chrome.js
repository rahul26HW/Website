/* Home Weavers — header, navigation, mobile menu, footer, newsletter. */
(function (HW) {
  'use strict';

  var u = HW.u, esc = u.esc;

  /* One wrapper for the hand-drawn line icons below: same box, same weight, inherits the text colour. */
  function S(body) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  }

  HW.SVG = {
    logo: '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true"><rect x="1" y="1" width="20" height="20" rx="2" stroke="#3A5A52" stroke-width="1.4"/><path d="M1 6h20M1 11h20M1 16h20M6 1v20M11 1v20M16 1v20" stroke="#3A5A52" stroke-width="1" opacity=".55"/></svg>',
    /* Little line marks for the homepage highlight strip — one per claim, so three highlights
       never show the same woven square. HW.featureIcon() picks the one that fits. */
    feat: {
      wash: S('<rect x="4" y="2.6" width="16" height="18.8" rx="2.6"/><path d="M4 7.6h16"/><circle cx="12" cy="14.6" r="4.4"/><path d="M9.2 14.6c.7-.8 1.4-.8 2.1 0s1.4.8 2.1 0 1.4-.8 2.1 0"/><circle cx="7" cy="5.1" r=".85" fill="currentColor" stroke="none"/><circle cx="9.9" cy="5.1" r=".85" fill="currentColor" stroke="none"/>'),
      origin: S('<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.6 2.6 4 5.6 4 9s-1.4 6.4-4 9c-2.6-2.6-4-5.6-4-9s1.4-6.4 4-9Z"/>'),
      returns: S('<path d="M20.5 12a8.5 8.5 0 1 1-2.5-6"/><path d="M20.5 3.5v4.8h-4.8"/><path d="M12 7.8v4.6l3 1.7"/>'),
      shipping: S('<path d="M2.8 6.4h10.6v9.2H2.8z"/><path d="M13.4 9.6h3.6l3.2 2.9v3.1h-6.8z"/><circle cx="6.6" cy="17.6" r="1.8"/><circle cx="17.2" cy="17.6" r="1.8"/>'),
      secure: S('<path d="M12 2.8 20 6v6.1c0 4.3-3.1 7.8-8 9.1-4.9-1.3-8-4.8-8-9.1V6l8-3.2Z"/><path d="m8.8 12 2.3 2.3 4.1-4.6"/>'),
      cotton: S('<path d="M12 21v-5"/><path d="M12 16c0-5 2.9-8 7.8-9-1 6-3.9 9-7.8 9Z"/><path d="M12 16c0-4.3-2.5-6.9-6.8-7.8.8 5.2 3.3 7.8 6.8 7.8Z"/>'),
      gift: S('<rect x="3.2" y="9.4" width="17.6" height="11.4" rx="1.6"/><path d="M3.2 13.6h17.6M12 9.4v11.4"/><path d="M12 9.4S10.7 4.2 8.2 4.2a2.4 2.4 0 0 0 0 5.2H12Zm0 0s1.3-5.2 3.8-5.2a2.4 2.4 0 0 1 0 5.2H12Z"/>'),
      support: S('<path d="M20.4 15.1a2.6 2.6 0 0 1-2.6 2.6H9.1L4 21.4V6.5a2.6 2.6 0 0 1 2.6-2.6h11.2a2.6 2.6 0 0 1 2.6 2.6v8.6Z"/><path d="M9.8 9.4a2.3 2.3 0 1 1 3 2.2v1.3"/><circle cx="12.8" cy="15.2" r=".85" fill="currentColor" stroke="none"/>')
    },
    weave: '<svg viewBox="0 0 62 14" fill="none" aria-hidden="true"><path d="M2 7h58M9 2v10M20 2v10M31 2v10M42 2v10M53 2v10" stroke="#3A5A52" stroke-width="1.3" stroke-linecap="round" opacity=".7"/></svg>',
    weaveLight: '<svg viewBox="0 0 62 14" fill="none" style="width:62px" aria-hidden="true"><path d="M2 7h58M9 2v10M20 2v10M31 2v10M42 2v10M53 2v10" stroke="#C9BFAE" stroke-width="1.3" stroke-linecap="round"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.9h2.54V9.85c0-2.52 1.5-3.91 3.79-3.91 1.1 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.78-1.63 1.57v1.88h2.78l-.44 2.9h-2.34V22c4.78-.79 8.44-4.94 8.44-9.94Z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" stroke="none"/></svg>',
    pinterest: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12c0 4.08 2.45 7.59 5.96 9.13-.08-.78-.16-1.97.03-2.82.18-.78 1.15-4.94 1.15-4.94s-.29-.59-.29-1.46c0-1.37.79-2.39 1.78-2.39.84 0 1.25.63 1.25 1.39 0 .85-.54 2.11-.82 3.28-.23.98.49 1.78 1.46 1.78 1.75 0 3.1-1.85 3.1-4.51 0-2.36-1.7-4.01-4.12-4.01-2.81 0-4.46 2.1-4.46 4.28 0 .85.33 1.76.74 2.25.08.1.09.18.07.28-.08.32-.25 1-.28 1.14-.04.18-.15.22-.34.13-1.25-.58-2.03-2.4-2.03-3.87 0-3.15 2.29-6.04 6.6-6.04 3.46 0 6.16 2.47 6.16 5.77 0 3.45-2.17 6.22-5.19 6.22-1.01 0-1.97-.53-2.3-1.15l-.62 2.39c-.23.86-.83 1.94-1.24 2.6.94.29 1.92.44 2.96.44 5.52 0 10-4.48 10-10S17.52 2 12 2Z"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.53 3h3.17l-6.92 7.91L21.5 21h-5.9l-4.62-6.04L5.7 21H2.53l7.4-8.46L2.5 3h6.05l4.18 5.52L17.53 3Zm-1.11 16.12h1.76L7.16 4.78H5.28l11.14 14.34Z"/></svg>',
    linkedin: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.64h.05c.53-.95 1.83-1.95 3.76-1.95 4.02 0 4.76 2.5 4.76 5.75V21h-4v-5.66c0-1.35-.03-3.09-1.96-3.09-1.96 0-2.26 1.47-2.26 2.99V21h-4V9Z"/></svg>',
    youtube: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23 12s0-3.2-.4-4.7a2.5 2.5 0 0 0-1.8-1.8C19.2 5 12 5 12 5s-7.2 0-8.8.5A2.5 2.5 0 0 0 1.4 7.3C1 8.8 1 12 1 12s0 3.2.4 4.7a2.5 2.5 0 0 0 1.8 1.8C4.8 19 12 19 12 19s7.2 0 8.8-.5a2.5 2.5 0 0 0 1.8-1.8C23 15.2 23 12 23 12Zm-13 3V9l5 3-5 3Z"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 3c.3 2 1.6 3.6 3.5 3.9v2.6c-1.3.1-2.5-.3-3.6-1v6.1a5.6 5.6 0 1 1-5.6-5.6c.3 0 .6 0 .9.1v2.7a2.9 2.9 0 1 0 2 2.8V3H16Z"/></svg>',
    houzz: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 3l7 4V3l7 4v14h-5v-6h-4v6H5V3Z"/></svg>'
  };

  /* Which mark a homepage highlight gets: the one chosen in the admin, else one read off the
     wording, else the woven square. Keeps "Machine washable" from sharing a logo with "30-day returns". */
  var FEAT_GUESS = [
    [/return|refund|exchange/i, 'returns'],
    [/wash|laundr|tumble dry|care/i, 'wash'],
    [/india|made in|origin|hand ?woven|loom/i, 'origin'],
    [/ship|deliver|arrives/i, 'shipping'],
    [/secure|safe|checkout|payment|card/i, 'secure'],
    [/cotton|fiber|fibre|natural|organic|oeko/i, 'cotton'],
    [/gift|wrap/i, 'gift'],
    [/help|support|question|contact|email us/i, 'support']
  ];
  HW.featureIcon = function (f) {
    f = f || {};
    if (HW.SVG.feat[f.icon]) return HW.SVG.feat[f.icon];
    var text = String(f.title || '') + ' ' + String(f.body || '');
    for (var i = 0; i < FEAT_GUESS.length; i++) if (FEAT_GUESS[i][0].test(text)) return HW.SVG.feat[FEAT_GUESS[i][1]];
    return HW.SVG.logo;
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
    // The assistant stays out of the way until there is a catalog behind it, so it can never
    // answer "we don't sell that" to someone who arrived before the store finished loading.
    var assistBtn = document.getElementById('assistBtn');
    if (assistBtn) assistBtn.hidden = !(HW.assistant && HW.assistant.ready());
    var ann = HW.tokens(DB.announcement || '').trim();
    var annBar = document.getElementById('announce');
    var annText = document.getElementById('announceText');
    // While a sale is on, the bar carries it and counts down; afterwards the usual line comes back.
    var sale = m.saleNow ? m.saleNow() : null;
    annBar.classList.toggle('sale', !!sale);
    annBar.classList.toggle('sale-final', !!sale && sale.endsAt - Date.now() < 24 * 3600 * 1000);
    if (sale) {
      var last = sale.endsAt - Date.now() < 24 * 3600 * 1000;
      annText.innerHTML = '<span class="ann-head">' + (last ? 'Last day! ' : '') + u.esc(sale.name) + '</span>' +
        '<span class="ann-clock">Ends in <b data-sale-ends="' + sale.endsAt + '" data-sale-style="bar"></b></span>';
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

    /* "Towels" above a lone "Towels", or "Rugs" above a lone "Bath Rugs": a heading and a
       single child that lead to the same place. A sub-list earns its space only when it
       offers a real choice, so one that does not is dropped and the category stands alone. */
    function menuSubs(c) {
      var name = String(c.name || '').trim().toLowerCase();
      var subs = m.visibleSubcategories(c).filter(function (s2) {
        return String(s2.name || '').trim().toLowerCase() !== name;
      });
      return subs.length > 1 ? subs : [];
    }

    var cats = m.visibleCategories();
    document.getElementById('topnav').innerHTML = cats.map(function (c) {
      var subs = menuSubs(c);
      var fly = subs.length
        ? '<div class="flyout">' + subs.map(function (s) {
            return '<a href="' + HW.link('/category/' + c.slug + '?sub=' + encodeURIComponent(s.slug)) + '">' + esc(s.name) + '</a>';
          }).join('') + '<a class="shopall" href="' + HW.link('/category/' + c.slug) + '">Shop all ' + esc(c.name) + '</a></div>'
        : '';
      return '<div class="navitem"><a href="' + HW.link('/category/' + c.slug) + '">' + esc(c.name) + '</a>' + fly + '</div>';
    }).join('');

    /* Eleven rows that all looked alike, with the account between Bath Accessories and
       Shipping & Returns: whatever the visitor opened the menu for, they had to read the
       whole list to find it. Shopping, help and the account are three different errands,
       so they are three different blocks — and the account, the one people come looking
       for, is the first thing in it rather than the fifth. */
    var acct = HW.account && HW.account.get();
    var PERSON = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20.5c1.4-3.9 4.4-6 8-6s6.6 2.1 8 6" stroke-linecap="round"/></svg>';
    function pageLinks(group) {
      return visiblePages(group).map(function (p) {
        return '<a href="' + HW.link('/page/' + p.slug) + '">' + esc(p.title) + '</a>';
      }).join('');
    }
    function block(label, links) { return links ? '<div class="mgroup">' + esc(label) + '</div>' + links : ''; }

    document.getElementById('mnavLinks').innerHTML =
      '<a class="macct" href="' + HW.link('/account') + '">' + PERSON +
      (acct ? '<span><b>Your account</b></span>' : '<span><b>Sign in</b> or create an account</span>') + '</a>' +
      '<a class="macct" href="' + HW.link('/wishlist') + '">' + '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.6 8.4 3.4 5 6.8 5c2 0 3.4 1.1 4.2 2.4C11.8 6.1 13.2 5 15.2 5c3.4 0 5.2 3.4 4.1 6.3C19.5 15.9 12 20.5 12 20.5z" stroke-linejoin="round"/></svg>' + '<span>Wishlist</span></a>' +
      block('Shop', cats.map(function (c) {
        var subs = menuSubs(c);
        return '<a href="' + HW.link('/category/' + c.slug) + '">' + esc(c.name) + '</a>' +
          (subs.length ? '<div class="msub">' + subs.map(function (s) {
            return '<a href="' + HW.link('/category/' + c.slug + '?sub=' + encodeURIComponent(s.slug)) + '">' + esc(s.name) + '</a>';
          }).join('') + '</div>' : '');
      }).join('')) +
      block('Help', pageLinks('service')) +
      block(DB.brand.name || 'Home Weavers', pageLinks('company'));

    var shopLinks = cats.map(function (c) { return '<a href="' + HW.link('/category/' + c.slug) + '">' + esc(c.name) + '</a>'; }).join('');
    function pageCol(key, label, first) {
      var links = (first || '') + visiblePages(key).map(function (p) { return '<a href="' + HW.link('/page/' + p.slug) + '">' + esc(p.title) + '</a>'; }).join('');
      return links ? '<div class="fcol"><h2 class="h5">' + esc(label) + '</h2>' + links + '</div>' : '';
    }
    document.getElementById('footLinks').innerHTML =
      (shopLinks ? '<div class="fcol"><h2 class="h5">Shop</h2>' + shopLinks + '</div>' : '') +
      pageCol('service', 'Customer service', '<a href="' + HW.link('/account') + '">Your account</a>' +
        ((DB.faq || []).some(function (f) { return f.show !== false; }) ? '<a href="' + HW.link('/page/faq') + '">FAQ</a>' : '')) +
      pageCol('company', 'Our company');

    var soc = DB.social || {};
    var socials = [['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['pinterest', 'Pinterest'], ['facebook', 'Facebook'], ['x', 'X'], ['linkedin', 'LinkedIn'], ['youtube', 'YouTube'], ['houzz', 'Houzz']]
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
