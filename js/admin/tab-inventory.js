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
          '<p class="hint" style="margin:-6px 0 12px">An <b>.xlsx</b> or <b>CSV</b> file — a warehouse export uploads just as it downloaded. It needs a row of column names, with the SKU under <b>SKU</b> or <b>Master SKU</b> and the count under <b>Available</b> or <b>Quantity</b>; every other column is ignored. A plain two-column <b>sku,quantity</b> file works too. You’ll see a row-by-row report before anything changes.</p>' +
          '<div class="btnrow"><button class="btn ghost sm" type="button" data-a="inv-download">⬇ Download current (CSV)</button>' +
          '<button class="btn loom sm" type="button" data-a="inv-upload">⬆ Upload stock file</button></div>' +
          '<div class="grid2" style="margin-top:14px">' +
          A.ui.field('Low-stock alert at', 'settings.lowStockThreshold', A.draft.settings.lowStockThreshold, { type: 'int', min: 0, hint: 'Flags a SKU as Low. Doesn’t change what shoppers can buy. Saved with Save changes.' }) +
          A.ui.field('Upload as sold out at or below', 'settings.uploadSoldOutAt', A.draft.settings.uploadSoldOutAt, { type: 'int', min: 0, hint: 'A safety buffer: anything at or below this number arrives as 0, so the website stops taking orders on it. Exactly this many counts too — set 4 if 5 should still sell. 0 uploads the real figures. Saved with Save changes.' }) + '</div>') +

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

  /* ---------------------------------------------------------------- *
   * Upload
   * Column names we accept, best first. Stock means "Available" — what can still be promised to a
   * shopper. "On Hand" counts units already committed to other orders, so it oversells.
   * ---------------------------------------------------------------- */
  var SKU_COLS = ['sku', 'mastersku', 'itemsku', 'productsku', 'skucode', 'merchantsku', 'sellersku'];
  var QTY_COLS = ['available', 'availablequantity', 'availableqty', 'quantityavailable', 'quantity', 'qty', 'stock', 'onhand'];
  var NEVER_QTY = /upc|barcode|ean|gtin|asin|cost|price|weight/;
  var MAX_QTY = 9999999; // the same 7-digit ceiling the table's own quantity box enforces

  function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function cell(cols, at) { return String(at >= 0 && cols[at] != null ? cols[at] : '').trim(); }

  /* Which column is the SKU and which is the count. Named columns win; a bare two-column
     sku,quantity file still works. Anything else is refused rather than guessed at — reading
     column 2 blind is how a UPC column once became the stock count. */
  function mapColumns(table) {
    var head = (table[0] || []).map(norm), i, at;
    var sku = -1, qty = -1;
    for (i = 0; i < SKU_COLS.length && sku < 0; i++) sku = head.indexOf(SKU_COLS[i]);
    for (i = 0; i < QTY_COLS.length && qty < 0; i++) { at = head.indexOf(QTY_COLS[i]); if (at >= 0 && !NEVER_QTY.test(head[at])) qty = at; }
    if (sku >= 0 && qty >= 0) {
      return { sku: sku, qty: qty, from: 1, named: true, skuName: cell(table[0], sku), qtyName: cell(table[0], qty) };
    }
    var width = 0;
    table.forEach(function (r) { var n = r.length; while (n > 0 && !cell(r, n - 1)) n--; if (n > width) width = n; });
    if (width <= 2) {
      // Two columns, read in order — unless the second is named as something that plainly isn't a count.
      if (NEVER_QTY.test(head[1] || '')) {
        return { fatal: 'The second column of this file is <b>' + esc(cell(table[0], 1)) + '</b>, which isn’t a stock count. Upload a file whose count column is named <b>Available</b> or <b>Quantity</b>.' };
      }
      var skipHead = head[0] === 'sku' || QTY_COLS.indexOf(head[1]) >= 0;
      return { sku: 0, qty: 1, from: skipHead ? 1 : 0, named: false, skuName: 'column 1', qtyName: 'column 2' };
    }
    var names = (table[0] || []).map(function (h) { return cell([h], 0); }).filter(Boolean);
    return { fatal: 'This file has ' + width + ' columns and no row of column names I recognise, so I can’t tell which one is the stock count — and guessing is what put barcodes in the stock column last time.' +
      (names.length ? ' Its first row reads: <b>' + esc(names.slice(0, 12).join(' · ')) + '</b>.' : '') +
      ' Name the SKU column <b>SKU</b> (or <b>Master SKU</b>) and the count column <b>Available</b> (or <b>Quantity</b>), or upload a plain two-column <b>sku,quantity</b> file.' };
  }

  A.actions['inv-upload'] = async function () {
    var file = await A.pickFile('.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    if (!file) return;
    var table;
    try { table = await A.readSheet(file); } catch (e) { u.toast(e.message); return; }
    var map = mapColumns(table);
    if (map.fatal) {
      A.modal({ title: 'Inventory upload: ' + file.name, body: '<p class="badmsg">' + map.fatal + '</p>', buttons: [] });
      return;
    }
    var known = {};
    rows().forEach(function (r) { if (r.sku) known[r.sku] = r; else known[r.key] = r; });
    // Stock is uploaded by hand every so often rather than watched live, so the last few units of
    // anything are the ones most likely to be gone already. At or below this line a SKU arrives as 0
    // and the website stops taking orders on it until the next upload says otherwise.
    var floor = Math.max(0, parseInt((A.draft.settings || {}).uploadSoldOutAt, 10) || 0);
    var updates = {}, report = [], seen = {}, subRows = 0, barcodes = 0, negatives = 0, held = 0, notHere = [];
    table.slice(map.from).forEach(function (cols, idx) {
      var line = idx + map.from + 1;
      if (!cols.some(function (c) { return String(c == null ? '' : c).trim(); })) return;
      var sku = cell(cols, map.sku).replace(/^'/, ''), qtyRaw = cell(cols, map.qty).replace(/,/g, '');
      if (!sku) {
        // A warehouse export lists each bin on its own row under the SKU, with the SKU cell left empty.
        // Those rows repeat numbers already counted on the SKU's own row, so they're skipped, not failed.
        if (map.named) { subRows++; return; }
        report.push({ line: line, ok: false, msg: 'Missing SKU' }); return;
      }
      if (/^\(no sku\)/i.test(sku)) { report.push({ line: line, ok: false, sku: sku, msg: 'This product has no SKU yet — add it in the table first' }); return; }
      if (!/^-?\d+(\.0+)?$/.test(qtyRaw)) { report.push({ line: line, ok: false, sku: sku, msg: qtyRaw === '' ? 'Missing quantity' : 'Quantity “' + qtyRaw + '” is not a whole number' }); return; }
      // A warehouse that has shipped more than it received shows a negative. There is nothing on the
      // shelf either way, so it becomes 0 — sold out — rather than holding the whole upload up.
      var qty = parseInt(qtyRaw, 10);
      if (qty < 0) { negatives++; qty = 0; }
      if (qty > MAX_QTY) {
        barcodes++;
        report.push({ line: line, ok: false, sku: sku, msg: qtyRaw + ' is far too big to be stock — that reads like a barcode, not a count' });
        return;
      }
      // A warehouse holds plenty the website doesn't sell. Those rows are counted and named, not
      // listed one by one — thousands of them would bury the handful of errors that need reading.
      if (!known[sku]) { notHere.push(sku); return; }
      if (seen[sku]) { report.push({ line: line, ok: false, sku: sku, msg: 'Duplicate — SKU already on line ' + seen[sku] + '; this row was skipped' }); return; }
      seen[sku] = line;
      var why = qtyRaw.charAt(0) === '-' ? ' (file said ' + qtyRaw + ', oversold)' : '';
      if (floor && qty > 0 && qty <= floor) { held++; why = ' (file said ' + qty + ', at or below your ' + floor + ')'; qty = 0; }
      var key = known[sku].key;
      var before = A.draft.inventory[key];
      updates[key] = qty;
      report.push({ line: line, ok: true, sku: sku, msg: (before == null ? 'not tracked' : before) + ' → ' + qty + why });
    });
    var good = report.filter(function (r) { return r.ok; }), bad = report.filter(function (r) { return !r.ok; });
    A.modal({
      title: 'Inventory upload: ' + file.name,
      body: '<p class="hint" style="margin:-4px 0 12px">Stock read from <b>' + esc(map.qtyName) + '</b>, SKUs from <b>' + esc(map.skuName) + '</b>' +
          (subRows ? ' · ' + subRows + ' location row' + (subRows === 1 ? '' : 's') + ' skipped (they repeat their SKU’s count)' : '') + '.</p>' +
        (barcodes ? A.ui.warn('<b>' + barcodes + ' row' + (barcodes === 1 ? '' : 's') + ' held back</b> for a count over 7 digits — check that <b>' + esc(map.qtyName) + '</b> really is the stock column.') : '') +
        (held ? A.ui.warn('<b>Safety buffer is on.</b> ' + held + ' SKU' + (held === 1 ? ' that has' : 's that have') + ' 1–' + floor + ' in the file ' + (held === 1 ? 'is' : 'are') + ' being uploaded as 0, so the website won’t sell ' + (held === 1 ? 'it' : 'them') + '. Change it under <b>Upload as sold out at or below</b>.') : '') +
        '<p><b class="ok">' + good.length + ' row' + (good.length === 1 ? '' : 's') + ' ready</b>' + (bad.length ? ' · <b class="bad">' + bad.length + ' with errors (skipped)</b>' : '') +
          (notHere.length ? ' · <b>' + notHere.length + ' SKU' + (notHere.length === 1 ? '' : 's') + ' not sold on the website (skipped)</b>' : '') +
          (negatives ? ' · <b>' + negatives + ' negative count' + (negatives === 1 ? '' : 's') + ' read as 0</b>' : '') +
          (held ? ' · <b>' + held + ' SKU' + (held === 1 ? '' : 's') + ' at or below ' + floor + ' held at 0</b>' : '') + '</p>' +
        (notHere.length ? '<p class="hint" style="margin:-8px 0 12px">Normal for a full warehouse export. ' +
          (notHere.length > 8 ? 'First few: ' : '') + '<code>' + notHere.slice(0, 8).map(esc).join('</code> <code>') + '</code>' +
          (notHere.length > 8 ? ' …' : '') + '</p>' : '') +
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
