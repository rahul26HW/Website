/* Home Weavers — admin: writing and sending the newsletter.

   A marketing email in the United States has to carry a real postal address and a
   way out that works without signing in. Both are added by the server to every
   message, so they cannot be forgotten here. */
(function (HW) {
  'use strict';

  var A = HW.A, u = HW.u, esc = u.esc;
  var DRAFT = 'hw:newsletterDraft';
  var st = Object.assign(
    { count: null, subject: '', title: '', body: '', test: '', sending: false, last: null,
      banner: '', bannerLink: '', picks: [], ctaLabel: '', ctaLink: '',
      offer: '', offerCode: '', picksTitle: '' },
    u.store.get(DRAFT, {}) || {});
  st.count = null; st.sending = false; st.last = null;
  if (!Array.isArray(st.picks)) st.picks = [];

  function keep() {
    u.store.set(DRAFT, {
      subject: st.subject, title: st.title, body: st.body, test: st.test,
      banner: st.banner, bannerLink: st.bannerLink, picks: st.picks,
      ctaLabel: st.ctaLabel, ctaLink: st.ctaLink,
      offer: st.offer, offerCode: st.offerCode, picksTitle: st.picksTitle,
    });
  }

  async function loadCount() {
    var r = await A.sb.from('subscribers').select('id', { count: 'exact', head: true });
    st.count = r.error ? 0 : (r.count || 0);
  }

  var JPEGS = 'hw:newsletterJpegs';

  /* A JPEG copy of an image, made once and remembered, so sending the same newsletter
     twice does not fill the store with duplicates. Anything already safe is left alone. */
  async function emailSafe(url, ratio) {
    var src = String(url || '').trim();
    if (!src) return '';
    var key = src + (ratio ? '|' + ratio : '');
    var cache = u.store.get(JPEGS, {}) || {};
    if (cache[key]) return cache[key];
    /* Already a shape and format every client can draw: leave it alone. */
    if (!ratio && !/\.webp(\?|$)/i.test(src)) return src;

    var res = await fetch(src);
    if (!res.ok) throw new Error('Could not read one of the images.');
    var bmp = await createImageBitmap(await res.blob());
    var max = 1024;
    var c = document.createElement('canvas');
    var sx = 0, sy = 0, sw = bmp.width, sh = bmp.height;
    if (ratio) {
      /* A product shot is roughly square, and at full width that is a banner so tall it
         fills the screen before a word is read. Cropped from the middle to a band. */
      if (sw / sh > ratio) { sw = Math.round(sh * ratio); sx = Math.round((bmp.width - sw) / 2); }
      else { sh = Math.round(sw / ratio); sy = Math.round((bmp.height - sh) / 2); }
      c.width = Math.min(max, sw);
      c.height = Math.round(c.width / ratio);
    } else {
      var scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
      c.width = Math.round(bmp.width * scale);
      c.height = Math.round(bmp.height * scale);
    }
    var cx = c.getContext('2d');
    /* JPEG has no transparency, so anything see-through would come out black. */
    cx.fillStyle = '#ffffff';
    cx.fillRect(0, 0, c.width, c.height);
    cx.drawImage(bmp, sx, sy, sw, sh, 0, 0, c.width, c.height);
    var jpg = await new Promise(function (r) { c.toBlob(r, 'image/jpeg', 0.82); });
    if (!jpg) throw new Error('Could not convert one of the images.');

    var name = (src.split('?')[0].split('/').pop() || 'image').replace(/\.webp$/i, '');
    var path = 'newsletter/' + new Date().getFullYear() + '/' +
      name.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 60) + '-' + Math.random().toString(36).slice(2, 8) + '.jpg';
    var up = await A.sb.storage.from('media').upload(path, jpg, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
    if (up.error) throw new Error(up.error.message || 'Could not store one of the images.');
    var out = A.sb.storage.from('media').getPublicUrl(path).data.publicUrl;
    cache[key] = out;
    u.store.set(JPEGS, cache);
    return out;
  }

  function site() {
    return String((A.draft.settings || {}).siteUrl || 'https://www.homeweavers.com/').replace(/\/?$/, '/');
  }
  function abs(href) {
    var h = String(href || '').trim();
    if (!h) return site();
    return /^https?:/i.test(h) ? h : site() + h.replace(/^\//, '');
  }

  /* An email client is not a browser: no flexbox, no grid, and half of them strip a
     stylesheet entirely. Tables and inline styles are what survives. */
  async function bannerHtml() {
    if (!st.banner) return '';
    var href = abs(st.bannerLink);
    var src = await emailSafe(st.banner, 2);
    return '<a href="' + esc(href) + '" style="display:block;margin:0 0 22px">' +
      '<img src="' + esc(src) + '" alt="' + esc(st.title || st.subject || 'Home Weavers') + '" width="584" ' +
      'style="display:block;width:100%;max-width:584px;height:auto;border:0;border-radius:4px"></a>';
  }

  async function productCards() {
    if (!st.picks.length) return '';
    var all = A.draft.products || [];
    var rows = [];
    for (var i = 0; i < st.picks.length; i += 2) {
      var pair = await Promise.all(st.picks.slice(i, i + 2).map(async function (id) {
        var p = all.filter(function (x) { return x.id === id; })[0];
        if (!p) return '<td class="nlcol" style="width:50%"></td>';
        var img = await emailSafe(HW.asset(HW.m.thumb(HW.m.primaryImage(p)) || HW.m.primaryImage(p)), 1);
        var r = HW.m.priceRange(p);
        /* The same shape the shop uses: what it costs now in bold, what it cost struck
           through beside it, and a word to say why. A price that has not moved gets
           none of that — a sale tag on everything says nothing. */
        var now = r.min === r.max ? u.money(r.min) : 'from ' + u.money(r.min);
        var cut = r.wasMin != null && r.wasMin > r.min;
        var price = '<span style="font-weight:bold;color:#2A2622">' + esc(now) + '</span>' +
          (cut ? ' <s style="color:#8A8178">' + esc(u.money(r.wasMin)) + '</s>' +
            '<span style="display:inline-block;margin-left:7px;background:#B5754F;color:#ffffff;' +
            'font-size:10px;letter-spacing:.1em;padding:2px 7px;border-radius:2px;vertical-align:1px">SALE</span>' : '');
        var href = site() + 'product/' + encodeURIComponent(p.slug);
        /* The picture is a link and so is the name: people click whichever they reach for. */
        return '<td class="nlcol" style="width:50%;padding:0 6px;vertical-align:top">' +
          '<a href="' + esc(href) + '" style="text-decoration:none;color:#2A2622">' +
          (img ? '<img src="' + esc(img) + '" alt="' + esc(p.name) + '" width="288" style="display:block;width:100%;height:auto;border:0;border-radius:4px;background:#F4F1EB">' : '') +
          '<div style="font-size:14px;line-height:1.4;margin:8px 0 2px">' + esc(p.name) + '</div>' +
          '<div style="font-size:14px;color:#6C6359">' + price + '</div></a></td>';
      }));
      if (pair.length === 1) pair.push('<td class="nlcol" style="width:50%"></td>');
      rows.push('<tr>' + pair.join('') + '</tr>');
    }
    var head = st.picksTitle.trim()
      ? '<h2 style="font-family:Georgia,serif;font-weight:400;font-size:19px;margin:26px 0 2px">' + esc(st.picksTitle) + '</h2>' +
        '<div style="width:30px;height:2px;background:#C9922F;margin:0 0 6px"></div>'
      : '';
    return head + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ' +
      'style="margin:8px -6px 6px;border-collapse:separate;border-spacing:0 14px">' + rows.join('') + '</table>';
  }

  function offerHtml() {
    if (!st.offer.trim()) return '';
    var code = st.offerCode.trim();
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ' +
      'style="margin:0 0 22px;background:#F4F1EB;border-radius:4px"><tr>' +
      '<td align="center" style="padding:18px 20px">' +
      '<div style="font-family:Georgia,serif;font-size:19px;line-height:1.35;color:#2C463F">' + esc(st.offer) + '</div>' +
      (code ? '<div style="margin:11px 0 0"><span style="display:inline-block;border:1px dashed #B5754F;color:#B5754F;' +
        'padding:7px 16px;border-radius:3px;font-size:14px;letter-spacing:.16em;font-weight:bold">' + esc(code) + '</span></div>' : '') +
      '</td></tr></table>';
  }

  /* A real button, drawn as a table cell so Outlook renders it too. */
  function ctaHtml() {
    if (!st.ctaLabel.trim()) return '';
    return '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 4px"><tr>' +
      '<td style="background:#2C463F;border-radius:4px">' +
      '<a href="' + esc(abs(st.ctaLink)) + '" style="display:inline-block;padding:13px 26px;color:#ffffff;' +
      'text-decoration:none;font-size:14px;letter-spacing:.06em;text-transform:uppercase">' + esc(st.ctaLabel) + '</a>' +
      '</td></tr></table>';
  }

  /* Written as plain paragraphs. Anything fancier belongs in a design tool, and a
     newsletter that is mostly words lands in more inboxes than one that is mostly
     pictures. */
  async function bodyHtml(text) {
    return (await bannerHtml()) + offerHtml() + toHtml(text) + (await productCards()) + ctaHtml();
  }

  function toHtml(text) {
    return String(text || '').split(/\n{2,}/).map(function (para) {
      return '<p style="font-size:15.5px;line-height:1.75;margin:0 0 15px;color:#3A3530">' +
        esc(para.trim()).replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }

  A.tabs.newsletter = {
    render: function () {
      var contact = A.draft.contact || {};
      var address = String(contact.address || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean).join(', ');
      var n = st.count;

      return '<h1>Newsletter</h1>' +
        '<p class="sub">An email to everyone who asked for news and offers. Every message carries your postal address and an unsubscribe link — both are required by law, and the server adds them, so they can’t be left off.</p>' +

        (st.last ? '<div class="adwarn"><b>' + (st.last.test ? 'Test sent.' : 'Sent to ' + st.last.sent + (st.last.sent === 1 ? ' subscriber.' : ' subscribers.')) + '</b>' +
          (st.last.failed ? ' ' + st.last.failed + ' didn’t go through — check the Edge Function logs.' : '') + '</div>' : '') +

        '<section class="panel">' +
        '<h2 class="ph3">Who it goes to</h2>' +
        '<p style="margin:0 0 4px">' + (n == null ? 'Counting…' : '<b>' + n + '</b> ' + (n === 1 ? 'person has' : 'people have') + ' signed up.') + '</p>' +
        '<p class="hint" style="margin:0">Anyone who unsubscribes is removed from this list straight away.</p>' +
        '</section>' +

        '<section class="panel"><h2 class="ph3">Write it</h2>' +
        '<div class="fld"><label for="nlSubject">Subject line</label>' +
        '<input id="nlSubject" type="text" maxlength="200" placeholder="What they see in the inbox" value="' + esc(st.subject) + '">' +
        '<p class="hint">Keep it short and say what is actually inside.</p></div>' +
        '<div class="fld"><label for="nlTitle">Heading</label>' +
        '<input id="nlTitle" type="text" maxlength="200" placeholder="Shown at the top of the email — defaults to the subject" value="' + esc(st.title) + '">' +
        '</div>' +
        '<div class="fld"><label for="nlBody">Message</label>' +
        '<textarea id="nlBody" rows="12" placeholder="Write it as you would a letter. Leave a blank line between paragraphs.">' + esc(st.body) + '</textarea>' +
        '<p class="hint">Plain paragraphs. A blank line starts a new one.</p></div>' +
        '</section>' +

        '<section class="panel"><h2 class="ph3">Banner across the top</h2>' +
        '<div class="fld"><label for="nlBanner">Banner image</label>' +
        '<div class="imgrow"><input id="nlBanner" type="text" placeholder="https://… or upload" value="' + esc(st.banner) + '">' +
        '<button class="btn ghost sm" type="button" data-a="upload" data-for="nlBanner" data-folder="newsletter" data-max="1200">Upload</button></div>' +
        (st.banner ? '<div class="imgprev wide"><img src="' + esc(st.banner) + '" alt=""></div>' : '') +
        '<p class="hint">About 1024 × 512. Half your readers have images switched off, so never put the offer only in the picture.</p></div>' +
        '<div class="fld"><label for="nlBannerLink">Banner links to</label>' +
        '<input id="nlBannerLink" type="text" placeholder="/category/towels" value="' + esc(st.bannerLink) + '">' +
        '<p class="hint">A picture in an email should always be clickable. Blank sends them to the shop front.</p></div>' +
        '</section>' +

        '<section class="panel"><h2 class="ph3">Offer</h2>' +
        '<p style="margin:0 0 10px">A band under the picture. Leave it blank for a newsletter with no offer in it.</p>' +
        '<div class="fld"><label for="nlOffer">The offer</label>' +
        '<input id="nlOffer" type="text" maxlength="90" placeholder="15% off your first order" value="' + esc(st.offer) + '">' +
        '<p class="hint">Say the thing plainly. “15% off your first order” beats “a little something for you”.</p></div>' +
        '<div class="fld"><label for="nlOfferCode">Code <span class="muted">(optional)</span></label>' +
        '<input id="nlOfferCode" type="text" maxlength="24" placeholder="WELCOME15" value="' + esc(st.offerCode) + '"></div>' +
        '</section>' +

        '<section class="panel"><h2 class="ph3">Products to show</h2>' +
        '<p style="margin:0 0 10px">Up to four. Each one is a picture, a name and a price, and all of it is a link to that product.</p>' +
        '<div class="fld"><label for="nlPicksTitle">Heading above them <span class="muted">(optional)</span></label>' +
        '<input id="nlPicksTitle" type="text" maxlength="60" placeholder="Shop the Willow collection" value="' + esc(st.picksTitle) + '"></div>' +
        '<div class="nlpicks">' + (A.draft.products || []).filter(function (p) { return !p.hidden; }).slice(0, 60).map(function (p) {
          var on = st.picks.indexOf(p.id) >= 0;
          return '<label class="nlpick' + (on ? ' on' : '') + '"><input type="checkbox" data-a="nl-pick" data-id="' + esc(p.id) + '"' + (on ? ' checked' : '') + '>' +
            '<span>' + esc(HW.seo.clip(p.name, 44)) + '</span></label>';
        }).join('') + '</div>' +
        '</section>' +

        '<section class="panel"><h2 class="ph3">Button</h2><div class="grid2">' +
        '<div class="fld"><label for="nlCtaLabel">Button text</label>' +
        '<input id="nlCtaLabel" type="text" maxlength="40" placeholder="Shop the collection" value="' + esc(st.ctaLabel) + '"></div>' +
        '<div class="fld"><label for="nlCtaLink">Button links to</label>' +
        '<input id="nlCtaLink" type="text" placeholder="/category/towels" value="' + esc(st.ctaLink) + '"></div></div>' +
        '<p class="hint" style="margin:0">Leave the text blank for no button.</p>' +
        '</section>' +

        '<section class="panel"><h2 class="ph3">Check it first</h2>' +
        '<p style="margin:0 0 10px">Send one to yourself and read it on a phone before it goes to everybody.</p>' +
        '<div class="toolbar"><input id="nlTest" type="email" placeholder="your@email.com" value="' + esc(st.test || (A.user && A.user.email) || '') + '" style="min-width:240px">' +
        '<button class="btn sm" type="button" data-a="nl-test"' + (st.sending ? ' disabled' : '') + '>Send test</button></div>' +
        '</section>' +

        '<section class="panel"><h2 class="ph3">Send it</h2>' +
        '<p style="margin:0 0 10px">This goes to everyone on the list and cannot be taken back.</p>' +
        '<button class="btn loom" type="button" data-a="nl-send"' + (st.sending || !n ? ' disabled' : '') + '>' +
        (st.sending ? 'Sending…' : 'Send to ' + (n || 0) + ' ' + (n === 1 ? 'subscriber' : 'subscribers')) + '</button>' +
        '<p class="hint" style="margin:10px 0 0">Footer on every copy: ' + esc(address || '(set your address in Storefront → Contact)') + ' · Unsubscribe</p>' +
        '</section>';
    },
    after: function () {
      if (st.count == null) loadCount().then(function () { if (A.tab === 'newsletter') A.render(); });
      var body = document.getElementById('nlBody');
      if (body) body.addEventListener('input', function () { st.body = body.value; keep(); });
      var subj = document.getElementById('nlSubject');
      if (subj) subj.addEventListener('input', function () { st.subject = subj.value; keep(); });
      var ttl = document.getElementById('nlTitle');
      if (ttl) ttl.addEventListener('input', function () { st.title = ttl.value; keep(); });
      [['nlBanner','banner'], ['nlBannerLink','bannerLink'], ['nlCtaLabel','ctaLabel'], ['nlCtaLink','ctaLink'],
       ['nlOffer','offer'], ['nlOfferCode','offerCode'], ['nlPicksTitle','picksTitle']].forEach(function (pair) {
        var el = document.getElementById(pair[0]);
        if (el) el.addEventListener('input', function () { st[pair[1]] = el.value; keep(); });
      });
      var test = document.getElementById('nlTest');
      if (test) test.addEventListener('input', function () { st.test = test.value; keep(); });
    },
  };


  A.actions['nl-pick'] = function (el) {
    var id = el.dataset.id, at = st.picks.indexOf(id);
    if (at >= 0) st.picks.splice(at, 1);
    else if (st.picks.length >= 4) { el.checked = false; u.toast('Four is the most that fits.'); return; }
    else st.picks.push(id);
    el.closest('.nlpick').classList.toggle('on', at < 0);
    keep();
  };

  async function send(testTo) {
    if (!st.body.trim()) { u.toast('Write something first.'); return; }
    if (!st.subject.trim()) { u.toast('Give it a subject line.'); return; }
    st.sending = true; A.render();
    try {
      var out = await A.workerCall('/newsletter/send', {
        subject: st.subject,
        title: st.title,
        html: await bodyHtml(st.body),
        test: testTo || '',
      });
      st.last = out;
      u.toast(testTo ? 'Test sent' : 'Sent to ' + out.sent);
      if (!testTo) { st.subject = ''; st.title = ''; st.body = ''; st.banner = ''; st.bannerLink = '';
        st.picks = []; st.ctaLabel = ''; st.ctaLink = ''; st.offer = ''; st.offerCode = ''; st.picksTitle = ''; keep(); }
    } catch (e) {
      u.toast('Couldn’t send: ' + e.message);
    } finally {
      st.sending = false;
      A.render();
    }
  }

  A.actions['nl-test'] = function () {
    var el = document.getElementById('nlTest');
    send((el && el.value.trim()) || (A.user && A.user.email) || '');
  };

  A.actions['nl-send'] = function () {
    var n = st.count || 0;
    if (!confirm('Send this to ' + n + ' ' + (n === 1 ? 'subscriber' : 'subscribers') + '?\n\nIt cannot be taken back.')) return;
    send('');
  };
})(window.HW = window.HW || {});
