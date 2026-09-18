/* Home Weavers — admin: Inventory (stock per SKU, simple-product SKUs, low stock, CSV upload with row report, back-in-stock requests). */
(function (HW) {
  'use strict';

  var A = HW.A, u = HW.u, esc = u.esc, m = HW.m;
  var state = { filter: 'all', q: '' };

  function withDraft(fn) { var s = HW.DB; HW.DB = A.draft; try { return fn(); } finally { HW.DB = s; } }

  /* One row per SKU. Simple products without a SKU still appear (keyed by product id) so they can be fixed. */
  function rows() {
    return withDraft(function () {
      var out = [];
      A.draft.products.forEach(function (p) {
        if (m.isCollection(p)) {
          m.eachVariant(p, function (v, c, s) {
            out.push({ sku: v.sku, key: v.sku, product: p.name, pid: p.id, variant: c.label + ' / ' + s.label, simple: false, fallback: v.inStock });
          });
        } else {
          var key = m.simpleQtyKey(p);
          out.push({ sku: p.sku || '', key: key, product: p.name, pid: p.id, variant: '', simple: true, fallback: p.inStock !== false });
        }
      });
      return out;
    });
  }

  function status(r) {
    var inv = A.draft.inventory, thr = Number(A.draft.settings.lowStockThreshold) || 5;
    if (!Object.prototype.hasOwnProperty.call(inv, r.key)) return { cls: 'untracked', label: 'Not tracked', html: '<span class="hint">not tracked' + (r.fallback ? '' : ' · marked out') + '</span>' };
    var q = parseInt(inv[r.key], 10) || 0;
    if (q <= 0) return { cls: 'out', label: 'Out', html: '<span class="st out">Out of stock</span>' };
    if (q <= thr) return { cls: 'low', label: 'Low', html: '<span class="st low">Low (' + q + ')</span>' };
    return { cls: 'in', label: 'In stock', html: '<span class="st in">In stock</span>' };
  }

  A.tabs.inventory = {
    render: function () {
      var all = rows(), inv = A.draft.inventory;
      var counts = { all: all.length, low: 0, out: 0, untracked: 0, nosku: 0 };
      all.forEach(function (r) { var s = status(r).cls; if (s === 'low') counts.low++; if (s === 'out') counts.out++; if (s === 'untracked') counts.untracked++; if (r.simple && !r.sku) counts.nosku++; });
      var q = state.q.toLowerCase();
      var shown = all.filter(function (r) {
        var s = status(r).cls;
        if (state.filter === 'low' && s !== 'low') return false;
        if (state.filter === 'out' && s !== 'out') return false;
        if (state.filter === 'untracked' && s !== 'untracked') return false;
        if (state.filter === 'nosku' && !(r.simple && !r.sku)) return false;
        if (q && (r.sku + ' ' + r.product + ' ' + r.variant).toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
      function chip(k, label) { return '<button type="button" class="chip' + (state.filter === k ? ' active' : '') + '" data-a="inv-filter" data-f="' + k + '" aria-pressed="' + (state.filter === k) + '">' + label + ' (' + counts[k] + ')</button>'; }

      return '<h1>Inventory</h1><p class="sub">Stock for every SKU. Upload your counts daily. At 0 a SKU shows as out of stock' + (A.draft.settings.outOfStock === 'hide' ? ' and fully sold-out products are hidden' : '') + '.</p>' +
        (counts.low || counts.out ? A.ui.warn('<b>Low-stock alert:</b> ' + counts.low + ' SKU' + (counts.low === 1 ? '' : 's') + ' at or below ' + (A.draft.settings.lowStockThreshold || 5) + ', ' + counts.out + ' out of stock.') : '') +
        (counts.nosku ? A.ui.warn(counts.nosku + ' simple product' + (counts.nosku > 1 ? 's have' : ' has') + ' no SKU. Type the real SKU in the table below — stock moves to it when you save.') : '') +

        A.ui.panel('Daily upload',
          '<p class="hint" style="margin:-6px 0 12px">CSV with columns <b>sku,quantity</b> (a header row is fine). Download the current list, fill in today’s counts, and upload it. You’ll see a row-by-row report before anything changes.</p>' +
          '<div class="btnrow"><button class="btn ghost sm" type="button" data-a="inv-download">⬇ Download current (CSV)</button>' +
          '<button class="btn loom sm" type="button" data-a="inv-upload">⬆ Upload inventory CSV</button></div>' +
          '<div class="grid2" style="margin-top:14px">' + A.ui.field('Low-stock alert at', 'settings.lowStockThreshold', A.draft.settings.lowStockThreshold, { type: 'int', min: 0, hint: 'Saved with Save changes.' }) + '</div>') +

        '<section class="panel"><h2 class="ph3">Stock levels</h2>' +
        '<div class="toolbar"><div class="subnav">' + chip('all', 'All') + chip('low', 'Low') + chip('out', 'Out') + chip('untracked', 'Not tracked') + chip('nosku', 'Missing SKU') + '</div>' +
        '<span class="spacer"></span><label class="sr-only" for="invSearch">Search SKUs</label><input id="invSearch" type="search" placeholder="Search SKU or product" value="' + esc(state.q) + '"></div>' +
        '<div class="tablewrap"><table class="adt invt"><thead><tr><th>SKU</th><th>Product</th><th>Variant</th><th style="text-align:center">Qty</th><th>Status</th></tr></thead><tbody>' +
        (shown.length ? shown.map(function (r) {
          var tracked = Object.prototype.hasOwnProperty.call(inv, r.key);
          var skuCell = r.simple
            ? '<label class="sr-only" for="sku_' + esc(r.pid) + '">SKU for ' + esc(HW.seo.clip(r.product, 40)) + '</label><input id="sku_' + esc(r.pid) + '" class="skuin' + (r.sku ? '' : ' missing') + '" value="' + esc(r.sku) + '" placeholder="Enter SKU" data-simple-sku="' + esc(r.pid) + '">'
            : '<code>' + esc(r.sku) + '</code>';
          return '<tr><td>' + skuCell + '</td><td>' + esc(HW.seo.clip(r.product, 60)) + '</td><td class="hint">' + esc(r.variant) + '</td>' +
            '<td style="text-align:center"><input type="number" min="0" step="1" class="qtyin" value="' + (tracked ? (parseInt(inv[r.key], 10) || 0) : '') + '" placeholder="—" data-inv="' + esc(r.key) + '" aria-label="Quantity for ' + esc(r.sku || r.product) + '"></td>' +
            '<td>' + status(r).html + '</td></tr>';
        }).join('') : '<tr><td colspan="5" class="muted" style="padding:16px">Nothing matches.</td></tr>') +
        '</tbody></table></div>' + A.ui.saveBtn() + '</section>' +

        '<section class="panel"><h2 class="ph3">Back-in-stock requests</h2><p class="hint" style="margin:-6px 0 12px">Shoppers who clicked “Notify me”. Email them when the SKU is back, then mark them notified.</p><div id="alertsBox"><p class="hint">Loading…</p></div></section>';
    },
    after: function () {
      var s = document.getElementById('invSearch');
      if (s) s.addEventListener('input', u.debounce(function () { state.q = s.value; var pos = s.selectionStart; keep(); var n = document.getElementById('invSearch'); n.focus(); n.setSelectionRange(pos, pos); }, 250));
      var main = document.getElementById('adminMain');
      main.addEventListener('change', function (e) {
        var el = e.target;
        if (el.dataset.inv != null) {
          var v = el.value.trim();
          if (v !== '' && !/^\d{1,7}$/.test(v)) {
            A.alert(['Stock must be a whole number, 0 or more (you typed “' + v + '”).'], el);
            el.value = A.draft.inventory[el.dataset.inv] == null ? '' : A.draft.inventory[el.dataset.inv];
            return;
          }
          el.removeAttribute('aria-invalid');
          if (v === '') delete A.draft.inventory[el.dataset.inv];
          else A.draft.inventory[el.dataset.inv] = parseInt(v, 10);
          var row = el.closest('tr'); var r = rows().find(function (x) { return x.key === el.dataset.inv; });
          if (row && r) row.lastElementChild.innerHTML = status(r).html;
          A.refreshDirtyBar();
        }
        if (el.dataset.simpleSku != null) {
          var sku = el.value.trim();
          var p = A.draft.products.find(function (x) { return x.id === el.dataset.simpleSku; });
          var taken = sku && A.draft.products.some(function (x) { return x !== p && (x.sku === sku || Object.keys(x.variants || {}).some(function (k) { return x.variants[k].sku === sku; })); });
          if (taken) { u.toast('SKU ' + sku + ' is already used'); el.value = p.sku || ''; return; }
          var oldKey = withDraft(function () { return m.simpleQtyKey(p); });
          p.sku = sku;
          if (sku && A.draft.inventory[oldKey] != null && oldKey !== sku) { A.draft.inventory[sku] = A.draft.inventory[oldKey]; delete A.draft.inventory[oldKey]; }
          keep();
        }
      });
      loadAlerts();
    }
  };

  function keep() { var y = window.scrollY; A.render(); window.scrollTo(0, y); }

  async function loadAlerts() {
    var box = document.getElementById('alertsBox'); if (!box) return;
    var r = await A.sb.from('stock_alerts').select('*').order('created_at', { ascending: false }).limit(500);
    if (r.error) { box.innerHTML = '<p class="badmsg">Couldn’t load requests: ' + esc(r.error.message) + '</p>'; return; }
    var list = r.data || [];
    if (!list.length) { box.innerHTML = '<p class="hint">No requests yet.</p>'; return; }
    box.innerHTML = '<div class="btnrow" style="margin-bottom:10px"><button class="btn ghost sm" type="button" data-a="alerts-csv">⬇ Download CSV</button></div>' +
      '<div class="tablewrap"><table class="adt"><thead><tr><th>Email</th><th>Product</th><th>SKU</th><th>Stock now</th><th>Requested</th><th>Notified</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>' +
      list.map(function (a) {
        var q = A.draft.inventory[a.sku];
        return '<tr><td><a href="mailto:' + esc(a.email) + '">' + esc(a.email) + '</a></td><td>' + esc(HW.seo.clip(a.product_name || a.product_id, 50)) + '</td><td><code>' + esc(a.sku) + '</code></td>' +
          '<td>' + (q == null ? '—' : q) + '</td><td class="hint">' + esc(u.fmtDate(a.created_at)) + '</td>' +
          '<td>' + (a.notified_at ? A.ui.tag(u.fmtDate(a.notified_at), 'green') : '<button class="txtbtn" type="button" data-a="alert-notified" data-id="' + a.id + '">Mark notified</button>') + '</td>' +
          '<td><button class="txtbtn danger" type="button" data-a="alert-delete" data-id="' + a.id + '">Delete</button></td></tr>';
      }).join('') + '</tbody></table></div>';
    A.alertsCache = list;
  }

  A.actions['inv-filter'] = function (el) { state.filter = el.dataset.f; keep(); };

  A.actions['inv-download'] = function () {
    var data = [['sku', 'quantity', 'product', 'variant']];
    rows().forEach(function (r) {
      var tracked = Object.prototype.hasOwnProperty.call(A.draft.inventory, r.key);
      data.push([r.sku || ('(no SKU) ' + r.pid), tracked ? (parseInt(A.draft.inventory[r.key], 10) || 0) : '', r.product, r.variant]);
    });
    A.download('home-weavers-inventory-' + A.today() + '.csv', A.toCsv(data), 'text/csv');
  };

  A.actions['inv-upload'] = async function () {
    var file = await A.pickFile('.csv,text/csv');
    if (!file) return;
    var text;
    try { text = await A.readFile(file); } catch (e) { u.toast(e.message); return; }
    var parsed = A.parseCsv(text);
    var known = {};
    rows().forEach(function (r) { if (r.sku) known[r.sku] = r; else known[r.key] = r; });
    var updates = {}, report = [], seen = {};
    parsed.forEach(function (cols, idx) {
      var line = idx + 1;
      if (!cols.some(function (c) { return String(c).trim(); })) return;
      var sku = String(cols[0] || '').trim().replace(/^'/, ''), qtyRaw = String(cols[1] == null ? '' : cols[1]).trim();
      if (idx === 0 && /^sku$/i.test(sku)) return;
      if (!sku) { report.push({ line: line, ok: false, msg: 'Missing SKU' }); return; }
      if (/^\(no sku\)/i.test(sku)) { report.push({ line: line, ok: false, sku: sku, msg: 'This product has no SKU yet — add it in the table first' }); return; }
      if (!/^-?\d+$/.test(qtyRaw)) { report.push({ line: line, ok: false, sku: sku, msg: qtyRaw === '' ? 'Missing quantity' : 'Quantity “' + qtyRaw + '” is not a whole number' }); return; }
      var qty = parseInt(qtyRaw, 10);
      if (qty < 0) { report.push({ line: line, ok: false, sku: sku, msg: 'Quantity can’t be negative' }); return; }
      if (!known[sku]) { report.push({ line: line, ok: false, sku: sku, msg: 'Unknown SKU (not in any product)' }); return; }
      if (seen[sku]) { report.push({ line: line, ok: false, sku: sku, msg: 'Duplicate — SKU already on line ' + seen[sku] + '; this row was skipped' }); return; }
      seen[sku] = line;
      var key = known[sku].key;
      var before = A.draft.inventory[key];
      updates[key] = qty;
      report.push({ line: line, ok: true, sku: sku, msg: (before == null ? 'not tracked' : before) + ' → ' + qty });
    });
    var good = report.filter(function (r) { return r.ok; }), bad = report.filter(function (r) { return !r.ok; });
    A.modal({
      title: 'Inventory upload: ' + file.name,
      body: '<p><b class="ok">' + good.length + ' row' + (good.length === 1 ? '' : 's') + ' ready</b>' + (bad.length ? ' · <b class="bad">' + bad.length + ' with errors (skipped)</b>' : '') + '</p>' +
        '<div class="tablewrap" style="max-height:340px;overflow:auto"><table class="vartable"><thead><tr><th>Line</th><th>SKU</th><th>Result</th></tr></thead><tbody>' +
        bad.concat(good).map(function (r) { return '<tr class="' + (r.ok ? '' : 'errrow') + '"><td>' + r.line + '</td><td><code>' + esc(r.sku || '') + '</code></td><td>' + (r.ok ? '✓ ' : '✗ ') + esc(r.msg) + '</td></tr>'; }).join('') +
        '</tbody></table></div>' + (good.length ? '<p class="hint">Applying saves the store immediately.</p>' : ''),
      buttons: good.length ? [{ label: 'Apply ' + good.length + ' update' + (good.length === 1 ? '' : 's') + ' and save', cls: 'loom', onClick: async function () {
        Object.keys(updates).forEach(function (k) { A.draft.inventory[k] = updates[k]; });
        await A.saveStore('Inventory updated: ' + good.length + ' SKUs');
        keep();
      } }] : []
    });
  };

  A.actions['alerts-csv'] = function () {
    var data = [['email', 'product', 'sku', 'requested', 'notified']];
    (A.alertsCache || []).forEach(function (a) { data.push([a.email, a.product_name || a.product_id, a.sku, a.created_at, a.notified_at || '']); });
    A.download('back-in-stock-requests-' + A.today() + '.csv', A.toCsv(data), 'text/csv');
  };
  A.actions['alert-notified'] = async function (el) {
    var r = await A.sb.from('stock_alerts').update({ notified_at: new Date().toISOString() }).eq('id', el.dataset.id).select('id');
    if (r.error || !r.data || !r.data.length) { u.toast('Update failed: ' + (r.error ? r.error.message : 'not allowed')); return; }
    u.toast('Marked as notified'); loadAlerts();
  };
  A.actions['alert-delete'] = async function (el) {
    if (!confirm('Delete this request?')) return;
    var r = await A.sb.from('stock_alerts').delete().eq('id', el.dataset.id).select('id');
    if (r.error || !r.data || !r.data.length) { u.toast('Delete failed: ' + (r.error ? r.error.message : 'not allowed')); return; }
    u.toast('Deleted'); loadAlerts();
  };
})(window.HW = window.HW || {});
