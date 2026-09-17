/* Home Weavers — admin: Products (list, bulk actions, editor with variants, combine simple → collection). */
(function (HW) {
  'use strict';

  var A = HW.A, u = HW.u, esc = u.esc, m = HW.m;
  var SWATCH = ['#9FB3A6', '#C9BBA6', '#B7C2C9', '#A88C6E', '#8A9B8E', '#D8CDBA', '#CBC0AC', '#B59F84', '#C7C6BE'];
  var listState = { q: '', cat: '', selected: {} };

  function withDraft(fn) { var s = HW.DB; HW.DB = A.draft; try { return fn(); } finally { HW.DB = s; } }
  function isColl(p) { return Array.isArray(p.options) && p.options.some(function (o) { return o.type === 'color'; }) && p.options.some(function (o) { return o.type === 'size'; }); }
  function optC(p) { return p.options.find(function (o) { return o.type === 'color'; }); }
  function optS(p) { return p.options.find(function (o) { return o.type === 'size'; }); }
  function blank8() { return ['', '', '', '', '', '', '', '']; }
  function num(v) { if (v === '' || v == null) return null; var n = parseFloat(v); return isNaN(n) ? null : n; }
  function keepScroll(fn) { var y = window.scrollY; fn(); window.scrollTo(0, y); }

  /* ================================================================ *
   * List
   * ================================================================ */
  function list() {
    var d = A.draft;
    var q = listState.q.toLowerCase();
    var rows = (d.products || []).map(function (p, i) { return { p: p, i: i }; }).filter(function (r) {
      if (listState.cat && r.p.categoryId !== listState.cat) return false;
      if (q && (r.p.name + ' ' + (r.p.sku || '') + ' ' + JSON.stringify(r.p.variants || {})).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var selIds = Object.keys(listState.selected).filter(function (id) { return listState.selected[id] && d.products.some(function (p) { return p.id === id; }); });
    var selSimple = selIds.filter(function (id) { var p = d.products.find(function (x) { return x.id === id; }); return p && !isColl(p); });
    return '<h1 class="h1row">Products <button class="btn loom sm" type="button" data-a="product-new">+ Add product</button></h1>' +
      '<p class="sub">Your catalog. A collection holds many color &amp; size variations, each its own SKU.</p>' +
      '<section class="panel" style="padding:14px 16px">' +
      '<div class="toolbar"><label class="sr-only" for="pSearch">Search products</label><input id="pSearch" type="search" placeholder="Search name or SKU" value="' + esc(listState.q) + '">' +
      '<label class="sr-only" for="pCat">Category</label><select id="pCat"><option value="">All categories</option>' + d.categories.map(function (c) {
        return '<option value="' + esc(c.id) + '"' + (listState.cat === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>';
      }).join('') + '</select>' +
      '<span class="spacer"></span>' +
      '<span class="hint">' + selIds.length + ' selected</span>' +
      '<button class="btn ghost sm" type="button" data-a="product-combine"' + (selSimple.length < 2 ? ' disabled title="Select 2 or more simple products"' : '') + '>Combine into collection</button>' +
      '<button class="btn ghost sm dangerbtn" type="button" data-a="product-bulk-delete"' + (!selIds.length ? ' disabled' : '') + '>Delete selected</button></div>' +
      '<div class="tablewrap"><table class="adt"><thead><tr>' +
      '<th><input type="checkbox" id="pSelAll" aria-label="Select all shown"' + (rows.length && rows.every(function (r) { return listState.selected[r.p.id]; }) ? ' checked' : '') + '></th>' +
      '<th><span class="sr-only">Photo</span></th><th>Name</th><th>Category</th><th>Price</th><th>Type / status</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>' +
      (rows.length ? rows.map(function (r) {
        var p = r.p;
        return withDraft(function () {
          var c = m.categoryById(p.categoryId), coll = m.isCollection(p), pr = m.priceRange(p), out = m.productOut(p);
          var sub = c && (c.subcategories || []).find(function (s) { return s.id === p.subcategoryId; });
          var sale = coll ? (p.baseSalePrice != null || Object.keys(p.variants || {}).some(function (k) { return p.variants[k].salePrice != null; })) : (p.salePrice != null && p.salePrice < p.price);
          return '<tr><td><input type="checkbox" data-sel="' + esc(p.id) + '" aria-label="Select ' + esc(HW.seo.clip(p.name, 40)) + '"' + (listState.selected[p.id] ? ' checked' : '') + '></td>' +
            '<td><img class="thumbsm" src="' + esc(HW.asset(m.imageOrSwatch(p))) + '" alt="" loading="lazy"></td>' +
            '<td><div style="font-weight:600">' + esc(HW.seo.clip(p.name, 90)) + (p.name.length > 80 ? ' <span class="tag clay" title="Name is ' + p.name.length + ' characters">Long name</span>' : '') + '</div>' +
            '<div class="muted" style="font-size:12px">' + (coll ? m.optColor(p).values.length + ' colors · ' + m.optSize(p).values.length + ' sizes' : 'SKU: ' + (p.sku ? esc(p.sku) : '<b style="color:var(--clay)">missing</b>')) + (sub ? ' · ' + esc(sub.name) : '') + '</div></td>' +
            '<td>' + esc(c ? c.name : '—') + '</td>' +
            '<td>' + (pr.min === pr.max ? u.money(pr.min) : u.money(pr.min) + '–' + u.money(pr.max)) + '</td>' +
            '<td>' + (coll ? A.ui.tag(m.optColor(p).values.length + '×' + m.optSize(p).values.length + ' variants', 'green') : A.ui.tag('Simple')) + ' ' +
            (p.hidden ? A.ui.tag('Hidden', 'clay') + ' ' : '') + (p.featured ? A.ui.tag('Featured', 'green') + ' ' : '') + (sale ? A.ui.tag('Sale', 'clay') + ' ' : '') + (out ? A.ui.tag('Out of stock', 'clay') : '') + '</td>' +
            '<td class="rowbtns"><button class="txtbtn" type="button" data-a="product-edit" data-id="' + esc(p.id) + '">Edit</button>' +
            '<button class="txtbtn" type="button" data-a="product-dup" data-id="' + esc(p.id) + '">Duplicate</button>' +
            '<button class="txtbtn danger" type="button" data-a="product-delete" data-id="' + esc(p.id) + '">Delete</button></td></tr>';
        });
      }).join('') : '<tr><td colspan="7" class="muted" style="padding:20px">No products match.</td></tr>') +
      '</tbody></table></div></section>' + A.ui.saveBtn();
  }

  function wireList() {
    var s = document.getElementById('pSearch'), c = document.getElementById('pCat'), all = document.getElementById('pSelAll');
    if (s) s.addEventListener('input', u.debounce(function () { listState.q = s.value; var pos = s.selectionStart; A.render(); var n = document.getElementById('pSearch'); n.focus(); n.setSelectionRange(pos, pos); }, 250));
    if (c) c.addEventListener('change', function () { listState.cat = c.value; A.render(); });
    u.qsa('#adminMain input[data-sel]').forEach(function (cb) {
      cb.addEventListener('change', function () { listState.selected[cb.dataset.sel] = cb.checked; keepScroll(A.render); });
    });
    if (all) all.addEventListener('change', function () {
      u.qsa('#adminMain input[data-sel]').forEach(function (cb) { listState.selected[cb.dataset.sel] = all.checked; });
      keepScroll(A.render);
    });
  }

  /* ================================================================ *
   * Editor
   * ================================================================ */
  function photoGrid(bindBase, images, primary, actionPrimary, extra) {
    var imgs = (images || []).slice(0, 8); while (imgs.length < 8) imgs.push('');
    return '<div class="photogrid8">' + imgs.map(function (url, i) {
      var id = 'ph_' + bindBase.replace(/[^a-z0-9]/gi, '_') + '_' + i;
      var isPrim = (primary || 0) === i;
      return '<div class="photoslot' + (isPrim && url ? ' isprim' : '') + '">' +
        (url ? '<img class="slotthumb" src="' + esc(HW.asset(url)) + '" alt="" loading="lazy" data-check-img>' : '<span class="slotthumb empty" aria-hidden="true"></span>') +
        '<label class="sr-only" for="' + id + '">Photo ' + (i + 1) + ' URL</label>' +
        '<input id="' + id + '" type="text" value="' + esc(url) + '" placeholder="Photo ' + (i + 1) + '" data-bind="' + bindBase + '.' + i + '" data-type="trim">' +
        '<button class="pstar' + (isPrim ? ' on' : '') + '" type="button" title="Use as the default photo" aria-label="Make photo ' + (i + 1) + ' the default" aria-pressed="' + isPrim + '" data-a="' + actionPrimary + '" data-i="' + i + '"' + (extra || '') + '>★</button>' +
        '<button class="pup" type="button" data-a="upload" data-for="' + id + '" data-folder="products" data-max="1600" aria-label="Upload photo ' + (i + 1) + '">⤒</button></div>';
    }).join('') + '</div>';
  }

  function simplePanels(p) {
    var ui = A.ui;
    return ui.panel('Pricing &amp; SKU',
      '<div class="grid3">' + ui.field('Price ($)', '@price', p.price, { type: 'number', min: 0 }) +
      ui.field('Sale price ($, optional)', '@salePrice', p.salePrice, { type: 'number', min: 0, hint: 'Blank = no sale.' }) +
      ui.field('SKU', '@sku', p.sku, { type: 'trim', hint: p.sku ? 'Stock is tracked by this code in Inventory.' : '<span class="bad">Required — enter your real SKU (e.g. TWI2PC27BL).</span>' }) + '</div>' +
      ui.check('In stock (used when this SKU has no stock count in Inventory)', '@inStock', p.inStock !== false)) +
      ui.panel('Photos &amp; video',
        '<p class="hint" style="margin:-6px 0 12px">Up to 8 photos. ★ = default photo. ⤒ = upload (converted to WebP). Square 1600 × 1600 px recommended.</p>' +
        photoGrid('@images', p.images, p.primary, 'p-primary') +
        '<div class="grid2" style="margin-top:12px">' + ui.field('Video URL (optional)', '@video', p.video, { type: 'trim', placeholder: 'YouTube / Vimeo / .mp4' }) +
        ui.field('Swatch color (fallback when no photo)', '@swatch', p.swatch || '#C9BBA6', { inputType: 'color' }) + '</div>');
  }

  function collectionPanels(p) {
    var ui = A.ui, cOpt = optC(p), sOpt = optS(p);
    var oldColorPhotos = cOpt.values.reduce(function (a, c) { return a + (c.images || []).filter(Boolean).length; }, 0);
    return ui.panel('Base pricing',
      '<div class="grid3">' + ui.field('Base price ($)', '@basePrice', p.basePrice, { type: 'number', min: 0, hint: 'Used for any size without its own price.' }) +
      ui.field('Base sale price ($)', '@baseSalePrice', p.baseSalePrice, { type: 'number', min: 0 }) +
      ui.field('SKU prefix', '@skuPrefix', p.skuPrefix, { type: 'trim', hint: 'Used to suggest SKU codes.' }) + '</div>') +

      '<section class="panel"><h2 class="ph3">Colors — ' + cOpt.values.length + '</h2>' +
      '<p class="hint" style="margin:-6px 0 12px">Name each color and set its swatch. Photos are set per SKU under Variants.</p>' +
      cOpt.values.map(function (c, ci) {
        return '<div class="colorcard"><div class="colorhead">' +
          '<label class="sr-only" for="chex' + ci + '">Swatch for color ' + (ci + 1) + '</label><input id="chex' + ci + '" type="color" value="' + esc(c.hex || '#C9BBA6') + '" data-bind="@options.' + p.options.indexOf(cOpt) + '.values.' + ci + '.hex">' +
          '<label class="sr-only" for="clab' + ci + '">Color ' + (ci + 1) + ' name</label><input id="clab' + ci + '" type="text" value="' + esc(c.label) + '" placeholder="Color name" data-bind="@options.' + p.options.indexOf(cOpt) + '.values.' + ci + '.label">' +
          '<button class="txtbtn danger" type="button" data-a="p-color-remove" data-i="' + ci + '">Remove</button></div></div>';
      }).join('') +
      '<button class="miniadd" type="button" data-a="p-color-add">+ Add color</button>' +
      (oldColorPhotos ? '<div style="border-top:1px solid var(--line);margin-top:14px;padding-top:12px"><p class="hint" style="margin:0 0 8px">This product still has <b>' + oldColorPhotos + ' older photo' + (oldColorPhotos > 1 ? 's' : '') + '</b> stored on its colors. They’re used only for SKUs with no photos of their own.</p>' +
        '<button class="btn ghost sm dangerbtn" type="button" data-a="p-color-photos-clear">Delete the old color photos</button></div>' : '') +
      '</section>' +

      '<section class="panel"><h2 class="ph3">Sizes — ' + sOpt.values.length + '</h2>' +
      '<p class="hint" style="margin:-6px 0 12px">A per-size price overrides the base price for all colors. Blank = base price.</p>' +
      '<div class="sizerow sizehead" aria-hidden="true"><span>Size name</span><span>Price</span><span>Sale</span><span></span></div>' +
      sOpt.values.map(function (s, si) {
        var base = '@options.' + p.options.indexOf(sOpt) + '.values.' + si;
        return '<div class="sizerow">' +
          '<input type="text" value="' + esc(s.label) + '" aria-label="Size ' + (si + 1) + ' name" data-bind="' + base + '.label">' +
          '<input type="number" step="0.01" min="0" value="' + (s.price == null ? '' : s.price) + '" aria-label="Size ' + (si + 1) + ' price" data-bind="' + base + '.price" data-type="number">' +
          '<input type="number" step="0.01" min="0" value="' + (s.salePrice == null ? '' : s.salePrice) + '" aria-label="Size ' + (si + 1) + ' sale price" data-bind="' + base + '.salePrice" data-type="number">' +
          '<button class="txtbtn danger" type="button" data-a="p-size-remove" data-i="' + si + '"' + (sOpt.values.length <= 1 ? ' disabled' : '') + ' aria-label="Remove size ' + esc(s.label) + '">✕</button></div>';
      }).join('') +
      '<button class="miniadd" type="button" data-a="p-size-add">+ Add size</button></section>' +

      '<section class="panel"><h2 class="ph3">Variants (SKUs) — ' + (cOpt.values.length * sOpt.values.length) + '</h2>' +
      '<p class="hint" style="margin:-6px 0 12px">Every color × size combination. Give each its own SKU code, set stock or override price.</p>' +
      cOpt.values.map(function (c, ci) { return variantGroup(p, c, sOpt, ci === (A.openColor || 0)); }).join('') + '</section>';
  }

  function variantGroup(p, color, sOpt, open) {
    return '<details class="colgroup"' + (open ? ' open' : '') + ' data-color="' + esc(color.id) + '">' +
      '<summary><span class="swatchdot" style="background:' + esc(color.hex) + '"></span>' + esc(color.label) + ' <span class="muted" style="font-weight:400;font-size:12px">· ' + sOpt.values.length + ' sizes</span></summary>' +
      '<div class="gbody"><div class="tablewrap"><table class="vartable"><thead><tr><th>Size</th><th>SKU code</th><th>Price override</th><th>Sale override</th><th style="text-align:center">In stock</th></tr></thead><tbody>' +
      sOpt.values.map(function (s) {
        var key = color.id + '__' + s.id;
        var ov = (p.variants && p.variants[key]) || {};
        var vb = '@variants.' + key;
        var nOwn = (ov.images || []).filter(Boolean).length, nColor = (color.images || []).filter(Boolean).length;
        var def = s.price != null && s.price !== '' ? s.price : (p.basePrice || 0);
        return '<tr><td style="white-space:nowrap">' + esc(s.label) + '</td>' +
          '<td><input type="text" value="' + esc(ov.sku || '') + '" placeholder="' + esc(m.genSku(p, color, s)) + '" aria-label="SKU for ' + esc(color.label + ' ' + s.label) + '" data-bind="' + vb + '.sku" data-type="trim"></td>' +
          '<td><input type="number" step="0.01" min="0" value="' + (ov.price == null ? '' : ov.price) + '" placeholder="' + def + '" aria-label="Price for ' + esc(color.label + ' ' + s.label) + '" data-bind="' + vb + '.price" data-type="number"></td>' +
          '<td><input type="number" step="0.01" min="0" value="' + (ov.salePrice == null ? '' : ov.salePrice) + '" aria-label="Sale price for ' + esc(color.label + ' ' + s.label) + '" data-bind="' + vb + '.salePrice" data-type="number"></td>' +
          '<td style="text-align:center"><input type="checkbox"' + (ov.inStock !== false ? ' checked' : '') + ' aria-label="In stock: ' + esc(color.label + ' ' + s.label) + '" data-bind="' + vb + '.inStock"></td></tr>' +
          '<tr><td colspan="5" style="padding:0 0 10px"><details class="vphotos"' + (A.openVariant === key ? ' open' : '') + ' data-key="' + esc(key) + '">' +
          '<summary style="cursor:pointer;font-size:12.5px;padding:4px 0;color:' + (nOwn ? 'var(--loom)' : 'var(--ink-soft)') + '">📷 Photos for ' + esc(s.label) + ' — ' +
          (nOwn ? '<b>' + nOwn + ' photo' + (nOwn > 1 ? 's' : '') + '</b>' : (nColor ? 'using the color’s photos' : '<b style="color:var(--clay)">no photos yet</b>')) + '</summary>' +
          '<div style="padding:8px 0 4px">' +
          (!nOwn && nColor ? '<p class="hint" style="margin:0 0 8px">Showing the ' + esc(color.label) + ' photos. <button class="btn ghost sm" type="button" data-a="p-var-copy-color" data-key="' + esc(key) + '">Copy them here to edit</button></p>' : '') +
          photoGrid(vb + '.images', ov.images, ov.primary, 'p-var-primary', ' data-key="' + esc(key) + '"') +
          A.ui.field('Video URL (optional)', vb + '.video', ov.video || '', { type: 'trim', placeholder: 'YouTube / Vimeo / .mp4' }) +
          (nOwn ? '<div class="btnrow"><button class="btn ghost sm" type="button" data-a="p-var-copy-all" data-key="' + esc(key) + '">Copy these photos to all sizes in ' + esc(color.label) + '</button>' +
            '<button class="btn ghost sm" type="button" data-a="p-var-clear" data-key="' + esc(key) + '">Clear</button></div>' : '') +
          '</div></details></td></tr>';
      }).join('') + '</tbody></table></div></div></details>';
  }

  function editor() {
    var ui = A.ui, p = A.edit, isNew = A.editKey === 'new', d = A.draft;
    var coll = isColl(p);
    var cat = d.categories.find(function (c) { return c.id === p.categoryId; });
    var subOpts = [['', '—']].concat(((cat && cat.subcategories) || []).map(function (s) { return [s.id, s.name]; }));
    return '<h1>' + (isNew ? 'New product' : 'Edit product') + '</h1><p class="sub">' + (isNew ? 'Add an item to your catalog.' : 'Editing ' + esc(HW.seo.clip(p.name, 80)) + '.') + '</p>' +
      ui.panel('Basics',
        ui.field('Product / collection name <span class="count" id="nameCount">' + String(p.name || '').length + '/80</span>', '@name', p.name, { live: 'productName', placeholder: 'e.g. Willow Bath Towels',
          after: '<div class="hint ' + (String(p.name || '').length > 80 ? 'bad' : '') + '" id="nameWarn">' + (String(p.name || '').length > 80 ? '⚠ Over 80 characters. Long marketplace-style titles are hard to read. Put the details in the description.' : 'Keep names short and clear (under 80 characters).') + '</div>' }) +
        ui.field('URL slug', '@slug', p.slug, { type: 'slug', id: 'pSlug', live: 'productSlug', hint: 'Web address: /product/<b id="slugShow">' + esc(p.slug) + '</b>' + (p.oldSlugs && p.oldSlugs.length ? ' · Old addresses redirect here.' : '') }) +
        ui.field('Description', '@description', p.description, { textarea: true, rows: 7, hint: 'Plain text, or simple HTML: &lt;p&gt; &lt;ul&gt; &lt;ol&gt; &lt;li&gt; &lt;b&gt; &lt;strong&gt; &lt;em&gt; &lt;br&gt;. Anything else is removed on the site.' })) +
      ui.panel('Search engine listing (SEO)',
        ui.field('SEO title', '@seoTitle', p.seoTitle, { maxlength: 70, hint: 'Blank = product name. Up to 60 characters shows fully in Google.' }) +
        ui.field('Meta description', '@seoDescription', p.seoDescription, { textarea: true, rows: 2, maxlength: 200, hint: 'Blank = start of the description. 120–160 characters works best.' }) +
        ui.field('Image alt text', '@imageAlt', p.imageAlt, { maxlength: 125, hint: 'Describes the photos for screen readers and Google, e.g. “Blue zero-twist cotton bath towel folded on a bench”. Blank = product name.' })) +
      ui.panel('Placement',
        '<div class="grid2">' + ui.field('Category', '@categoryId', p.categoryId, { options: d.categories.map(function (c) { return [c.id, c.name]; }), live: 'productCat' }) +
        ui.field('Subcategory', '@subcategoryId', p.subcategoryId || '', { options: subOpts, id: 'pSub' }) + '</div>' +
        ui.field('Badge (optional)', '@badge', p.badge, { placeholder: 'e.g. New, Bestseller, Sale', maxlength: 20 }) +
        ui.check('Featured on homepage', '@featured', p.featured) + ui.check('Hide from shoppers (draft)', '@hidden', p.hidden)) +
      '<section class="panel"><h2 class="ph3">Product type</h2><div class="ptype">' +
      '<button class="' + (!coll ? 'active' : '') + '" type="button" data-a="p-type" data-type="simple" aria-pressed="' + !coll + '"><b>Simple product</b><span>One price, one set of photos.</span></button>' +
      '<button class="' + (coll ? 'active' : '') + '" type="button" data-a="p-type" data-type="collection" aria-pressed="' + coll + '"><b>Collection with variations</b><span>Color &amp; size options, each its own SKU.</span></button></div></section>' +
      (coll ? collectionPanels(p) : simplePanels(p)) +
      ui.panel('Details',
        '<div class="grid3">' + ui.field('Material', '@material', p.material) + ui.field('Origin', '@origin', p.origin) +
        ui.field('Shipping weight (g)', '@weight', p.weight, { type: 'number', min: 0, hint: 'Only needed if Snipcart calculates live shipping.' }) + '</div>' +
        ui.field('Features — one per line', '@features', (p.features || []).join('\n'), { textarea: true, rows: 5, type: 'lines' }) +
        ui.field('Care instructions — one per line', '@care', p.care, { textarea: true, rows: 4 })) +
      '<div class="btnrow stickybtns"><button class="btn loom save-btn" type="button" data-a="product-save">' + (isNew ? 'Create product' : 'Save product') + '</button>' +
      '<button class="btn ghost" type="button" data-a="product-cancel">Cancel</button></div>';
  }

  A.tabs.products = {
    render: function () { return A.edit ? editor() : list(); },
    after: function () {
      var main = document.getElementById('adminMain');
      A.wireImgChecks(main);
      if (!A.edit) { wireList(); return; }
      u.qsa('details.colgroup', main).forEach(function (dt) {
        dt.addEventListener('toggle', function () { if (dt.open) { var cs = optC(A.edit).values; A.openColor = cs.findIndex(function (c) { return c.id === dt.dataset.color; }); } });
      });
      u.qsa('details.vphotos', main).forEach(function (dt) {
        dt.addEventListener('toggle', function () { if (dt.open) A.openVariant = dt.dataset.key; });
      });
      // Photo URL typed or uploaded: refresh that slot's thumbnail without a full re-render.
      main.addEventListener('input', function (e) {
        var el = e.target;
        if (!el.closest || !el.closest('.photoslot')) return;
        var slot = el.closest('.photoslot'), th = slot.querySelector('.slotthumb');
        var url = el.value.trim();
        var fresh = document.createElement(url ? 'img' : 'span');
        fresh.className = 'slotthumb' + (url ? '' : ' empty');
        if (url) { fresh.src = HW.asset(url); fresh.alt = ''; fresh.setAttribute('data-check-img', ''); }
        th.replaceWith(fresh);
        A.wireImgChecks(slot);
      });
    }
  };

  A.live.productName = function (el) {
    var n = el.value.length;
    var c = document.getElementById('nameCount'); if (c) c.textContent = n + '/80';
    var w = document.getElementById('nameWarn');
    if (w) { w.className = 'hint ' + (n > 80 ? 'bad' : ''); w.textContent = n > 80 ? '⚠ Over 80 characters. Long marketplace-style titles are hard to read. Put the details in the description.' : 'Keep names short and clear (under 80 characters).'; }
    if (A.editKey === 'new' && !A.slugTouched) {
      var s = document.getElementById('pSlug'); if (s) { s.value = u.slugify(el.value).slice(0, 70); A.edit.slug = s.value; var sh = document.getElementById('slugShow'); if (sh) sh.textContent = s.value; }
    }
  };
  A.live.productSlug = function (el) { A.slugTouched = true; var sh = document.getElementById('slugShow'); if (sh) sh.textContent = u.slugify(el.value); };
  A.live.productCat = function (el) {
    var cat = A.draft.categories.find(function (c) { return c.id === el.value; });
    var sel = document.getElementById('pSub');
    var subs = (cat && cat.subcategories) || [];
    sel.innerHTML = '<option value="">—</option>' + subs.map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>'; }).join('');
    A.edit.subcategoryId = subs[0] ? subs[0].id : null;
    if (subs[0]) sel.value = subs[0].id;
  };

  function newTemplate() {
    var c = A.draft.categories[0];
    return { id: u.uid('p'), name: '', slug: '', sku: '', description: '', categoryId: c ? c.id : null, subcategoryId: c && c.subcategories[0] ? c.subcategories[0].id : null,
      badge: '', featured: false, hidden: false, price: null, salePrice: null, image: '', images: blank8(), video: '', primary: 0,
      swatch: SWATCH[Math.floor(Math.random() * SWATCH.length)], inStock: true, material: '', care: '', origin: '', weight: null,
      features: [], seoTitle: '', seoDescription: '', imageAlt: '', oldSlugs: [] };
  }

  function openEditor(key, obj) {
    A.edit = obj; A.editKey = key; A.slugTouched = key !== 'new'; A.openColor = 0; A.openVariant = null;
    if (!isColl(obj)) { obj.images = (obj.images || []).slice(0, 8); while (obj.images.length < 8) obj.images.push(''); }
    var start = JSON.stringify(obj);
    A.editDirty = function () { return JSON.stringify(A.edit) !== start; };
    A.commitEdit = commit;
    A.render(); window.scrollTo(0, 0);
  }
  function closeEditor() { A.edit = null; A.editKey = null; A.editDirty = null; A.commitEdit = null; }

  function uniqueSlug(slug, exceptId) {
    var base = slug || 'product', s = base, n = 2;
    while (A.draft.products.some(function (p) { return p.slug === s && p.id !== exceptId; })) s = base + '-' + (n++);
    return s;
  }

  function compact(arr, primary) {
    var list = (arr || []).map(function (x) { return String(x || '').trim(); });
    var pu = list[primary || 0];
    var out = list.filter(Boolean);
    var p = pu ? out.indexOf(pu) : 0;
    return { images: out, primary: p < 0 ? 0 : p };
  }

  function commit() {
    var p = A.clone(A.edit);
    p.name = String(p.name || '').trim();
    if (!p.name) { u.toast('Name is required'); return false; }
    var prev = A.editKey === 'new' ? null : A.draft.products.find(function (x) { return x.id === p.id; });
    p.slug = uniqueSlug(u.slugify(p.slug || p.name).slice(0, 80), p.id);
    p.oldSlugs = Array.isArray(p.oldSlugs) ? p.oldSlugs : [];
    if (prev && prev.slug !== p.slug && p.oldSlugs.indexOf(prev.slug) < 0) p.oldSlugs.push(prev.slug);
    p.features = Array.isArray(p.features) ? p.features : String(p.features || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    p.weight = num(p.weight);

    if (isColl(p)) {
      var cOpt = optC(p), sOpt = optS(p);
      if (cOpt.values.some(function (c) { return !String(c.label || '').trim(); }) || sOpt.values.some(function (s) { return !String(s.label || '').trim(); })) { u.toast('Every color and size needs a name'); return false; }
      cOpt.values.forEach(function (c) { var cp = compact(c.images, c.primary); c.images = cp.images; c.primary = cp.primary; c.video = String(c.video || '').trim(); });
      sOpt.values.forEach(function (s) { s.price = num(s.price); s.salePrice = num(s.salePrice); });
      var valid = {};
      cOpt.values.forEach(function (c) { sOpt.values.forEach(function (s) { valid[c.id + '__' + s.id] = 1; }); });
      var vs = {}, skus = {};
      for (var k in (p.variants || {})) {
        if (!valid[k]) continue;
        var o = p.variants[k], e = {};
        var pr = num(o.price), sa = num(o.salePrice), sku = String(o.sku || '').trim();
        if (pr != null) e.price = pr;
        if (sa != null) e.salePrice = sa;
        if (o.inStock === false) e.inStock = false;
        if (sku) { if (skus[sku]) { u.toast('SKU ' + sku + ' is used twice in this product'); return false; } skus[sku] = 1; e.sku = sku; }
        var cp2 = compact(o.images, o.primary);
        if (cp2.images.length) { e.images = cp2.images; if (cp2.primary) e.primary = cp2.primary; if (String(o.video || '').trim()) e.video = String(o.video).trim(); }
        if (Object.keys(e).length) vs[k] = e;
      }
      p.variants = vs;
      p.basePrice = num(p.basePrice) || 0; p.baseSalePrice = num(p.baseSalePrice);
      p.skuPrefix = String(p.skuPrefix || '').trim(); p.inStock = true;
      delete p.price; delete p.salePrice; delete p.images; delete p.image; delete p.primary; delete p.video; delete p.sku;
    } else {
      p.price = num(p.price) || 0; p.salePrice = num(p.salePrice);
      if (p.salePrice != null && p.salePrice >= p.price) { u.toast('Sale price must be lower than the price'); return false; }
      var sp = compact(p.images, p.primary);
      p.images = sp.images; p.primary = sp.primary; p.image = sp.images[sp.primary] || sp.images[0] || '';
      p.video = String(p.video || '').trim(); p.sku = String(p.sku || '').trim();
      p.inStock = p.inStock !== false;
      delete p.options; delete p.variants; delete p.basePrice; delete p.baseSalePrice; delete p.skuPrefix;
      // Stock recorded under the old internal id moves to the real SKU.
      if (p.sku && A.draft.inventory[p.id] != null && A.draft.inventory[p.sku] == null) { A.draft.inventory[p.sku] = A.draft.inventory[p.id]; delete A.draft.inventory[p.id]; }
    }
    // SKU must be unique across the whole catalog.
    var clash = allSkus(p.id).filter(function (s) { return p.sku ? s === p.sku : (p.variants && Object.keys(p.variants).some(function (k) { return p.variants[k].sku === s; })); });
    if (clash.length) { u.toast('SKU ' + clash[0] + ' is already used by another product'); return false; }

    if (A.editKey === 'new') A.draft.products.push(p);
    else { var i = A.draft.products.findIndex(function (x) { return x.id === p.id; }); A.draft.products[i] = p; }
    closeEditor();
    return true;
  }

  function allSkus(exceptId) {
    var out = [];
    A.draft.products.forEach(function (p) {
      if (p.id === exceptId) return;
      if (p.sku) out.push(p.sku);
      Object.keys(p.variants || {}).forEach(function (k) { if (p.variants[k].sku) out.push(p.variants[k].sku); });
    });
    return out;
  }

  /* ---------- editor actions ---------- */
  function rer() { keepScroll(A.render); A.refreshDirtyBar(); }
  A.actions['product-new'] = function () { openEditor('new', newTemplate()); };
  A.actions['product-edit'] = function (el) { openEditor(el.dataset.id, A.clone(A.draft.products.find(function (p) { return p.id === el.dataset.id; }))); };
  A.actions['product-cancel'] = function () { if (A.editDirty && A.editDirty() && !confirm('Discard changes to this product?')) return; closeEditor(); A.render(); };
  A.actions['product-save'] = async function () { if (!commit()) return; await A.saveStore('Product saved'); A.render(); };

  A.actions['p-type'] = function (el) {
    var p = A.edit;
    if (el.dataset.type === 'collection' && !isColl(p)) {
      p.options = [{ id: u.uid('o'), name: 'Color', type: 'color', values: [{ id: u.uid('cl'), label: 'New color', hex: p.swatch || '#C9BBA6', images: blank8(), video: '', primary: 0 }] },
        { id: u.uid('o'), name: 'Size', type: 'size', values: [{ id: u.uid('sz'), label: 'One size', price: null, salePrice: null }] }];
      p.variants = {};
      var key = p.options[0].values[0].id + '__' + p.options[1].values[0].id;
      if ((p.images || []).some(Boolean) || p.sku) p.variants[key] = { sku: p.sku || '', images: (p.images || []).slice(), primary: p.primary || 0, video: p.video || '' };
      if (p.basePrice == null) p.basePrice = p.price;
      if (!p.skuPrefix) p.skuPrefix = String(p.name || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase();
    } else if (el.dataset.type === 'simple' && isColl(p)) {
      if (!confirm('Switch to a simple product? Colors, sizes and variant settings will be removed when you save.')) return;
      p.options = []; p.variants = {};
      if (p.price == null) p.price = p.basePrice;
      p.images = blank8();
    }
    rer();
  };
  A.actions['p-primary'] = function (el) { A.edit.primary = +el.dataset.i; rer(); };
  A.actions['p-color-add'] = function () { optC(A.edit).values.push({ id: u.uid('cl'), label: 'New color', hex: SWATCH[Math.floor(Math.random() * SWATCH.length)], images: blank8(), video: '', primary: 0 }); A.openColor = optC(A.edit).values.length - 1; rer(); };
  A.actions['p-color-remove'] = function (el) {
    var o = optC(A.edit); if (o.values.length <= 1) { u.toast('Keep at least one color'); return; }
    var c = o.values[+el.dataset.i]; if (!confirm('Remove color “' + c.label + '” and its SKUs?')) return;
    o.values.splice(+el.dataset.i, 1);
    Object.keys(A.edit.variants || {}).forEach(function (k) { if (k.split('__')[0] === c.id) delete A.edit.variants[k]; });
    rer();
  };
  A.actions['p-color-photos-clear'] = function () {
    if (!confirm('Delete the older photos stored on the colors? SKUs without their own photos will show a plain swatch.')) return;
    optC(A.edit).values.forEach(function (c) { c.images = []; c.video = ''; c.primary = 0; });
    rer();
  };
  A.actions['p-size-add'] = function () { optS(A.edit).values.push({ id: u.uid('sz'), label: 'New size', price: null, salePrice: null }); rer(); };
  A.actions['p-size-remove'] = function (el) {
    var o = optS(A.edit); if (o.values.length <= 1) { u.toast('Keep at least one size'); return; }
    var s = o.values[+el.dataset.i]; if (!confirm('Remove size “' + s.label + '” and its SKUs?')) return;
    o.values.splice(+el.dataset.i, 1);
    Object.keys(A.edit.variants || {}).forEach(function (k) { if (k.split('__')[1] === s.id) delete A.edit.variants[k]; });
    rer();
  };
  function variant(key) { A.edit.variants = A.edit.variants || {}; return A.edit.variants[key] || (A.edit.variants[key] = {}); }
  A.actions['p-var-primary'] = function (el) { variant(el.dataset.key).primary = +el.dataset.i; A.openVariant = el.dataset.key; rer(); };
  A.actions['p-var-copy-color'] = function (el) {
    var cid = el.dataset.key.split('__')[0], c = optC(A.edit).values.find(function (x) { return x.id === cid; });
    var o = variant(el.dataset.key); o.images = (c.images || []).slice(0, 8); o.primary = c.primary || 0; if (c.video) o.video = c.video;
    A.openVariant = el.dataset.key; rer();
  };
  A.actions['p-var-copy-all'] = function (el) {
    var src = variant(el.dataset.key), cid = el.dataset.key.split('__')[0];
    if (!confirm('Copy these photos to every size in this color? Sizes with their own photos will be replaced.')) return;
    optS(A.edit).values.forEach(function (s) { var o = variant(cid + '__' + s.id); o.images = (src.images || []).slice(0, 8); o.primary = src.primary || 0; if (src.video) o.video = src.video; });
    rer(); u.toast('Copied to all sizes');
  };
  A.actions['p-var-clear'] = function (el) { var o = variant(el.dataset.key); delete o.images; delete o.primary; delete o.video; A.openVariant = el.dataset.key; rer(); };

  /* ---------- list actions ---------- */
  A.actions['product-dup'] = function (el) {
    var src = A.draft.products.find(function (p) { return p.id === el.dataset.id; });
    var cp = A.clone(src);
    cp.id = u.uid('p'); cp.name = src.name + ' (copy)'; cp.slug = uniqueSlug(src.slug + '-copy'); cp.oldSlugs = []; cp.hidden = true; cp.featured = false;
    if (cp.sku) cp.sku = '';
    Object.keys(cp.variants || {}).forEach(function (k) { delete cp.variants[k].sku; });
    // Opened as a new product: it joins the catalog only when saved.
    openEditor('new', cp);
    u.toast('Duplicated as a hidden draft. SKUs were cleared — enter new ones.');
  };
  A.actions['product-delete'] = function (el) {
    var p = A.draft.products.find(function (x) { return x.id === el.dataset.id; });
    if (!confirm('Delete “' + HW.seo.clip(p.name, 60) + '”? Click Save changes afterwards to publish.')) return;
    A.draft.products = A.draft.products.filter(function (x) { return x.id !== p.id; });
    delete listState.selected[p.id];
    rer();
  };
  A.actions['product-bulk-delete'] = async function () {
    var ids = Object.keys(listState.selected).filter(function (k) { return listState.selected[k]; });
    if (!ids.length) return;
    var ok = await A.confirmTyped('Delete ' + u.plural(ids.length, 'product') + '?', 'They are removed from the catalog when you save. Their stock rows stay in Inventory.');
    if (!ok) return;
    A.draft.products = A.draft.products.filter(function (p) { return ids.indexOf(p.id) < 0; });
    listState.selected = {};
    rer(); u.toast('Deleted — click Save changes to publish');
  };

  /* ---------- combine simple products into one collection ---------- */
  function guessParts(name) {
    var parts = String(name).split('|').map(function (s) { return s.trim(); }).filter(Boolean);
    var color = parts.length > 1 ? parts[parts.length - 1] : '';
    var size = parts.length > 2 ? parts[parts.length - 2] : '';
    var set = (parts[0] || '').match(/set of \d+/i);
    return { base: parts[0] || name, color: color, size: (set ? set[0] + ' — ' : '') + size };
  }

  A.actions['product-combine'] = function () {
    var ids = Object.keys(listState.selected).filter(function (k) { return listState.selected[k]; });
    var items = A.draft.products.filter(function (p) { return ids.indexOf(p.id) >= 0 && !isColl(p); });
    if (items.length < 2) { u.toast('Select 2 or more simple products'); return; }
    var common = guessParts(items[0].name).base.replace(/\s*set of \d+/i, '').replace(/^home weavers\s+/i, '').trim();
    var body = '<p class="hint">Each selected product becomes one SKU (color × size) of a new collection. Prices, photos, SKUs and stock move across. The originals are removed and their web addresses redirect to the collection.</p>' +
      '<div class="field"><label for="cmbName">Collection name</label><input id="cmbName" value="' + esc(common) + '" maxlength="80"></div>' +
      '<div class="tablewrap"><table class="vartable"><thead><tr><th>Product</th><th>Color</th><th>Hex</th><th>Size / pack</th></tr></thead><tbody>' +
      items.map(function (p, i) {
        var g = guessParts(p.name);
        return '<tr><td style="max-width:260px;font-size:12.5px">' + esc(HW.seo.clip(p.name, 90)) + '<div class="hint">SKU ' + esc(p.sku || '—') + ' · ' + u.money(p.price) + '</div></td>' +
          '<td><input data-cmb="color" data-i="' + i + '" value="' + esc(g.color) + '" aria-label="Color for product ' + (i + 1) + '"></td>' +
          '<td><input type="color" data-cmb="hex" data-i="' + i + '" value="' + esc(p.swatch || '#C9BBA6') + '" aria-label="Swatch for product ' + (i + 1) + '"></td>' +
          '<td><input data-cmb="size" data-i="' + i + '" value="' + esc(g.size) + '" aria-label="Size for product ' + (i + 1) + '"></td></tr>';
      }).join('') + '</tbody></table></div><p class="form-msg err" id="cmbErr" hidden></p>';

    A.modal({
      title: 'Combine ' + items.length + ' products into one collection',
      body: body,
      buttons: [{ label: 'Create collection', cls: 'loom', onClick: function (w) {
        var err = w.querySelector('#cmbErr');
        var name = w.querySelector('#cmbName').value.trim();
        var rows = items.map(function (p, i) {
          var get = function (k) { return w.querySelector('[data-cmb="' + k + '"][data-i="' + i + '"]').value.trim(); };
          return { p: p, color: get('color'), hex: get('hex'), size: get('size') };
        });
        var problem = !name ? 'Enter a collection name.' : (rows.some(function (r) { return !r.color || !r.size; }) ? 'Every row needs a color and a size.' : '');
        var combos = {};
        rows.forEach(function (r) { var k = r.color.toLowerCase() + '|' + r.size.toLowerCase(); if (combos[k]) problem = problem || ('Two products are both ' + r.color + ' / ' + r.size + '.'); combos[k] = 1; });
        if (problem) { err.hidden = false; err.textContent = problem; return false; }

        var colors = [], sizes = [], variants = {}, prices = {};
        rows.forEach(function (r) {
          var c = colors.find(function (x) { return x.label.toLowerCase() === r.color.toLowerCase(); });
          if (!c) { c = { id: u.uid('cl'), label: r.color, hex: r.hex, images: [], video: '', primary: 0 }; colors.push(c); }
          var s = sizes.find(function (x) { return x.label.toLowerCase() === r.size.toLowerCase(); });
          if (!s) { s = { id: u.uid('sz'), label: r.size, price: null, salePrice: null }; sizes.push(s); }
          r.c = c; r.s = s;
          prices[r.p.price] = (prices[r.p.price] || 0) + 1;
        });
        var base = +Object.keys(prices).sort(function (a, b) { return prices[b] - prices[a]; })[0];
        var first = rows[0].p;
        var coll = { id: u.uid('p'), name: name, slug: uniqueSlug(u.slugify(name).slice(0, 70)), description: first.description, categoryId: first.categoryId, subcategoryId: first.subcategoryId,
          badge: '', featured: rows.some(function (r) { return r.p.featured; }), hidden: false, material: first.material, care: first.care, origin: first.origin, weight: first.weight,
          features: first.features || [], seoTitle: '', seoDescription: '', imageAlt: '', oldSlugs: [],
          options: [{ id: u.uid('o'), name: 'Color', type: 'color', values: colors }, { id: u.uid('o'), name: 'Size', type: 'size', values: sizes }],
          variants: variants, basePrice: base, baseSalePrice: null, skuPrefix: '', inStock: true };
        var usedSkus = {};
        allSkus(null).forEach(function (s) { usedSkus[s] = 1; });
        rows.forEach(function (r) {
          var p = r.p, key = r.c.id + '__' + r.s.id;
          var sku = p.sku;
          if (!sku) {
            // No real SKU yet: build one from the names and make sure it is unique.
            var baseSku = m.genSku(coll, r.c, { label: r.s.label.replace(/[^A-Za-z0-9]/g, '').slice(0, 12) }), n = 2;
            sku = baseSku;
            while (usedSkus[sku]) sku = baseSku + '-' + (n++);
          }
          usedSkus[sku] = 1;
          var v = { sku: sku };
          if (+p.price !== base) v.price = +p.price;
          if (p.salePrice != null) v.salePrice = +p.salePrice;
          if (p.inStock === false) v.inStock = false;
          var imgs = (p.images || []).filter(Boolean);
          if (imgs.length) { v.images = imgs; v.primary = Math.min(p.primary || 0, imgs.length - 1); }
          if (p.video) v.video = p.video;
          variants[key] = v;
          var invKey = A.draft.inventory[p.sku] != null ? p.sku : (A.draft.inventory[p.id] != null ? p.id : null);
          if (invKey) { A.draft.inventory[sku] = A.draft.inventory[invKey]; if (invKey !== sku) delete A.draft.inventory[invKey]; }
          coll.oldSlugs.push(p.slug);
          (p.oldSlugs || []).forEach(function (s) { coll.oldSlugs.push(s); });
        });
        // Color × size pairs that none of the original products had don't exist — mark them unavailable.
        colors.forEach(function (c) {
          sizes.forEach(function (s) {
            var k = c.id + '__' + s.id;
            if (!variants[k]) variants[k] = { inStock: false };
          });
        });
        var firstIndex = A.draft.products.indexOf(first);
        A.draft.products = A.draft.products.filter(function (p) { return items.indexOf(p) < 0; });
        A.draft.products.splice(Math.min(firstIndex, A.draft.products.length), 0, coll);
        listState.selected = {};
        openEditor(coll.id, A.clone(coll));
        u.toast('Collection created. Review it, then click Save product.');
      } }]
    });
  };
})(window.HW = window.HW || {});
