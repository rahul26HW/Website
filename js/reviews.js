/* Home Weavers — customer reviews: the stars, the list under a product, and the
   form a customer fills in from their own order.

   Only someone who bought the item can write one, and that is not decided here:
   the page sends an order number and the server checks it against the order
   before a word is stored. Nothing in this file is trusted. */
(function (HW) {
  'use strict';

  var u = HW.u, esc = u.esc;

  var STAR = 'M8 .9l2.2 4.45 4.9.72-3.55 3.46.84 4.89L8 12.11 3.61 14.4l.84-4.89L.9 6.07l4.9-.72z';

  /* A row of stars, drawn to a fraction so 4.3 looks like 4.3 rather than 4.
     The clip is per-row, so an id that is unique per call keeps two rows apart. */
  var starSeq = 0;
  HW.reviews = HW.reviews || {};

  HW.reviews.stars = function (value, size) {
    var v = Math.max(0, Math.min(5, Number(value) || 0));
    var px = size || 16, id = 'starclip' + (++starSeq);
    var full = Math.floor(v), part = v - full;
    var out = '<span class="stars" role="img" aria-label="' + esc(v.toFixed(1)) + ' out of 5 stars">';
    out += '<svg width="' + (px * 5 + 8) + '" height="' + px + '" viewBox="0 0 ' + (16 * 5 + 8) + ' 16" aria-hidden="true">';
    out += '<defs><clipPath id="' + id + '"><rect x="0" y="0" width="' +
      ((full * 18) + (part * 16)).toFixed(2) + '" height="16"/></clipPath></defs>';
    var path = '';
    for (var i = 0; i < 5; i++) path += '<path transform="translate(' + (i * 18) + ',0)" d="' + STAR + '"/>';
    out += '<g class="star-bg">' + path + '</g>';
    out += '<g class="star-fg" clip-path="url(#' + id + ')">' + path + '</g>';
    return out + '</svg></span>';
  };

  /* ---------- what everything has been given ---------- *
     One call for the whole catalogue, kept for the session: a listing page would
     otherwise ask the server once per card. */
  var statsPromise = null;
  HW.reviews.stats = function () {
    if (!statsPromise) {
      statsPromise = HW.api.rpc('public_review_stats', {}).catch(function () { return {}; });
    }
    return statsPromise;
  };
  HW.reviews.forget = function () { statsPromise = null; };

  /* The small line under a product card: ★★★★☆ (12). Empty until someone has
     written something — a product with no reviews says nothing rather than "0". */
  HW.reviews.cardLine = function (stat) {
    if (!stat || !stat.n) return '';
    return '<div class="prate">' + HW.reviews.stars(stat.avg, 12) +
      '<span class="prate-n">(' + stat.n + ')</span></div>';
  };

  /* Stars on the cards of whatever is currently on screen. Painted after the page is
     drawn rather than built into the card, so a listing never waits on this to appear. */
  HW.reviews.paintCards = async function (root) {
    var cards = u.qsa('.pcard[data-pid]', root || document);
    if (!cards.length) return;
    var stats = await HW.reviews.stats();
    cards.forEach(function (card) {
      var stat = stats[card.dataset.pid];
      var meta = card.querySelector('.meta');
      var old = card.querySelector('.prate');
      if (old) old.remove();
      if (!stat || !stat.n || !meta) return;
      meta.insertAdjacentHTML('beforeend', HW.reviews.cardLine(stat));
    });
  };

  /* ---------- the section under a product ---------- */
  HW.reviews.section = async function (productId, mount) {
    var el = typeof mount === 'string' ? document.getElementById(mount) : mount;
    if (!el) return;
    var d;
    try { d = await HW.api.rpc('public_reviews', { p_product_id: productId }); }
    catch (e) { el.innerHTML = ''; return; }
    if (!d) { el.innerHTML = ''; return; }

    var n = Number(d.count) || 0;
    if (!n) {
      el.innerHTML = '<div class="rv-empty"><h2>Reviews</h2>' +
        '<p class="muted">No reviews yet. If you have bought this, you can review it from your order.</p></div>';
      return;
    }

    var hist = d.histogram || {};
    var bars = [5, 4, 3, 2, 1].map(function (k) {
      var c = Number(hist[k]) || 0, pct = n ? Math.round(c * 100 / n) : 0;
      return '<div class="rv-bar"><span>' + k + '</span>' +
        '<span class="rv-track"><span class="rv-fill" style="width:' + pct + '%"></span></span>' +
        '<span class="rv-c">' + c + '</span></div>';
    }).join('');

    var items = (d.items || []).map(function (r) {
      var photos = (r.photos || []).map(function (path) {
        var url = HW.reviews.photoUrl(path);
        return '<a class="rv-photo" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' +
          '<img src="' + esc(url) + '" alt="" loading="lazy" decoding="async"></a>';
      }).join('');
      return '<article class="rv">' +
        '<header class="rv-head">' + HW.reviews.stars(r.rating, 14) +
        '<b class="rv-name">' + esc(r.name) + '</b>' +
        /* 'Verified buyer' means this person bought it HERE and the order was checked.
           A review carried over from a marketplace has not been through any of that, and
           wearing that badge would be a straightforward false claim — the exact thing the
           rules on reviews exist to stop. It says where it came from instead. */
        (r.source
          ? '<span class="rv-badge src" title="Written on ' + esc(r.source) + ', not on this site">from ' + esc(r.source) + '</span>'
          : '<span class="rv-badge" title="Bought from us">Verified buyer</span>') +
        '<time class="rv-when">' + esc(u.fmtDate(r.createdAt)) + '</time></header>' +
        (r.title ? '<h3 class="rv-title">' + esc(r.title) + '</h3>' : '') +
        (r.body ? '<p class="rv-body">' + esc(r.body).replace(/\n+/g, '<br>') + '</p>' : '') +
        (photos ? '<div class="rv-photos">' + photos + '</div>' : '') +
        (r.reply ? '<div class="rv-reply"><b>Home Weavers</b><p>' + esc(r.reply).replace(/\n+/g, '<br>') + '</p></div>' : '') +
        '</article>';
    }).join('');

    el.innerHTML = '<div class="rv-wrap"><h2>Reviews</h2>' +
      '<div class="rv-top"><div class="rv-score"><b>' + (Number(d.average) || 0).toFixed(1) + '</b>' +
      HW.reviews.stars(d.average, 18) +
      '<span class="muted">' + n + (n === 1 ? ' review' : ' reviews') + '</span></div>' +
      '<div class="rv-bars">' + bars + '</div></div>' +
      '<div class="rv-list">' + items + '</div></div>';
  };

  HW.reviews.photoUrl = function (path) {
    var base = String((window.HW_CONFIG || {}).supabaseUrl || '').replace(/\/+$/, '');
    return base + '/storage/v1/object/public/reviews/' + String(path || '');
  };

  /* ---------- writing one ---------- *
     Shown inside a customer's own order, against the item it is about. */
  HW.reviews.formHTML = function (orderNumber, item, existing, defaultName) {
    var r = existing || {};
    var id = 'rvf-' + String(orderNumber).replace(/[^A-Za-z0-9]/g, '') + '-' + String(item.product_id).replace(/[^A-Za-z0-9]/g, '');
    var picked = Number(r.rating) || 0;
    var stars = [1, 2, 3, 4, 5].map(function (k) {
      return '<button type="button" class="rv-star' + (k <= picked ? ' on' : '') + '" data-act="rv-star" data-v="' + k + '" ' +
        'aria-label="' + k + (k === 1 ? ' star' : ' stars') + '" aria-pressed="' + (k <= picked) + '">' +
        '<svg viewBox="0 0 16 16" width="26" height="26" aria-hidden="true"><path d="' + STAR + '"/></svg></button>';
    }).join('');
    return '<form class="rv-form" id="' + id + '" data-order="' + esc(orderNumber) + '" data-product="' + esc(item.product_id) + '">' +
      '<div class="rv-stars-pick" role="group" aria-label="Your rating">' + stars +
      '<input type="hidden" name="rating" value="' + (picked || '') + '"></div>' +
      '<div class="fld"><label for="' + id + '-n">Shown as</label>' +
      '<input id="' + id + '-n" name="name" maxlength="80" required value="' + esc(r.name || defaultName || '') + '"></div>' +
      '<div class="fld"><label for="' + id + '-t">Headline <span class="muted">(optional)</span></label>' +
      '<input id="' + id + '-t" name="title" maxlength="120" value="' + esc(r.title || '') + '"></div>' +
      '<div class="fld"><label for="' + id + '-b">Your review <span class="muted">(optional)</span></label>' +
      '<textarea id="' + id + '-b" name="body" rows="4" maxlength="4000">' + esc(r.body || '') + '</textarea></div>' +
      '<div class="fld"><label for="' + id + '-p">Photos <span class="muted">(up to 4, optional)</span></label>' +
      '<input id="' + id + '-p" type="file" accept="image/jpeg,image/png,image/webp" multiple data-act="rv-pick">' +
      '<div class="rv-picked" aria-live="polite"></div></div>' +
      '<p class="form-msg" role="status"></p>' +
      '<div class="btnrow"><button class="btn loom sm" type="submit">' + (r.rating ? 'Update review' : 'Post review') + '</button>' +
      '<button class="btn ghost sm" type="button" data-act="rv-cancel">Cancel</button></div>' +
      '</form>';
  };

  /* A phone photograph is several megabytes and carries the place it was taken in its
     EXIF block. Re-drawing it through a canvas does both jobs at once: what leaves the
     browser is a smaller picture with no metadata attached to it. */
  function shrink(file, max) {
    return new Promise(function (resolve, reject) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var scale = Math.min(1, max / Math.max(img.width, img.height));
        var w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        c.toBlob(function (blob) { blob ? resolve(blob) : reject(new Error('Could not read that image.')); }, 'image/webp', 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
      img.src = url;
    });
  }

  var pending = {};   /* form id -> [blob] chosen but not yet sent */

  HW.reviews.pick = async function (input) {
    var form = input.closest('.rv-form'), box = form.querySelector('.rv-picked');
    var files = Array.prototype.slice.call(input.files || []).slice(0, 4);
    box.textContent = files.length ? 'Preparing…' : '';
    try {
      pending[form.id] = await Promise.all(files.map(function (f) { return shrink(f, 1600); }));
    } catch (e) {
      box.textContent = e.message;
      pending[form.id] = [];
      return;
    }
    box.innerHTML = pending[form.id].map(function (b) {
      return '<img class="rv-thumb" src="' + URL.createObjectURL(b) + '" alt="">';
    }).join('');
  };

  HW.reviews.submit = async function (form) {
    var msg = form.querySelector('.form-msg');
    var rating = Number(form.rating.value) || 0;
    if (!rating) { msg.className = 'form-msg bad'; msg.textContent = 'Please choose a rating.'; return; }
    var btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    msg.className = 'form-msg'; msg.textContent = 'Sending…';
    try {
      var blobs = pending[form.id] || [];
      var paths = [];
      if (blobs.length) {
        /* One short-lived link per photograph, handed out by the server. The browser
           never holds a key to the store. */
        var slots = await HW.account.call('/account/review/upload', {
          orderNumber: form.dataset.order, count: blobs.length, types: blobs.map(function () { return 'webp'; }),
        });
        for (var i = 0; i < blobs.length; i++) {
          var res = await fetch(slots.uploads[i].url, { method: 'PUT', body: blobs[i], headers: { 'Content-Type': 'image/webp' } });
          if (!res.ok) throw new Error('One of the photos would not upload.');
          paths.push(slots.uploads[i].path);
        }
      }
      var out = await HW.account.call('/account/review', {
        orderNumber: form.dataset.order,
        productId: form.dataset.product,
        rating: rating,
        name: form.name.value,
        title: form.title.value,
        body: form.body.value,
        photos: paths,
      });
      delete pending[form.id];
      msg.className = 'form-msg ok';
      msg.textContent = out.status === 'published'
        ? 'Thank you — your review is live.'
        : 'Thank you — your review will appear once we have read it.';
      HW.reviews.forget();
      HW.account.invalidate();
      setTimeout(function () { HW.router.run({ scroll: false }); }, 1400);
    } catch (e) {
      msg.className = 'form-msg bad';
      msg.textContent = e.message || 'That did not go through. Please try again.';
      btn.disabled = false;
    }
  };

  /* The star buttons and the file picker, wherever a form is on the page. */
  document.addEventListener('click', function (e) {
    var star = e.target.closest ? e.target.closest('[data-act=rv-star]') : null;
    if (star) {
      var form = star.closest('.rv-form');
      var v = Number(star.dataset.v) || 0;
      form.rating.value = v;
      u.qsa('[data-act=rv-star]', form).forEach(function (b) {
        var on = Number(b.dataset.v) <= v;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on);
      });
      return;
    }
    var cancel = e.target.closest ? e.target.closest('[data-act=rv-cancel]') : null;
    if (cancel) { HW.router.run({ scroll: false }); }
  });
  document.addEventListener('change', function (e) {
    if (e.target.matches && e.target.matches('[data-act=rv-pick]')) HW.reviews.pick(e.target);
  });
  document.addEventListener('submit', function (e) {
    if (e.target.classList && e.target.classList.contains('rv-form')) {
      e.preventDefault();
      HW.reviews.submit(e.target);
    }
  });
})(window.HW = window.HW || {});
