/* Home Weavers — admin: Categories (image, SEO, show/hide, filters, subcategories). */
(function (HW) {
  'use strict';

  var A = HW.A, u = HW.u, esc = u.esc;

  function count(c) { return (A.draft.products || []).filter(function (p) { return p.categoryId === c.id; }).length; }

  function list() {
    var cats = A.draft.categories || [];
    var showEmpty = !!A.draft.settings.showEmptyCategories;
    return '<h1 class="h1row">Categories <button class="btn loom sm" type="button" data-a="cat-new">+ Add category</button></h1>' +
      '<p class="sub">Top-level collections in the main navigation, each with its own subcategories.' +
      (showEmpty ? '' : ' Empty categories are hidden from shoppers (Storefront &gt; Store settings).') + '</p>' +
      (cats.length ? cats.map(function (c, i) {
        var n = count(c);
        var status = c.hidden ? A.ui.tag('Hidden', 'clay') : (!n && !showEmpty ? A.ui.tag('Hidden — no products') : A.ui.tag('Visible', 'green'));
        return '<section class="panel"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap"><div style="flex:1;min-width:260px">' +
          '<div style="display:flex;align-items:center;gap:12px">' +
          (c.image ? '<img class="thumbsm" src="' + esc(HW.asset(c.image)) + '" alt="">' : '<div class="thumbsm" style="background:linear-gradient(135deg,#9FB3A6,#C9BBA6)"></div>') +
          '<div><div style="font-family:var(--disp);font-size:20px">' + esc(c.name) + ' ' + status + '</div>' +
          '<div class="muted" style="font-size:12.5px">/category/' + esc(c.slug) + ' · ' + u.plural(n, 'product') + '</div></div></div>' +
          '<div class="subpills">' + ((c.subcategories || []).map(function (s, j) {
            return '<span class="subpill">' + esc(s.name) + ' <button type="button" data-a="sub-delete" data-i="' + i + '" data-j="' + j + '" aria-label="Remove subcategory ' + esc(s.name) + '">✕</button></span>';
          }).join('') || '<span class="muted" style="font-size:13px">No subcategories</span>') +
          '<span class="subpill addsub"><label class="sr-only" for="newsub_' + i + '">Add subcategory to ' + esc(c.name) + '</label><input id="newsub_' + i + '" placeholder="Add subcategory" data-enter="sub-add" data-i="' + i + '">' +
          '<button type="button" data-a="sub-add" data-i="' + i + '" aria-label="Add subcategory" style="color:var(--loom)">+</button></span></div></div>' +
          '<div class="rowbtns"><button class="txtbtn" type="button" data-a="cat-edit" data-i="' + i + '">Edit</button>' +
          '<button class="txtbtn" type="button" data-a="cat-toggle" data-i="' + i + '">' + (c.hidden ? 'Show' : 'Hide') + '</button>' +
          '<button class="txtbtn danger" type="button" data-a="cat-delete" data-i="' + i + '">Delete</button></div></div></section>';
      }).join('') : '<p class="muted">No categories yet.</p>') + A.ui.saveBtn();
  }

  function editor() {
    var ui = A.ui, c = A.edit, isNew = A.editKey === 'new';
    var f = Object.assign({ type: true, color: true, material: true, price: true }, c.filters || {});
    function row(k, label, desc) {
      return '<label class="cf-adminopt"><input type="checkbox" data-bind="@filters.' + k + '"' + (f[k] ? ' checked' : '') + '> <span><b>' + label + '</b><br><span class="muted" style="font-size:12.5px">' + desc + '</span></span></label>';
    }
    return '<h1>' + (isNew ? 'New category' : 'Edit category') + '</h1><p class="sub">Categories appear in the top navigation and on the homepage.</p>' +
      ui.panel('', '<div class="grid2">' + ui.field('Name', '@name', c.name, { live: 'catName', maxlength: 40 }) +
        ui.field('URL slug', '@slug', c.slug, { type: 'slug', id: 'catSlug', hint: 'Link: /category/<b>slug</b>' }) + '</div>' +
        ui.imageInput('Tile image', '@image', c.image, { folder: 'categories', max: 1200, hint: 'Portrait, about 1200 × 1540 px. Blank = woven color tile.' }) +
        ui.check('Hide this category from shoppers', '@hidden', c.hidden)) +
      ui.panel('Search engine listing (SEO)',
        ui.field('SEO title', '@seoTitle', c.seoTitle, { maxlength: 70, hint: 'Blank = category name.' }) +
        ui.field('Meta description', '@seoDescription', c.seoDescription, { textarea: true, rows: 2, maxlength: 200, hint: '120–160 characters works best.' })) +
      ui.panel('Filters on this category page', '<p class="hint" style="margin:-6px 0 12px">A filter only shows if there is something to filter by.</p>' +
        row('type', 'Type', 'Filter by the subcategories within this category') + row('color', 'Color', 'Filter by product colors (from color options)') +
        row('material', 'Material', 'Filter by the material field') + row('price', 'Price range', 'Filter by a min / max price')) +
      '<div class="btnrow"><button class="btn loom save-btn" type="button" data-a="cat-save">' + (isNew ? 'Create category' : 'Save category') + '</button>' +
      '<button class="btn ghost" type="button" data-a="cat-cancel">Cancel</button></div>';
  }

  A.tabs.categories = {
    render: function () { return A.edit ? editor() : list(); },
    after: function () {
      A.wireImgChecks(document.getElementById('adminMain'));
      u.qsa('#adminMain input[data-enter]').forEach(function (inp) {
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); A.actions[inp.dataset.enter](inp); } });
      });
    }
  };

  A.live.catName = function (el) {
    if (A.editKey !== 'new') return;
    var s = document.getElementById('catSlug'); if (!s) return;
    s.value = u.slugify(el.value); A.edit.slug = s.value;
  };

  function open(key, obj) {
    A.edit = obj; A.editKey = key;
    var start = JSON.stringify(obj);
    A.editDirty = function () { return JSON.stringify(A.edit) !== start; };
    A.commitEdit = commit;
    A.render(); window.scrollTo(0, 0);
  }
  function close() { A.edit = null; A.editKey = null; A.editDirty = null; A.commitEdit = null; }
  function commit() {
    var c = A.edit;
    c.name = String(c.name || '').trim();
    if (!c.name) { u.toast('Name is required'); return false; }
    c.slug = u.slugify(c.slug || c.name);
    if (A.draft.categories.some(function (x, i) { return x.slug === c.slug && String(i) !== String(A.editKey); })) { u.toast('Another category already uses /category/' + c.slug); return false; }
    if (A.editKey === 'new') A.draft.categories.push(c); else A.draft.categories[+A.editKey] = c;
    close();
    return true;
  }

  A.actions['cat-new'] = function () {
    open('new', { id: u.uid('c'), name: '', slug: '', image: '', hidden: false, seoTitle: '', seoDescription: '', subcategories: [], filters: { type: true, color: true, material: true, price: true } });
  };
  A.actions['cat-edit'] = function (el) { open(el.dataset.i, A.clone(A.draft.categories[+el.dataset.i])); };
  A.actions['cat-cancel'] = function () { if (A.editDirty && A.editDirty() && !confirm('Discard changes to this category?')) return; close(); A.render(); };
  A.actions['cat-save'] = async function () { if (!commit()) return; await A.saveStore('Category saved'); A.render(); };
  A.actions['cat-toggle'] = function (el) { var c = A.draft.categories[+el.dataset.i]; c.hidden = !c.hidden; A.render(); };
  A.actions['cat-delete'] = async function (el) {
    var c = A.draft.categories[+el.dataset.i], n = count(c);
    if (n) {
      var ok = await A.confirmTyped('Delete “' + c.name + '”?', 'This also removes its ' + u.plural(n, 'product') + ' from the catalog. Consider Hide instead.');
      if (!ok) return;
      A.draft.products = A.draft.products.filter(function (p) { return p.categoryId !== c.id; });
    } else if (!confirm('Delete “' + c.name + '”?')) return;
    A.draft.categories.splice(+el.dataset.i, 1);
    A.render(); u.toast('Deleted — click Save changes to publish');
  };
  A.actions['sub-add'] = function (el) {
    var i = +el.dataset.i, inp = document.getElementById('newsub_' + i), name = inp.value.trim();
    if (!name) return;
    var c = A.draft.categories[i];
    if (c.subcategories.some(function (s) { return s.slug === u.slugify(name); })) { u.toast('That subcategory already exists'); return; }
    c.subcategories.push({ id: u.uid('s'), name: name, slug: u.slugify(name) });
    A.render();
    var again = document.getElementById('newsub_' + i); if (again) again.focus();
  };
  A.actions['sub-delete'] = function (el) {
    var c = A.draft.categories[+el.dataset.i], s = c.subcategories[+el.dataset.j];
    if (!confirm('Remove subcategory “' + s.name + '”? Products in it stay in ' + c.name + '.')) return;
    c.subcategories.splice(+el.dataset.j, 1);
    A.draft.products.forEach(function (p) { if (p.subcategoryId === s.id) p.subcategoryId = null; });
    A.render();
  };
})(window.HW = window.HW || {});
