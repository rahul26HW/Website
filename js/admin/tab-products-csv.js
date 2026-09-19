/* Home Weavers — admin: bulk product export / import (CSV, one row per SKU; opens in Excel or Google Sheets).
   Collections use one row per color × size. Import never deletes anything, shows every change first,
   and a blank cell keeps the current value. */
(function (HW) {
  'use strict';

  var A = HW.A, u = HW.u, esc = u.esc;
  var COLS = ['handle', 'name', 'type', 'category', 'subcategory', 'sku', 'color', 'size', 'price', 'sale_price', 'stock',
    'images', 'description', 'features', 'care', 'material', 'origin', 'badge', 'featured', 'hidden',
    'seo_title', 'seo_description', 'image_alt'];
  var OLD_COLS = ['color_hex', 'color_images', 'weight']; // older exports: still understood, no longer written
  var SEP = ' | ';
  var MEDIA = 'https://soydgxrrwozmiqzutypr.supabase.co/storage/v1/object/public/media/products/';
  /* Filled-in examples at the top of every export and template. Import skips any handle that starts with "example-". */
  var SAMPLE = [
    { handle: 'example-cotton-bath-towel', name: 'EXAMPLE – Cotton Bath Towel, Set of 2 – Blue', type: 'simple', category: 'Towels', subcategory: 'Towels',
      sku: 'EX-TWL-BL', price: '34.00', sale_price: '29.99', stock: 25,
      images: MEDIA + 'willow-collection-bath-towels-set-of-2-2/2026/twi2pc27bl-liv-mb2q2o.webp' + SEP + MEDIA + 'willow-collection-bath-towels-set-of-2-2/2026/twi2pc27bl-wbg-mj4pxs.webp',
      description: 'Soft, absorbent cotton bath towels. (Sample row: copy it, change the handle, then fill in your product.)',
      features: '100% cotton' + SEP + '630 GSM, thick and plush' + SEP + 'Size: 27 x 54 inches', care: 'Machine wash cold. Tumble dry low.',
      material: '100% cotton', origin: 'India', badge: 'New', featured: 'no', hidden: 'yes',
      seo_title: 'Cotton Bath Towels, Set of 2', seo_description: 'Soft, absorbent 630 GSM cotton bath towels.', image_alt: 'Two folded blue cotton bath towels' },
    { handle: 'example-bath-rug-collection', name: 'EXAMPLE – Striped Bath Rug', type: 'collection', category: 'Rugs', subcategory: 'Bath Rugs',
      sku: 'EX-RUG-BL-2020', color: 'Blue', size: '20"x20"', price: '19.99', stock: 10, badge: 'Best Seller',
      images: MEDIA + 'gradiation-rug-collection/2026/bgrd2020bl-s3wj4i.webp',
      description: 'A collection: one row per color × size. Product details go on the first row; later rows only need handle, sku, color, size, price and stock.',
      features: 'Soft cotton' + SEP + 'Non-slip backing', care: 'Machine wash cold.', material: '100% cotton', origin: 'India', featured: 'no', hidden: 'yes' },
    { handle: 'example-bath-rug-collection', sku: 'EX-RUG-BL-2134', color: 'Blue', size: '21"x34"', price: '24.99', stock: 8,
      images: MEDIA + 'gradiation-rug-collection/2026/bgrd2134bl-zz8k6x.webp' },
    { handle: 'example-bath-rug-collection', sku: 'EX-RUG-PK-2020', color: 'Pink', size: '20"x20"', price: '19.99', stock: 0 }
  ];
  var isSample = function (h) { return /^example-/i.test(String(h || '').trim()); };
  function sampleRows() { return SAMPLE.map(function (o) { return COLS.map(function (k) { return o[k] == null ? '' : o[k]; }); }); }
  var CLEAR = /^(none|clear|-)$/i;

  function isColl(p) { return Array.isArray(p.options) && p.options.some(function (o) { return o.type === 'color'; }) && p.options.some(function (o) { return o.type === 'size'; }); }
  function optC(p) { return p.options.find(function (o) { return o.type === 'color'; }); }
  function optS(p) { return p.options.find(function (o) { return o.type === 'size'; }); }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o || {}, k); }
  function str(v) { return String(v == null ? '' : v).trim(); }
  function same(a, b) { return str(a).toLowerCase() === str(b).toLowerCase(); }
  function money(v) { v = str(v).replace(/[$,\s]/g, ''); if (!v) return null; var n = Number(v); return isFinite(n) ? Math.round(n * 100) / 100 : NaN; }
  function list(v) { return str(v).split(/\s*\|\s*/).map(str).filter(Boolean); }
  function photos(arr, primary) {
    var l = (arr || []).map(str).filter(Boolean), pu = str((arr || [])[primary || 0]);
    if (pu && l.indexOf(pu) > 0) { l.splice(l.indexOf(pu), 1); l.unshift(pu); } // main photo first
    return l;
  }
  function pad8(l) { l = l.slice(0, 8); while (l.length < 8) l.push(''); return l; }

  /* ================================================================ *
   * Export
   * ================================================================ */
  function exportTable() {
    var d = A.draft, inv = d.inventory || {}, rows = [COLS.slice()].concat(sampleRows());
    var stock = function (k) { return k && has(inv, k) ? inv[k] : ''; };
    d.products.forEach(function (p) {
      var c = d.categories.find(function (x) { return x.id === p.categoryId; });
      var sub = c && (c.subcategories || []).find(function (s) { return s.id === p.subcategoryId; });
      var base = {
        handle: p.slug, name: p.name, category: c ? c.name : '', subcategory: sub ? sub.name : '',
        description: p.description || '', features: (p.features || []).join(SEP), care: p.care || '', material: p.material || '',
        origin: p.origin || '', weight: p.weight == null ? '' : p.weight, badge: p.badge || '', featured: p.featured ? 'yes' : 'no',
        hidden: p.hidden ? 'yes' : 'no', seo_title: p.seoTitle || '', seo_description: p.seoDescription || '', image_alt: p.imageAlt || ''
      };
      var push = function (o) { rows.push(COLS.map(function (k) { return o[k] == null ? '' : o[k]; })); };
      if (isColl(p)) {
        optC(p).values.forEach(function (col) {
          optS(p).values.forEach(function (sz) {
            var v = (p.variants || {})[col.id + '__' + sz.id] || {};
            if (v.off === true) return;
            var price = v.price != null ? v.price : sz.price != null ? sz.price : p.basePrice;
            var sale = v.salePrice != null ? v.salePrice : sz.salePrice != null ? sz.salePrice : p.baseSalePrice;
            push(Object.assign({}, base, { type: 'collection', sku: v.sku || '', color: col.label, color_hex: col.hex || '', size: sz.label,
              price: price, sale_price: sale, stock: stock(v.sku), images: photos(v.images, v.primary).join(SEP), color_images: photos(col.images, col.primary).join(SEP) }));
          });
        });
      } else {
        var key = p.sku && has(inv, p.sku) ? p.sku : has(inv, p.id) ? p.id : p.sku;
        push(Object.assign({}, base, { type: 'simple', sku: p.sku || '', price: p.price, sale_price: p.salePrice, stock: stock(key), images: photos(p.images, p.primary).join(SEP) }));
      }
    });
    return rows;
  }

  A.actions['products-export'] = function () {
    var rows = exportTable();
    // The BOM makes Excel read the file as UTF-8 (dashes, ×, curly quotes).
    A.download('home-weavers-products-' + A.today() + '.csv', '﻿' + A.toCsv(rows), 'text/csv;charset=utf-8');
    u.toast('Exported ' + (rows.length - 1 - SAMPLE.length) + ' rows (one per SKU), with sample rows at the top');
  };
  A.actions['products-template'] = function () {
    A.download('home-weavers-products-template.csv', '\ufeff' + A.toCsv([COLS.slice()].concat(sampleRows())), 'text/csv;charset=utf-8');
  };

  /* ================================================================ *
   * Import
   * ================================================================ */
  async function readCsv(file) {
    var text = await A.readFile(file);
    // "CSV (Comma delimited)" from Excel is Windows-1252, not UTF-8: read it again with that encoding.
    if (/�/.test(text)) {
      text = await new Promise(function (resolve, reject) {
        var fr = new FileReader();
        fr.onload = function () { resolve(fr.result); };
        fr.onerror = function () { reject(new Error('Could not read that file')); };
        fr.readAsText(file, 'windows-1252');
      });
    }
    return A.parseCsv(text);
  }

  function plan(table) {
    var d = A.draft, head = (table[0] || []).map(function (h) { return str(h).toLowerCase().replace(/[\s-]+/g, '_'); });
    if (head.indexOf('handle') < 0 && head.indexOf('name') < 0) return { fatal: 'The first row must be the column names (download the template or an export to see them).' };
    var unknown = head.filter(function (h) { return h && COLS.indexOf(h) < 0 && OLD_COLS.indexOf(h) < 0; });

    // Rows → objects; group by handle.
    var groups = {}, order = [], samples = 0;
    table.slice(1).forEach(function (cells, i) {
      if (!cells.some(function (c) { return str(c); })) return;
      var r = { line: i + 2 };
      head.forEach(function (h, j) {
        var v = str(cells[j]);
        if (/^'[=+\-@]/.test(v)) v = v.slice(1); // undo the export's spreadsheet-formula guard
        r[h] = v;
      });
      if (isSample(r.handle)) { samples++; return; }
      var h = u.slugify(r.handle || r.name).slice(0, 80);
      if (!h) { groups['#' + r.line] = { handle: '', rows: [r] }; order.push('#' + r.line); return; }
      if (!groups[h]) { groups[h] = { handle: h, rows: [] }; order.push(h); }
      groups[h].rows.push(r);
    });

    // Every SKU in the catalog → product id, to catch duplicates.
    var owner = {};
    d.products.forEach(function (p) {
      if (p.sku) owner[p.sku] = p.id;
      Object.keys(p.variants || {}).forEach(function (k) { if (p.variants[k].sku) owner[p.variants[k].sku] = p.id; });
    });
    var fileSkus = {};

    var out = order.map(function (key) { return build(groups[key], owner, fileSkus); });
    return { groups: out, unknown: unknown, samples: samples };
  }

  function build(g, owner, fileSkus) {
    var d = A.draft, errors = [], rows = g.rows;
    var res = { handle: g.handle, lines: rows.map(function (r) { return r.line; }), errors: errors, stock: {}, isNew: false };
    if (!g.handle) { errors.push('Line ' + rows[0].line + ': needs a handle or a name'); return res; }
    var existing = d.products.find(function (p) { return p.slug === g.handle || (p.oldSlugs || []).indexOf(g.handle) >= 0; });
    var first = function (k) { for (var i = 0; i < rows.length; i++) if (rows[i][k]) return rows[i][k]; return ''; };
    var wantColl = rows.some(function (r) { return r.color || r.size; }) || /^coll/i.test(first('type'));
    if (first('type') && !/^(simple|coll)/i.test(first('type'))) errors.push('Type must be simple or collection');

    var p = existing ? A.clone(existing) : null;
    if (existing && isColl(existing) !== wantColl) {
      errors.push('“' + existing.name + '” is a ' + (isColl(existing) ? 'collection' : 'simple product') + '; import can’t change that (use Combine or edit it in the admin)');
      return res;
    }
    if (!p) {
      res.isNew = true;
      p = { id: u.uid('p'), name: '', slug: g.handle, sku: '', description: '', categoryId: null, subcategoryId: null, badge: '', featured: false, hidden: false,
        swatch: '#C9BBA6', inStock: true, material: '', care: '', origin: '', weight: null, features: [], seoTitle: '', seoDescription: '', imageAlt: '', oldSlugs: [] };
      if (d.products.some(function (x) { return x.slug === g.handle; })) errors.push('Handle “' + g.handle + '” is taken');
      if (wantColl) { p.options = [{ id: u.uid('o'), name: 'Color', type: 'color', values: [] }, { id: u.uid('o'), name: 'Size', type: 'size', values: [] }]; p.variants = {}; p.basePrice = 0; p.skuPrefix = ''; }
      else { p.price = null; p.salePrice = null; p.images = []; p.image = ''; p.primary = 0; p.video = ''; }
    }

    // ---- product fields (blank = keep) ----
    var text = { name: 'name', description: 'description', care: 'care', material: 'material', origin: 'origin', seo_title: 'seoTitle', seo_description: 'seoDescription', image_alt: 'imageAlt' };
    if (first('badge')) {
      var bv = first('badge'), known = HW.m.BADGES.find(function (b) { return same(b, bv); });
      if (CLEAR.test(bv)) p.badge = '';
      else if (known) p.badge = known;
      else errors.push('Badge “' + bv + '” isn’t in the list: ' + HW.m.BADGES.join(', ') + ' (or none)');
    }
    Object.keys(text).forEach(function (k) { var v = first(k); if (v) p[text[k]] = CLEAR.test(v) && k !== 'name' ? '' : v; });
    if (first('features')) p.features = CLEAR.test(first('features')) ? [] : list(first('features'));
    ['featured', 'hidden'].forEach(function (k) {
      var v = first(k); if (!v) return;
      if (/^(y|yes|true|1)$/i.test(v)) p[k] = true; else if (/^(n|no|false|0)$/i.test(v)) p[k] = false; else errors.push(k + ' must be yes or no (got “' + v + '”)');
    });
    if (first('weight')) { var w = money(first('weight')); if (isNaN(w) || w < 0) errors.push('Weight “' + first('weight') + '” isn’t a number'); else p.weight = w; }
    if (!str(p.name)) errors.push('Name is required');
    if (first('category')) {
      var cat = d.categories.find(function (c) { return same(c.name, first('category')) || same(c.slug, first('category')); });
      if (!cat) errors.push('Unknown category “' + first('category') + '” — add it under Categories first');
      else {
        if (p.categoryId !== cat.id) { p.categoryId = cat.id; p.subcategoryId = cat.subcategories[0] ? cat.subcategories[0].id : null; }
        if (first('subcategory')) {
          var sub = cat.subcategories.find(function (s) { return same(s.name, first('subcategory')) || same(s.slug, first('subcategory')); });
          if (!sub) errors.push('Unknown subcategory “' + first('subcategory') + '” in ' + cat.name); else p.subcategoryId = sub.id;
        }
      }
    } else if (!p.categoryId) errors.push('Category is required for a new product');

    var checkUrls = function (l, line) { l.forEach(function (x) { if (!/^https:\/\/\S+$/i.test(x)) errors.push('Line ' + line + ': image “' + HW.seo.clip(x, 40) + '” must be an https:// link'); }); return l; };
    var takeSku = function (sku, line, keyId) {
      if (!sku) return;
      if (owner[sku] && owner[sku] !== p.id) errors.push('Line ' + line + ': SKU ' + sku + ' already belongs to another product');
      if (fileSkus[sku] && fileSkus[sku] !== keyId) errors.push('Line ' + line + ': SKU ' + sku + ' appears twice in the file');
      fileSkus[sku] = keyId;
    };
    var takeStock = function (r, key) {
      if (!r.stock) return;
      if (!/^\d{1,7}$/.test(r.stock)) { errors.push('Line ' + r.line + ': stock “' + r.stock + '” must be a whole number, 0 or more'); return; }
      if (!key) { errors.push('Line ' + r.line + ': stock needs a SKU'); return; }
      res.stock[key] = parseInt(r.stock, 10);
    };
    var priceOf = function (r, k) {
      var v = r[k]; if (!v) return undefined;
      if (k === 'sale_price' && CLEAR.test(v)) return null;
      var n = money(v);
      if (isNaN(n) || !(n > 0)) { errors.push('Line ' + r.line + ': ' + k.replace('_', ' ') + ' “' + v + '” must be a number above 0'); return undefined; }
      return n;
    };

    if (!wantColl) {
      if (rows.length > 1) errors.push('A simple product has one row (lines ' + res.lines.join(', ') + '); use color/size columns for a collection');
      var r = rows[0];
      if (r.sku) { takeSku(r.sku, r.line, p.id); p.sku = r.sku; }
      var pr = priceOf(r, 'price'), sa = priceOf(r, 'sale_price');
      if (pr !== undefined) p.price = pr;
      if (sa !== undefined) p.salePrice = sa;
      if (!(p.price > 0)) errors.push('Price is required');
      if (p.salePrice != null && p.salePrice >= p.price) errors.push('Sale price must be lower than the price');
      if (r.images && list(r.images).join('|') !== photos(p.images, p.primary).join('|')) { p.images = checkUrls(list(r.images), r.line); p.primary = 0; p.image = p.images[0] || ''; }
      takeStock(r, p.sku || p.id);
    } else {
      var cOpt = optC(p), sOpt = optS(p), newSizes = {};
      rows.forEach(function (r) {
        if (!r.color || !r.size) { errors.push('Line ' + r.line + ': a collection row needs both color and size'); return; }
        var col = cOpt.values.find(function (c) { return same(c.label, r.color); });
        if (!col) { col = { id: u.uid('cl'), label: r.color, hex: '#C9BBA6', images: pad8([]), primary: 0, video: '' }; cOpt.values.push(col); }
        if (r.color_hex && !same(r.color_hex, col.hex)) { if (/^#[0-9a-f]{6}$/i.test(r.color_hex)) col.hex = r.color_hex.toUpperCase(); else errors.push('Line ' + r.line + ': color_hex must look like #5E86B5'); }
        if (r.color_images && list(r.color_images).join('|') !== photos(col.images, col.primary).join('|')) { col.images = pad8(checkUrls(list(r.color_images), r.line)); col.primary = 0; }
        var sz = sOpt.values.find(function (s) { return same(s.label, r.size); });
        if (!sz) { sz = { id: u.uid('sz'), label: r.size, price: null, salePrice: null }; sOpt.values.push(sz); newSizes[sz.id] = 1; }
        var key = col.id + '__' + sz.id;
        p.variants = p.variants || {};
        var v = p.variants[key] = p.variants[key] || {};
        delete v.off; // a row in the file means this color/size is sold
        if (r.sku) { takeSku(r.sku, r.line, p.id + key); v.sku = r.sku; }
        // Price: unchanged values are left alone. A new size takes its price from its first row; any other
        // different price becomes that color/size's own price, so other colors keep theirs.
        [['price', 'price', 'basePrice'], ['sale_price', 'salePrice', 'baseSalePrice']].forEach(function (f) {
          var val = priceOf(r, f[0]); if (val === undefined) return;
          var eff = v[f[1]] != null ? v[f[1]] : sz[f[1]] != null ? sz[f[1]] : p[f[2]];
          if (val === null) { if (eff != null) { delete v[f[1]]; sz[f[1]] = null; p[f[2]] = null; } return; }
          if (val === eff) return;
          if (newSizes[sz.id] && sz[f[1]] == null) sz[f[1]] = val;
          if (sz[f[1]] === val) delete v[f[1]]; else v[f[1]] = val;
        });
        if (r.images && list(r.images).join('|') !== photos(v.images, v.primary).join('|')) { v.images = checkUrls(list(r.images), r.line); v.primary = 0; }
        takeStock(r, v.sku);
        if (!Object.keys(v).length) delete p.variants[key];
      });
      // Every color × size must end up with a price, and sale below price.
      cOpt.values.forEach(function (c) {
        sOpt.values.forEach(function (s) {
          var o = p.variants[c.id + '__' + s.id] || {};
          if (o.off === true) return;
          var pr2 = o.price != null ? o.price : s.price != null ? s.price : p.basePrice;
          var sa2 = o.salePrice != null ? o.salePrice : s.salePrice != null ? s.salePrice : p.baseSalePrice;
          if (!(pr2 > 0)) errors.push(c.label + ' / ' + s.label + ' has no price');
          else if (sa2 != null && sa2 >= pr2) errors.push(c.label + ' / ' + s.label + ': sale price must be lower than the price');
        });
      });
    }

    res.product = p;
    var before = existing ? JSON.stringify(existing) : '';
    var stockChanged = Object.keys(res.stock).filter(function (k) { return d.inventory[k] !== res.stock[k]; });
    res.changed = res.isNew || JSON.stringify(p) !== before || stockChanged.length > 0;
    res.stockChanges = stockChanged.length;
    res.name = p.name;
    return res;
  }

  A.actions['products-import'] = async function () {
    if (A.isDirty && A.isDirty()) { if (!confirm('You have unsaved changes. The import saves the store, including them. Continue?')) return; }
    var file = await A.pickFile('.csv,text/csv');
    if (!file) return;
    var table;
    try { table = await readCsv(file); } catch (e) { u.toast(e.message); return; }
    var pl = plan(table);
    if (pl.fatal) { A.alert([pl.fatal]); return; }
    var good = pl.groups.filter(function (g) { return !g.errors.length && g.changed; });
    var bad = pl.groups.filter(function (g) { return g.errors.length; });
    var same0 = pl.groups.filter(function (g) { return !g.errors.length && !g.changed; });
    var nNew = good.filter(function (g) { return g.isNew; }).length;
    var row = function (g) {
      var what = g.errors.length ? '✗ ' + g.errors.map(esc).join('<br>✗ ')
        : !g.changed ? 'No changes'
        : (g.isNew ? '✓ New product' : '✓ Update') + (g.stockChanges ? ' · stock for ' + g.stockChanges + ' SKU' + (g.stockChanges === 1 ? '' : 's') : '');
      return '<tr class="' + (g.errors.length ? 'errrow' : '') + '"><td>' + (g.lines.length > 3 ? g.lines[0] + '–' + g.lines[g.lines.length - 1] : g.lines.join(', ')) + '</td>' +
        '<td>' + esc(HW.seo.clip(g.name || g.handle || '—', 60)) + '</td><td>' + what + '</td></tr>';
    };
    A.modal({
      title: 'Product import: ' + file.name,
      body: '<p><b class="ok">' + good.length + ' product' + (good.length === 1 ? '' : 's') + ' ready</b> (' + nNew + ' new, ' + (good.length - nNew) + ' updated)' +
        (same0.length ? ' · ' + same0.length + ' unchanged' : '') + (bad.length ? ' · <b class="bad">' + bad.length + ' with errors (skipped)</b>' : '') + '</p>' +
        (pl.samples ? '<p class="hint">' + pl.samples + ' sample row' + (pl.samples === 1 ? '' : 's') + ' (handle starting with “example-”) skipped.</p>' : '') +
        (pl.unknown.length ? '<p class="hint">Ignored columns: ' + pl.unknown.map(esc).join(', ') + '</p>' : '') +
        '<div class="tablewrap" style="max-height:360px;overflow:auto"><table class="vartable"><thead><tr><th>Lines</th><th>Product</th><th>Result</th></tr></thead><tbody>' +
        bad.concat(good, same0).map(row).join('') + '</tbody></table></div>' +
        (good.length ? '<p class="hint">Nothing is deleted. Blank cells kept their current values. Applying saves the store immediately — export first if you want a copy of the current catalog.</p>' : ''),
      buttons: good.length ? [{ label: 'Import ' + good.length + ' product' + (good.length === 1 ? '' : 's') + ' and save', cls: 'loom', onClick: async function () {
        good.forEach(function (g) {
          var i = A.draft.products.findIndex(function (x) { return x.id === g.product.id; });
          if (i >= 0) A.draft.products[i] = g.product; else A.draft.products.push(g.product);
          var p = g.product;
          // Simple product: stock kept under the old internal id moves to the real SKU.
          if (!isColl(p) && p.sku && A.draft.inventory[p.id] != null && A.draft.inventory[p.sku] == null) { A.draft.inventory[p.sku] = A.draft.inventory[p.id]; delete A.draft.inventory[p.id]; }
          Object.keys(g.stock).forEach(function (k) { A.draft.inventory[k] = g.stock[k]; });
        });
        if (await A.saveStore('Imported ' + good.length + ' product' + (good.length === 1 ? '' : 's'))) A.render();
      } }] : []
    });
  };

  A._productCsv = { exportTable: exportTable, plan: plan }; // for tests

  /* What each column means, in the admin (a CSV can't carry notes). */
  var HELP = [
    ['handle', 'The product’s web address (…/product/<b>handle</b>). Rows with the same handle are one product. For a new product, type any short name with dashes, e.g. <code>blue-bath-towel</code>. Don’t change it on existing products — it’s how the import finds them.'],
    ['name', 'Product name shown in the store.'],
    ['type', '<code>simple</code> (one SKU) or <code>collection</code> (colors × sizes, one row each).'],
    ['category / subcategory', 'Must match names under Categories.'],
    ['sku', 'Your SKU for this row.'],
    ['color / size', 'Collections only: the color name and size name of this row.'],
    ['price / sale_price', 'In dollars. Leave sale_price empty for no sale; type <code>none</code> to remove a sale.'],
    ['stock', 'Quantity on hand (whole number).'],
    ['images', 'Photo links for this SKU (https://…), separated by <code> | </code>. The first is the main photo.'],
    ['description / features / care / material / origin', 'Product text. Features: one bullet per item, separated by <code> | </code>.'],
    ['badge', 'Optional label on the product card. One of: ' + HW.m.BADGES.map(function (b) { return '<code>' + b + '</code>'; }).join(', ') + '. Type <code>none</code> to remove it.'],
    ['featured', '<code>yes</code> puts it in “Featured this season” on the homepage.'],
    ['hidden', '<code>yes</code> keeps it off the store (a draft) — handy for new products until photos are ready.'],
    ['seo_title / seo_description', 'Optional title and summary for Google. Leave empty to use the name and description.'],
    ['image_alt', 'Optional description of the main photo for screen readers and Google.']
  ];
  A.actions['products-csv-help'] = function () {
    A.modal({
      title: 'Product CSV columns',
      body: '<p class="hint">One row per SKU. A blank cell keeps what’s there now; import never deletes products. Only <b>handle</b> is needed on every row — the other columns can be left out of the file.</p>' +
        '<p class="hint">Every export and the template start with filled-in <b>sample rows</b> (handles starting with <code>example-</code>). Copy one, change the handle and the values, and upload — the samples themselves are always skipped.</p>' +
        '<div class="tablewrap" style="max-height:420px;overflow:auto"><table class="vartable"><thead><tr><th>Column</th><th>What it is</th><th>Example</th></tr></thead><tbody>' +
        HELP.map(function (h) {
          var ex = h[0].split(' / ').map(function (k) { var v = SAMPLE[0][k] != null && SAMPLE[0][k] !== '' ? SAMPLE[0][k] : SAMPLE[1][k]; return v == null || v === '' ? '' : HW.seo.clip(String(v).replace(MEDIA, 'https://…/'), 60); }).filter(Boolean).join(' / ');
          return '<tr><th scope="row" style="white-space:nowrap;vertical-align:top"><code>' + esc(h[0]) + '</code></th><td>' + h[1] + '</td><td style="vertical-align:top"><code>' + esc(ex) + '</code></td></tr>';
        }).join('') +
        '</tbody></table></div>',
      buttons: []
    });
  };

  A.productCsvButtons = function () {
    return '<button class="btn ghost sm" type="button" data-a="products-export" title="One row per SKU — opens in Excel or Google Sheets">⬇ Export CSV</button>' +
      '<button class="btn ghost sm" type="button" data-a="products-import">⬆ Import CSV</button>' +
      '<button class="txtbtn" type="button" data-a="products-template">Template</button>' +
      '<button class="txtbtn" type="button" data-a="products-csv-help">Columns?</button>';
  };
})(window.HW = window.HW || {});
