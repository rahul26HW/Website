/* Home Weavers — content pages, contact form, order tracking, 404. */
(function (HW) {
  'use strict';

  var u = HW.u, esc = u.esc, m = HW.m;

  /* Minimal, safe formatter for admin-written page text.
     ## heading, # heading, - bullet, 1. numbered, **bold**, *italic*, [text](link) */
  HW.richText = function (md, underH2) {
    var inline = function (s) {
      return esc(s)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?![*\w])/g, '$1<em>$2</em>')
        .replace(/\[(.+?)\]\(((?:https?:\/\/|mailto:|\/|#\/)[^\s)]*)\)/g, function (all, text, href) {
          var ext = /^https?:/i.test(href);
          var h = ext || /^mailto:/i.test(href) ? href : HW.link(href);
          return '<a class="link-u" href="' + h + '"' + (ext ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + text + '</a>';
        });
    };
    var html = '', list = null, listTag = 'ul', para = [], table = null;
    function flushPara() { if (para.length) { html += '<p>' + para.map(inline).join('<br>') + '</p>'; para = []; } }
    function flushList() { if (list) { html += '<' + listTag + '>' + list.map(function (li) { return '<li>' + inline(li) + '</li>'; }).join('') + '</' + listTag + '>'; list = null; } }
    /* | a | b | rows: first row is the header; a |---| row is ignored. */
    function flushTable() {
      if (!table) return;
      var rows = table.filter(function (r) { return !/^\|?\s*:?-{2,}/.test(r); }).map(function (r) {
        return r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(function (c) { return c.trim(); });
      });
      html += '<div class="tablescroll"><table class="cmstable"><thead><tr>' + rows[0].map(function (c) { return '<th scope="col">' + inline(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        rows.slice(1).map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + inline(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
      table = null;
    }
    // "##" is an h3 under a "#" heading or when the caller already has an h2 (size guide); otherwise an h2 with the same look, so headings never skip a level after the page h1.
    var sub = underH2 || /^#\s+/m.test(String(md || '')) ? ['<h3>', '</h3>'] : ['<h2 class="cms-sub">', '</h2>'];
    String(md || '').split('\n').forEach(function (raw) {
      var line = raw.replace(/\s+$/, '');
      if (/^\s*\|/.test(line)) { flushPara(); flushList(); table = table || []; table.push(line); return; }
      flushTable();
      if (/^\s*$/.test(line)) { flushPara(); flushList(); return; }
      if (/^##\s+/.test(line)) { flushPara(); flushList(); html += sub[0] + inline(line.replace(/^##\s+/, '')) + sub[1]; return; }
      if (/^#\s+/.test(line)) { flushPara(); flushList(); html += '<h2>' + inline(line.replace(/^#\s+/, '')) + '</h2>'; return; }
      var item = line.match(/^\s*(-|\d+\.)\s+(.*)$/);
      if (item) {
        var tag = item[1] === '-' ? 'ul' : 'ol';
        flushPara();
        if (list && tag !== listTag) flushList();
        listTag = tag; list = list || []; list.push(item[2]); return;
      }
      flushList(); para.push(line);
    });
    flushTable(); flushPara(); flushList();
    return html;
  };

  /* ---------- contact ---------- */
  function contactBlock() {
    var c = HW.DB.contact || {};
    var rows = [];
    if (u.isEmail(c.email)) rows.push('<li><b>Email</b><a class="link-u" style="font-size:15px;letter-spacing:0;text-transform:none;font-weight:500" href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a></li>');
    if ((c.phone || '').trim()) rows.push('<li><b>Phone</b><a href="tel:' + esc(c.phone.replace(/[^\d+]/g, '')) + '">' + esc(c.phone) + '</a></li>');
    if ((c.hours || '').trim()) rows.push('<li><b>Hours</b>' + esc(c.hours) + '</li>');
    if ((c.address || '').trim()) rows.push('<li><b>Address</b>' + esc(c.address).replace(/\n/g, '<br>') + '</li>');
    return '<div class="contact-grid">' +
      '<div>' + (rows.length ? '<ul class="contact-list">' + rows.join('') + '</ul>' : '') + '</div>' +
      '<form class="form panelbox" data-form="contact" novalidate aria-labelledby="contactHead">' +
      '<h2 id="contactHead" style="font-size:24px;margin:0 0 4px;color:var(--ink)">Send us a message</h2>' +
      '<div class="row2"><div class="fld"><label for="ct_name">Name</label><input id="ct_name" name="name" autocomplete="name" maxlength="120" required></div>' +
      '<div class="fld"><label for="ct_email">Email</label><input id="ct_email" name="email" type="email" autocomplete="email" maxlength="254" required></div></div>' +
      '<div class="row2"><div class="fld"><label for="ct_phone">Phone <span class="opt">(optional)</span></label><input id="ct_phone" name="phone" type="tel" autocomplete="tel" maxlength="40"></div>' +
      '<div class="fld"><label for="ct_subject">Subject <span class="opt">(optional)</span></label><input id="ct_subject" name="subject" maxlength="200"></div></div>' +
      '<div class="fld"><label for="ct_message">Message</label><textarea id="ct_message" name="message" maxlength="5000" required></textarea></div>' +
      '<div class="sr-only" aria-hidden="true"><label for="ct_website">Leave this empty</label><input id="ct_website" name="website" tabindex="-1" autocomplete="off"></div>' +
      '<p class="form-msg" role="status" hidden></p>' +
      '<button class="btn loom" type="submit">Send message</button></form></div>';
  }

  HW.contact = {
    submit: async function (form) {
      var msg = form.querySelector('.form-msg'), btn = form.querySelector('button[type=submit]');
      var v = function (n) { return form.elements[n].value.trim(); };
      u.qsa('[aria-invalid]', form).forEach(function (el) { el.removeAttribute('aria-invalid'); });
      var problems = [];
      if (!v('name')) problems.push(['name', 'Enter your name.']);
      if (!u.isEmail(v('email'))) problems.push(['email', 'Enter a valid email address.']);
      if (!v('message')) problems.push(['message', 'Write a message.']);
      if (problems.length) {
        problems.forEach(function (p) { form.elements[p[0]].setAttribute('aria-invalid', 'true'); });
        msg.hidden = false; msg.className = 'form-msg err'; msg.textContent = problems.map(function (p) { return p[1]; }).join(' ');
        form.elements[problems[0][0]].focus();
        return;
      }
      if (v('website')) { msg.hidden = false; msg.className = 'form-msg ok'; msg.textContent = 'Thanks — your message has been sent.'; form.reset(); return; }
      if (v('phone') && !/^[+()\d][\d\s().+-]{6,}$/.test(v('phone'))) {
        form.elements.phone.setAttribute('aria-invalid', 'true');
        msg.hidden = false; msg.className = 'form-msg err'; msg.textContent = 'Enter a phone number with digits only (or leave it empty).';
        form.elements.phone.focus(); return;
      }
      btn.disabled = true;
      try {
        await HW.api.server('/public/contact', { name: v('name'), email: v('email'), phone: v('phone'), subject: v('subject'), message: v('message'), website: v('website') });
        form.reset();
        msg.hidden = false; msg.className = 'form-msg ok';
        msg.textContent = 'Thanks — your message has been sent. We usually reply within one business day.';
      } catch (e) {
        msg.hidden = false; msg.className = 'form-msg err'; msg.textContent = e.message;
      } finally { btn.disabled = false; }
    }
  };

  /* ---------- order tracking ---------- */
  var STEPS = [['new', 'Received'], ['packed', 'Preparing'], ['shipped', 'Shipped'], ['delivered', 'Delivered']];

  function trackBlock() {
    var last = u.session.get('hw:lastOrder', null) || {};
    // Links in order emails carry ?order=HW-… (never the email address) to fill in the number.
    var fromLink = (function () { try { return new URLSearchParams(location.search).get('order') || ''; } catch (e) { return ''; } })();
    if (/^HW-?\d{1,12}$/i.test(fromLink)) last = { order_number: fromLink.toUpperCase(), email: last.order_number === fromLink.toUpperCase() ? last.email : '' };
    // The order email's link also carries a signed cancel token (?c=…): keep it for this tab, then clear it from the address bar.
    try {
      var qs = new URLSearchParams(location.search), c = qs.get('c');
      if (c && /^[A-Za-z0-9_-]{16,64}$/.test(c) && /^HW-?\d{1,12}$/i.test(fromLink)) {
        var toks = u.session.get('hw:cancelTokens', {}) || {}; toks[fromLink.toUpperCase()] = c; u.session.set('hw:cancelTokens', toks);
        qs.delete('c'); history.replaceState(null, '', location.pathname + (qs.toString() ? '?' + qs.toString() : ''));
      }
    } catch (e) {}
    return '<form class="form panelbox" data-form="track" novalidate aria-labelledby="trackHead" style="margin-top:24px">' +
      '<h2 id="trackHead" style="font-size:24px;margin:0 0 4px;color:var(--ink)">Find your order</h2>' +
      '<div class="row2"><div class="fld"><label for="tr_no">Order number</label><input id="tr_no" name="number" placeholder="HW-100001" value="' + esc(last.order_number || '') + '" autocomplete="off" maxlength="20" required></div>' +
      '<div class="fld"><label for="tr_email">Email used at checkout</label><input id="tr_email" name="email" type="email" value="' + esc(last.email || '') + '" autocomplete="email" maxlength="254" required></div></div>' +
      '<p class="form-msg" role="status" hidden></p>' +
      '<button class="btn loom" type="submit">Track order</button>' +
      '<p class="muted" style="font-size:13.5px;margin:14px 0 0">Have an account? <a class="link-u" style="font-size:inherit;letter-spacing:0;text-transform:none" href="' + HW.link('/account') + '">Sign in</a> to see all your orders.</p>' +
      '<div id="trackResult" aria-live="polite"></div></form>';
  }

  /* Carrier tracking page, when we know the carrier. */
  HW.trackingUrl = function (carrier, number) {
    if (!number) return '';
    var n = encodeURIComponent(number), c = String(carrier || '').toLowerCase();
    if (/usps|stamps/.test(c)) return 'https://tools.usps.com/go/TrackConfirmAction?tLabels=' + n;
    if (/ups/.test(c)) return 'https://www.ups.com/track?tracknum=' + n;
    if (/fedex/.test(c)) return 'https://www.fedex.com/fedextrack/?trknbr=' + n;
    if (/dhl/.test(c)) return 'https://www.dhl.com/us-en/home/tracking.html?tracking-id=' + n;
    return '';
  };

  /* What the customer can do about cancelling, based on the order's stage. */
  function cancelBlock(o, number, email, key) {
    key = key || '';
    var done = /^(shipped|delivered|cancelled|refunded)$/.test(o.status);
    if (done) return '';
    var left = HW.cancelLeft({ status: o.status, paid_at: o.paid_at, created_at: o.created_at });
    if (o.status === 'new' && /^(paid|authorized|cod)$/.test(o.payment_status) && left > 0) {
      if (HW.cancelProof && !HW.cancelProof(number, email).ok) {
        return '<div class="notice" role="note" style="text-align:left;margin:14px 0 0"><b>You can still cancel</b> for the next ' + Math.ceil(left / 60000) + ' minutes. ' +
          'For your security, use the “View or cancel your order” link in your order email, or <a class="link-u" style="font-size:inherit;letter-spacing:0;text-transform:none" href="' + HW.link('/account/login') + '">sign in</a> with this email.</div>';
      }
      return '<div class="notice" role="note" style="text-align:left;margin:14px 0 0"><b>You can still cancel.</b> Cancel yourself within the next ' +
        '<span id="cancelLeft' + key + '">' + Math.ceil(left / 60000) + '</span> minutes' + (o.payment_status === 'authorized' ? ' — you won’t be charged.' : o.payment_status === 'cod' ? ' — nothing to pay.' : ' for a full refund.') +
        '<p class="form-msg err" id="cancelMsg' + key + '" role="alert" hidden></p>' +
        '<div class="btnrow" style="margin-top:10px"><button class="btn ghost sm" type="button" data-act="cancel-order" data-n="' + esc(number) + '" data-e="' + esc(email) + '">Cancel this order</button></div></div>';
    }
    if (o.cancel_requested_at) {
      return '<p class="form-msg ok" style="margin:14px 0 0">You’ve asked us to cancel this order. We’ll email you once we’ve checked it.</p>';
    }
    // Not a <form>: this sits inside the "find your order" form, and forms can't be nested.
    return '<div class="form cancel-ask" style="margin:14px 0 0">' +
      '<div class="cancel-fields"><p class="muted" style="font-size:13.5px;margin:0 0 8px">Need to cancel? The free cancellation time has passed, but if it hasn’t shipped yet we can usually still stop it.</p>' +
      '<div class="fld"><label for="cx_reason' + key + '">Reason <span class="opt">(optional)</span></label><input id="cx_reason' + key + '" maxlength="200"></div>' +
      '<button class="btn ghost sm" type="button" data-act="cancel-ask" data-n="' + esc(number) + '" data-e="' + esc(email) + '">Ask us to cancel</button></div>' +
      '<p class="form-msg" role="status" hidden></p></div>';
  }

  HW.cancelBlock = cancelBlock;

  /* Received → Preparing → Shipped → Delivered progress, or nothing for a cancelled/refunded order. */
  HW.orderSteps = function (o) {
    if (o.status === 'refunded' || o.status === 'cancelled') return '';
    var reached = ({ new: 0, accepted: 1, packed: 1, shipped: 2, delivered: 3 })[o.status];
    if (reached == null) reached = 0;
    return '<ol class="track-steps">' + STEPS.map(function (s, i) {
      return '<li class="' + (i <= reached ? 'done' : '') + (i < reached ? ' next-done' : '') + '"' + (i === reached ? ' aria-current="step"' : '') + '>' + s[1] + '</li>';
    }).join('') + '</ol>';
  };

  HW.orderCancel = {
    /* Free cancellation inside the window: releases the card hold (or refunds) and cancels straight away. */
    run: async function (btn) {
      var number = btn.dataset.n, email = btn.dataset.e;
      var msg = btn.closest('.notice') && btn.closest('.notice').querySelector('.form-msg');
      if (!confirm('Cancel order ' + number + '? You won’t be charged (or you’re refunded in full).')) return;
      btn.disabled = true; var label = btn.textContent; btn.textContent = 'Cancelling…';
      try {
        var r = await HW.cancelOrder(number, email);
        var last = u.session.get('hw:lastOrder', null);
        if (last && last.order_number === number) { last.cancelled = true; last.paid = false; u.session.set('hw:lastOrder', last); }
        if (HW.account) HW.account.invalidate();
        u.toast(r.voided ? 'Order cancelled — you haven’t been charged' : r.refunded ? 'Order cancelled — your refund is on its way' : 'Order cancelled');
        HW.router.run({ scroll: false });
      } catch (e) {
        btn.disabled = false; btn.textContent = label;
        if (msg) { msg.hidden = false; msg.className = 'form-msg err'; msg.textContent = e.message; }
        else u.toast(e.message);
      }
    },
    /* After the window: ask us to cancel. */
    request: async function (btn) {
      var box = btn.closest('.cancel-ask');
      var msg = box.querySelector('.form-msg');
      var number = btn.dataset.n, email = btn.dataset.e;
      var reason = (box.querySelector('input') || {}).value || '';
      btn.disabled = true;
      try {
        var r = await HW.api.server('/public/cancel-request', { number: number, email: email, reason: reason.trim() });
        msg.hidden = false;
        if (r && r.ok) {
          if (HW.account) HW.account.invalidate();
          msg.className = 'form-msg ok';
          msg.textContent = 'Thanks — we’ve asked our team to cancel this order. We’ll email you. If it has already shipped, you can return it instead.';
          box.querySelector('.cancel-fields').hidden = true;
        } else {
          msg.className = 'form-msg err';
          msg.textContent = r && r.status === 'shipped' ? 'This order has already shipped, so it can’t be cancelled. You can return it — see our Refund Policy.'
            : 'This order can’t be cancelled any more. Please contact us.';
        }
      } catch (e) {
        msg.hidden = false; msg.className = 'form-msg err'; msg.textContent = e.message;
      } finally { btn.disabled = false; }
    }
  };

  HW.track = {
    submit: async function (form) {
      var msg = form.querySelector('.form-msg'), btn = form.querySelector('button[type=submit]'), out = document.getElementById('trackResult');
      var no = form.elements.number.value.trim(), email = form.elements.email.value.trim();
      out.innerHTML = '';
      if (!/^HW-?\d+$/i.test(no) || !u.isEmail(email)) {
        msg.hidden = false; msg.className = 'form-msg err';
        msg.textContent = 'Enter your order number (like HW-100001) and the email you used at checkout.';
        return;
      }
      no = no.toUpperCase().replace(/^HW-?/, 'HW-');
      btn.disabled = true; msg.hidden = true;
      try {
        var o = (await HW.api.server('/public/track', { number: no, email: email })).order;
        if (!o) {
          msg.hidden = false; msg.className = 'form-msg err';
          msg.textContent = 'We couldn’t find an order with that number and email. Check both and try again, or contact us.';
          return;
        }
        var ended = o.status === 'refunded' || o.status === 'cancelled';
        var link = HW.trackingUrl(o.carrier, o.tracking_number);
        out.innerHTML = '<div style="border-top:1px solid var(--line);margin-top:18px;padding-top:18px">' +
          '<div class="sumrow"><span><b>' + esc(o.order_number) + '</b></span><span class="muted">Placed ' + esc(u.fmtDate(o.created_at)) + '</span></div>' +
          (ended
            ? '<p class="form-msg ok" style="margin:12px 0">' + (o.status === 'refunded' ? 'This order has been refunded.' : o.payment_status === 'unpaid' ? 'This order was cancelled because payment wasn’t completed.' : 'This order was cancelled.' + (o.payment_status === 'voided' ? ' You weren’t charged.' : o.payment_status === 'refunded' ? ' Your payment was refunded.' : '')) + '</p>'
            : HW.orderSteps(o)) +
          (o.tracking_number ? '<p style="margin:12px 0 6px"><b>Tracking:</b> ' + esc(o.carrier ? o.carrier + ' ' : '') +
            (link ? '<a class="link-u" style="font-size:inherit;letter-spacing:0;text-transform:none" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">' + esc(o.tracking_number) + '</a>' : esc(o.tracking_number)) + '</p>' : '') +
          (o.payment_status === 'unpaid' && o.status === 'new' ? '<p class="muted" style="font-size:13.5px">' + 'Payment hasn’t been received for this order yet.' + '</p>' : '') +
          // Cash on delivery only works if someone is there with the money.
          (o.payment_method === 'cod' && !ended && o.status !== 'delivered'
            ? '<div class="notice" role="note" style="text-align:left;margin:12px 0 0"><b>Paying in cash.</b> Please have ' + u.money(o.total) +
              ' ready for the courier — they may not carry change — and make sure someone over 18 is at the address to take the parcel.</div>' : '') +
          cancelBlock(o, no, email) +
          '<ul class="bullets" style="margin-top:10px">' + (o.items || []).map(function (i) {
            return '<li>' + esc(HW.seo.clip(i.name, 80)) + (i.variant ? ' (' + esc(i.variant) + ')' : '') + ' × ' + i.qty + '</li>';
          }).join('') + '</ul>' +
          '<div class="sumrow total" style="margin:10px 0 0"><span>Total</span><span>' + u.money(o.total) + '</span></div></div>';
        HW.countdown('cancelLeft', o.paid_at);
      } catch (e) {
        msg.hidden = false; msg.className = 'form-msg err'; msg.textContent = e.message;
      } finally { btn.disabled = false; }
    }
  };

  HW.views = HW.views || {};

  HW.views.page = function (params) {
    var pg = (HW.DB.pages || []).find(function (p) { return p.slug === params.slug; });
    if (!pg) return HW.views.notfound();
    var body = m.pageText(pg.body);
    var extra = pg.slug === 'contact-us' ? contactBlock() : pg.slug === 'track-your-order' ? trackBlock() : '';
    return {
      html: '<div class="wrap">' +
        '<nav class="crumb" aria-label="Breadcrumb"><a href="' + HW.link('/') + '">Home</a> &nbsp;/&nbsp; <span aria-current="page">' + esc(pg.title) + '</span></nav>' +
        '<article class="cms"><h1>' + esc(pg.title) + '</h1><div class="cms-body">' + HW.richText(HW.tokens(body)) + extra + '</div></article>' +
        '<div style="height:60px"></div></div>',
      seo: { title: pg.seoTitle || pg.title, description: pg.seoDescription || HW.tokens(body).replace(/[#*\[\]()|-]/g, ' '), path: '/page/' + pg.slug,
        jsonld: HW.ld && HW.ld.breadcrumb([['Home', '/'], [pg.title, '/page/' + pg.slug]]) }
    };
  };

  HW.views.notfound = function () {
    var cats = m.visibleCategories();
    return {
      status: 404,
      html: '<div class="wrap"><div class="confirm" style="padding:70px 0 100px">' +
        '<div class="weave-rule">' + HW.SVG.weave + '</div><div class="eyebrow">Error 404</div>' +
        '<h1>We couldn’t find that page</h1>' +
        '<p class="muted">The link may be old, or the item may no longer be available.</p>' +
        '<p><a class="btn" href="' + HW.link('/') + '">Back home</a></p>' +
        (cats.length ? '<div class="subnav" style="justify-content:center;margin-top:22px">' + cats.map(function (c) {
          return '<a class="chip" href="' + HW.link('/category/' + c.slug) + '">' + esc(c.name) + '</a>';
        }).join('') + '</div>' : '') + '</div></div>',
      seo: { title: 'Page not found', noindex: true }
    };
  };
})(window.HW = window.HW || {});
