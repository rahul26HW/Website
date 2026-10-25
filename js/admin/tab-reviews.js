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

  /* ---------------------------------------------------------------- *
   * Importing reviews written somewhere else
   * ---------------------------------------------------------------- */
  /* One review per line, tab or pipe separated, pasted straight out of a spreadsheet:
       product | name | rating | title | body | date
     The product is matched by SKU, slug, id or name, because whichever of those the
     export happens to carry is the one you will have.

     Nothing is written until the preview has been read. A paste of eighty rows with the
     columns in the wrong order is the normal way this goes wrong, and it should go wrong
     on screen rather than in the database. */
  var imp = { text: '', rows: null, source: 'Amazon', status: 'published', busy: false, done: '' };

  function findProduct(token) {
    var t = String(token || '').trim().toLowerCase();
    if (!t) return null;
    var list = A.draft.products || [];
    var byId = list.find(function (p) { return String(p.id).toLowerCase() === t; });
    if (byId) return byId;
    var bySlug = list.find(function (p) { return String(p.slug).toLowerCase() === t; });
    if (bySlug) return bySlug;
    var byName = list.find(function (p) { return String(p.name).trim().toLowerCase() === t; });
    if (byName) return byName;
    // SKUs live on the variants, so this is the last and slowest look.
    var hit = null;
    list.forEach(function (p) {
      if (hit) return;
      if (String(p.sku || '').toLowerCase() === t) { hit = p; return; }
      if (!HW.m.isCollection(p)) return;
      HW.m.eachVariant(p, function (v) { if (!hit && String(v.sku || '').toLowerCase() === t) hit = p; });
    });
    return hit;
  }

  function parseImport(text) {
    return String(text || '').split(/\r?\n/).map(function (line, i) {
      var raw = line.trim();
      if (!raw) return null;
      var cells = raw.indexOf('\t') >= 0 ? raw.split('\t') : raw.split('|');
      cells = cells.map(function (c) { return c.trim(); });
      var prod = findProduct(cells[0]);
      var rating = Math.round(Number(cells[2]));
      var when = cells[5] ? new Date(cells[5]) : null;
      var problems = [];
      if (!prod) problems.push('no product matching "' + (cells[0] || '') + '"');
      if (!cells[1]) problems.push('no name');
      if (!(rating >= 1 && rating <= 5)) problems.push('rating must be 1 to 5');
      if (!cells[4]) problems.push('no review text');
      if (cells[5] && isNaN(when)) problems.push('date not understood');
      return {
        line: i + 1, product: prod, name: cells[1] || '', rating: rating,
        title: cells[3] || '', body: cells[4] || '',
        createdAt: when && !isNaN(when) ? when.toISOString() : null,
        problems: problems,
      };
    }).filter(Boolean);
  }

  function importPanel() {
    var rows = imp.rows;
    var ok = rows ? rows.filter(function (r) { return !r.problems.length; }) : [];
    var bad = rows ? rows.filter(function (r) { return r.problems.length; }) : [];
    return '<section class="panel"><h2 class="ph3">Import reviews from elsewhere</h2>' +
      '<p class="hint">One per line, columns separated by a tab or a pipe, in this order:<br>' +
      '<code>product &nbsp;|&nbsp; name &nbsp;|&nbsp; rating &nbsp;|&nbsp; title &nbsp;|&nbsp; review &nbsp;|&nbsp; date</code><br>' +
      'The product can be a SKU, a web address slug, or the exact product name. Title and date may be left empty.</p>' +
      '<p class="hint">Where a review came from is shown with it on the product page. A review written on ' +
      'Amazon and shown without saying so is being passed off as something it is not, which is the ' +
      'difference between quoting someone and claiming them. Import the poor ones as well as the good ' +
      'ones: a page of nothing but five stars is the thing shoppers have learned not to believe.</p>' +
      '<div class="grid2">' +
      '<label class="fld"><span class="lab">Written on</span>' +
      '<input id="impSource" type="text" value="' + esc(imp.source) + '" placeholder="Amazon"></label>' +
      '<label class="fld"><span class="lab">Publish as</span><select id="impStatus">' +
      '<option value="published"' + (imp.status === 'published' ? ' selected' : '') + '>Published straight away</option>' +
      '<option value="pending"' + (imp.status === 'pending' ? ' selected' : '') + '>Waiting, so I can read them first</option>' +
      '</select></label></div>' +
      '<label class="fld"><span class="lab">Paste the rows</span>' +
      '<textarea id="impText" rows="8" spellcheck="false" placeholder="BWA1724BL&#9;Sarah M.&#9;5&#9;Lovely rug&#9;Soft and it has not shed at all.&#9;2026-08-14">' + esc(imp.text) + '</textarea></label>' +
      '<div class="btnrow"><button class="btn ghost sm" type="button" data-a="imp-check">Check these rows</button>' +
      (ok.length ? '<button class="btn loom sm" type="button" data-a="imp-go"' + (imp.busy ? ' disabled' : '') + '>' +
        (imp.busy ? 'Importing…' : 'Import ' + ok.length + ' review' + (ok.length === 1 ? '' : 's')) + '</button>' : '') +
      '</div>' +
      (imp.done ? '<p class="okmsg">' + esc(imp.done) + '</p>' : '') +
      (rows ? '<div class="tablewrap" style="margin-top:12px"><table class="adt"><thead><tr><th>Line</th><th>Product</th><th>Name</th><th>Rating</th><th>Review</th><th></th></tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr' + (r.problems.length ? ' class="bad"' : '') + '><td>' + r.line + '</td>' +
            '<td>' + esc(r.product ? r.product.name : '—') + '</td>' +
            '<td>' + esc(r.name) + '</td>' +
            '<td>' + (r.rating >= 1 && r.rating <= 5 ? stars(r.rating) : '—') + '</td>' +
            '<td>' + esc(String(r.body).slice(0, 70)) + (String(r.body).length > 70 ? '…' : '') + '</td>' +
            '<td class="muted">' + esc(r.problems.join('; ')) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<p class="hint">' + ok.length + ' ready' + (bad.length ? ', ' + bad.length + ' with something wrong — those are skipped.' : '.') + '</p>'
        : '') +
      '</section>';
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
        '</tbody></table></div></section>' +
        importPanel();
    }
  };

  A.tabs.reviews.after = function () {
    if (!st.list) loadReviews().then(function () { if (A.tab === 'reviews') A.render(); });
  };

  A.actions['imp-check'] = function () {
    var box = document.getElementById('impText');
    var src = document.getElementById('impSource');
    var sel = document.getElementById('impStatus');
    imp.text = box ? box.value : '';
    imp.source = src ? src.value.trim() : '';
    imp.status = sel ? sel.value : 'published';
    imp.done = '';
    imp.rows = parseImport(imp.text);
    A.render();
  };

  A.actions['imp-go'] = async function () {
    var ready = (imp.rows || []).filter(function (r) { return !r.problems.length; });
    if (!ready.length) return;
    if (!imp.source) { u.toast('Say where these were written first.'); return; }
    if (!confirm('Import ' + ready.length + ' review' + (ready.length === 1 ? '' : 's') + ' from ' + imp.source + '?')) return;
    imp.busy = true; A.render();
    var payload = ready.map(function (r) {
      return {
        product_id: r.product.id,
        product_name: r.product.name,
        name: r.name.slice(0, 80),
        rating: r.rating,
        title: r.title ? r.title.slice(0, 120) : null,
        body: r.body.slice(0, 4000),
        source: imp.source.slice(0, 60),
        status: imp.status,
        created_at: r.createdAt || new Date().toISOString(),
        published_at: imp.status === 'published' ? new Date().toISOString() : null,
      };
    });
    var res = await A.sb.from('reviews').insert(payload);
    imp.busy = false;
    if (res.error) { imp.done = ''; u.toast('Import failed: ' + res.error.message); A.render(); return; }
    imp.done = ready.length + ' review' + (ready.length === 1 ? '' : 's') + ' imported from ' + imp.source + '.';
    imp.text = ''; imp.rows = null;
    await loadReviews();
    A.render();
    u.toast('Imported');
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
