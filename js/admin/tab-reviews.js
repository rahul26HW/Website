/* Home Weavers — admin: what customers wrote, and what gets published.
   Reviews arrive waiting to be read. Nothing reaches the shop floor until
   somebody here says so. */
(function (HW) {
  'use strict';

  var A = HW.A, u = HW.u, esc = u.esc, ui = A.ui;
  var st = { list: null, filter: 'pending', error: '', open: null };

  var STATUSES = [['pending', 'Waiting'], ['published', 'Published'], ['rejected', 'Hidden']];

  async function loadReviews() {
    var r = await A.sb.from('reviews').select('*').order('created_at', { ascending: false }).limit(500);
    if (r.error) { st.error = r.error.message; st.list = []; return; }
    st.error = ''; st.list = r.data || [];
  }

  function stars(n) {
    var v = Math.max(0, Math.min(5, Number(n) || 0));
    return '<span class="rvstars" aria-label="' + v + ' out of 5">' +
      '★★★★★'.slice(0, v) + '<span class="off">' + '★★★★★'.slice(v) + '</span></span>';
  }

  function photoUrl(path) {
    return String((window.HW_CONFIG || {}).supabaseUrl || '').replace(/\/+$/, '') + '/storage/v1/object/public/reviews/' + String(path || '');
  }

  function row(r) {
    var photos = (r.photos || []).map(function (p) {
      return '<a href="' + esc(photoUrl(p)) + '" target="_blank" rel="noopener noreferrer">' +
        '<img class="thumbsm" src="' + esc(photoUrl(p)) + '" alt="" loading="lazy"></a>';
    }).join('');
    var tag = r.status === 'published' ? ui.tag('Published', 'green')
      : r.status === 'rejected' ? ui.tag('Hidden', 'clay') : ui.tag('Waiting');
    return '<tr>' +
      '<td data-label="Product"><div><b>' + esc(r.product_name || r.product_id) + '</b>' +
      '<div class="hint">' + esc(r.order_number || '') + ' · ' + esc(u.fmtDate(r.created_at)) + '</div></div></td>' +
      '<td data-label="Rating">' + stars(r.rating) + '</td>' +
      '<td data-label="Review"><div>' + (r.title ? '<b>' + esc(r.title) + '</b><br>' : '') +
      (r.body ? esc(r.body).replace(/\n+/g, '<br>') : '<span class="muted">No words, just a rating.</span>') +
      (photos ? '<div class="rvphotos">' + photos + '</div>' : '') +
      '<div class="hint">— ' + esc(r.name) + ' · ' + esc(r.email) + '</div></div></td>' +
      '<td data-label="Status">' + tag + '</td>' +
      '<td data-label="">' +
      (r.status === 'published'
        ? '<button class="btn ghost sm" type="button" data-a="rev-set" data-id="' + r.id + '" data-s="rejected">Hide</button>'
        : '<button class="btn sm" type="button" data-a="rev-set" data-id="' + r.id + '" data-s="published">Publish</button>' +
          (r.status === 'pending' ? ' <button class="btn ghost sm" type="button" data-a="rev-set" data-id="' + r.id + '" data-s="rejected">Hide</button>' : '')) +
      ' <button class="btn ghost sm" type="button" data-a="rev-reply" data-id="' + r.id + '">' + (r.reply ? 'Edit reply' : 'Reply') + '</button>' +
      (st.open === r.id ? replyBox(r) : '') +
      '</td></tr>';
  }

  /* A public answer under the review. Useful for a three-star review that raises
     something a sentence can settle. */
  function replyBox(r) {
    return '<div class="rvreply"><label class="sr-only" for="rvr' + r.id + '">Your reply</label>' +
      '<textarea id="rvr' + r.id + '" rows="3" maxlength="2000" placeholder="Shown under the review, signed Home Weavers.">' + esc(r.reply || '') + '</textarea>' +
      '<div class="btnrow"><button class="btn sm" type="button" data-a="rev-reply-save" data-id="' + r.id + '">Save reply</button>' +
      '<button class="btn ghost sm" type="button" data-a="rev-reply-cancel">Cancel</button></div></div>';
  }

  A.tabs.reviews = {
    render: function () {
      if (!st.list) return '<h1>Reviews</h1><div class="loading">Loading…</div>';
      var counts = { all: st.list.length };
      STATUSES.forEach(function (s) { counts[s[0]] = st.list.filter(function (r) { return r.status === s[0]; }).length; });
      var shown = st.filter === 'all' ? st.list : st.list.filter(function (r) { return r.status === st.filter; });

      return '<h1 class="h1row">Reviews <span class="btnrow"><button class="btn ghost sm" type="button" data-a="rev-refresh">↻ Refresh</button></span></h1>' +
        '<p class="sub">Only people who bought the item can write one, and the shop checks that against the order. ' +
        'New reviews wait here until you publish them.</p>' +
        (st.error ? '<p class="badmsg">Couldn’t load reviews: ' + esc(st.error) + '</p>' : '') +
        '<section class="panel"><div class="toolbar"><div class="subnav">' +
        [['all', 'All']].concat(STATUSES).map(function (s) {
          return '<button type="button" class="chip' + (st.filter === s[0] ? ' active' : '') + '" data-a="rev-filter" data-f="' + s[0] + '" aria-pressed="' + (st.filter === s[0]) + '">' + s[1] + ' (' + counts[s[0]] + ')</button>';
        }).join('') + '</div></div>' +
        '<div class="tablewrap"><table class="adt"><thead><tr><th>Product</th><th>Rating</th><th>Review</th><th>Status</th><th></th></tr></thead><tbody>' +
        (shown.length ? shown.map(row).join('')
          : '<tr><td colspan="5" class="muted" style="padding:16px">' +
            (st.list.length ? 'Nothing here.' : 'No reviews yet. They start arriving a few days after orders are delivered.') + '</td></tr>') +
        '</tbody></table></div></section>';
    }
  };

  A.tabs.reviews.after = function () {
    if (!st.list) loadReviews().then(function () { if (A.tab === 'reviews') A.render(); });
  };

  A.actions['rev-filter'] = function (el) { st.filter = el.dataset.f; A.render(); };
  A.actions['rev-refresh'] = async function () { await loadReviews(); A.render(); u.toast('Reviews refreshed'); };
  A.actions['rev-reply'] = function (el) { st.open = el.dataset.id; A.render(); };
  A.actions['rev-reply-cancel'] = function () { st.open = null; A.render(); };

  A.actions['rev-set'] = async function (el) {
    var id = el.dataset.id, next = el.dataset.s;
    el.disabled = true;
    try {
      var r = await A.sb.from('reviews').update({
        status: next,
        published_at: next === 'published' ? new Date().toISOString() : null,
      }).eq('id', id);
      if (r.error) throw new Error(r.error.message);
      st.list.forEach(function (r) { if (r.id === id) { r.status = next; } });
      u.toast(next === 'published' ? 'Published' : 'Hidden');
      A.render();
    } catch (e) {
      el.disabled = false;
      u.toast('Couldn’t save: ' + e.message);
    }
  };

  A.actions['rev-reply-save'] = async function (el) {
    var id = el.dataset.id;
    var box = document.getElementById('rvr' + id);
    var text = (box && box.value || '').trim();
    el.disabled = true;
    try {
      var r = await A.sb.from('reviews').update({ reply: text || null, replied_at: text ? new Date().toISOString() : null }).eq('id', id);
      if (r.error) throw new Error(r.error.message);
      st.list.forEach(function (r) { if (r.id === id) { r.reply = text; } });
      st.open = null;
      u.toast('Reply saved');
      A.render();
    } catch (e) {
      el.disabled = false;
      u.toast('Couldn’t save: ' + e.message);
    }
  };
})(window.HW = window.HW || {});
