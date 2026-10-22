/* Home Weavers — admin: Pages (footer content pages, including legal pages). */
(function (HW) {
  'use strict';
  // Pages the site itself links to or builds features on: they can be hidden or edited, not deleted.
  var SYSTEM = ['contact-us', 'track-your-order', 'privacy-policy', 'terms-of-service', 'refund-policy', 'shipping-returns', 'accessibility'];

  var A = HW.A, u = HW.u, esc = u.esc;
  var GROUPS = [['service', 'Customer service'], ['company', 'Our company'], ['legal', 'Legal (footer bottom)']];

  function list() {
    var pages = A.draft.pages || [];
    return '<h1 class="h1row">Pages <button class="btn loom sm" type="button" data-a="page-new">+ New page</button></h1>' +
      '<p class="sub">The content pages linked in your footer. “Contact us” also shows the contact form; “Track your order” shows the order lookup.</p>' +
      GROUPS.map(function (g) {
        var ps = pages.filter(function (p) { return p.group === g[0]; });
        return A.ui.panel(g[1] + ' column', ps.length ? ps.map(function (p) {
          var i = pages.indexOf(p);
          return '<div class="pagerow"><div><div style="font-weight:600">' + esc(p.title) + ' ' + (p.show === false ? A.ui.tag('Hidden') : '') + '</div>' +
            '<div class="muted" style="font-size:12px">/page/' + esc(p.slug) + '</div></div><div class="rowbtns">' +
            '<button class="txtbtn" type="button" data-a="page-edit" data-i="' + i + '">Edit</button>' +
            '<button class="txtbtn" type="button" data-a="page-toggle" data-i="' + i + '">' + (p.show === false ? 'Show' : 'Hide') + '</button>' +
            (SYSTEM.indexOf(p.slug) > -1 ? '<span class="hint" title="The site needs this page">Built-in</span>' : '<button class="txtbtn danger" type="button" data-a="page-delete" data-i="' + i + '">Delete</button>') + '</div></div>';
        }).join('') : '<p class="muted" style="font-size:14px">No pages in this column.</p>');
      }).join('') + A.ui.saveBtn() + faqPanel();
  }

  /* The questions customers keep asking, answered once in your own words. They show on
     /page/faq and they are what the assistant answers from, so an answer written here is
     the same answer a customer gets either way. */
  function faqPanel() {
    var ui = A.ui, faq = A.draft.faq || [];
    return '<section class="panel"><div class="slidehead"><h2 class="ph3" style="margin:0">Frequently asked questions</h2>' +
      '<button class="btn loom sm" type="button" data-a="faq-add">+ Add question</button></div>' +
      '<p class="hint">These show on the FAQ page and are what the assistant answers from. Write them the way you would answer an email.</p>' +
      (faq.length ? faq.map(function (f, i) {
        return '<div class="colorcard"><div class="slidehead" style="margin-bottom:10px">' +
          '<strong style="font-size:13px">' + esc(f.q ? HW.seo.clip(f.q, 60) : 'New question') + '</strong><div class="rowbtns">' +
          '<button class="txtbtn" type="button" data-a="faq-move" data-i="' + i + '" data-d="-1"' + (i === 0 ? ' disabled' : '') + ' aria-label="Move question ' + (i + 1) + ' up">↑</button>' +
          '<button class="txtbtn" type="button" data-a="faq-move" data-i="' + i + '" data-d="1"' + (i === faq.length - 1 ? ' disabled' : '') + ' aria-label="Move question ' + (i + 1) + ' down">↓</button>' +
          '<button class="txtbtn danger" type="button" data-a="faq-remove" data-i="' + i + '">Remove</button></div></div>' +
          ui.field('Question', 'faq.' + i + '.q', f.q, { maxlength: 160, placeholder: 'Do your towels shrink?' }) +
          ui.field('Answer', 'faq.' + i + '.a', f.a, { textarea: true, rows: 4 }) +
          ui.field('Other words customers use', 'faq.' + i + '.tags', f.tags, { hint: 'Words that are not in the question itself — “refund”, “exchange”, “money back”. Helps the assistant find this answer.' }) +
          ui.check('Show this question', 'faq.' + i + '.show', f.show !== false) + '</div>';
      }).join('') : '<p class="muted" style="font-size:14px">No questions yet. The FAQ page stays hidden until you add one.</p>') +
      ui.saveBtn() + '</section>';
  }

  function editor() {
    var ui = A.ui, p = A.edit, isNew = A.editKey === 'new';
    return '<h1>' + (isNew ? 'New page' : 'Edit page') + '</h1><p class="sub">' + (isNew ? 'Create a footer content page.' : 'Editing ' + esc(p.title) + '.') + '</p>' +
      ui.panel('', '<div class="grid2">' + ui.field('Title', '@title', p.title, { live: 'pageTitle', maxlength: 80 }) +
        ui.field('URL slug', '@slug', p.slug, { type: 'slug', id: 'pgSlug', hint: 'Link: /page/<b>slug</b>' }) + '</div>' +
        '<div class="grid2">' + ui.field('Footer column', '@group', p.group, { options: GROUPS }) +
        '<div class="field"><span class="flabel">Visibility</span>' + ui.check('Show in footer', '@show', p.show !== false) + '</div></div>' +
        ui.field('Body', '@body', p.body, { textarea: true, style: 'min-height:260px', hint: 'Formatting: <b>## Heading</b>, <b>- bullet</b>, <b>**bold**</b>, <b>[link](https://…)</b> or <b>[link](/page/contact-us)</b>. Blank line between paragraphs. Write <b>{{shipping_days}}</b>, <b>{{free_shipping}}</b>, <b>{{cod_limit}}</b>, <b>{{payment_terms}}</b> or <b>{{tax_terms}}</b> to insert the live setting, so a policy page can’t drift from what checkout does.' })) +
      ui.panel('Search engine listing (SEO)',
        ui.field('SEO title', '@seoTitle', p.seoTitle, { maxlength: 70, hint: 'Blank = page title. Up to 60 characters shows fully in Google.' }) +
        ui.field('Meta description', '@seoDescription', p.seoDescription, { textarea: true, rows: 2, maxlength: 200, hint: 'Blank = start of the page text. 120–160 characters works best.' })) +
      '<div class="btnrow"><button class="btn loom save-btn" type="button" data-a="page-save">' + (isNew ? 'Create page' : 'Save page') + '</button>' +
      '<button class="btn ghost" type="button" data-a="page-cancel">Cancel</button></div>';
  }

  A.tabs.pages = { render: function () { return A.edit ? editor() : list(); } };

  A.live.pageTitle = function (el) {
    if (A.editKey !== 'new') return;
    var s = document.getElementById('pgSlug'); if (!s) return;
    s.value = u.slugify(el.value); A.edit.slug = s.value;
  };

  function openEditor(key, obj) {
    A.edit = obj; A.editKey = key;
    var start = JSON.stringify(obj);
    A.editDirty = function () { return JSON.stringify(A.edit) !== start; };
    A.commitEdit = function () { return commit(); };
    A.render(); window.scrollTo(0, 0);
  }
  function commit() {
    var p = A.edit;
    p.title = String(p.title || '').trim();
    if (!p.title) { u.toast('Title is required'); return false; }
    p.slug = u.slugify(p.slug || p.title);
    var clash = A.draft.pages.some(function (x, i) { return x.slug === p.slug && String(i) !== String(A.editKey); });
    if (clash) { u.toast('Another page already uses /page/' + p.slug); return false; }
    if (A.editKey === 'new') A.draft.pages.push(Object.assign({ id: u.uid('pg') }, p));
    else A.draft.pages[+A.editKey] = p;
    A.edit = null; A.editKey = null; A.editDirty = null; A.commitEdit = null;
    return true;
  }

  function rerenderFaq() { var y = window.scrollY; A.render(); window.scrollTo(0, y); A.refreshDirtyBar(); }
  A.actions['faq-add'] = function () {
    if (!Array.isArray(A.draft.faq)) A.draft.faq = [];
    A.draft.faq.push({ id: 'faq_' + Math.random().toString(36).slice(2, 8), q: '', a: '', tags: '', show: true });
    rerenderFaq();
  };
  A.actions['faq-remove'] = function (el) {
    if (!confirm('Remove this question?')) return;
    A.draft.faq.splice(+el.dataset.i, 1); rerenderFaq();
  };
  A.actions['faq-move'] = function (el) {
    var a = A.draft.faq, i = +el.dataset.i, j = i + (+el.dataset.d);
    if (j < 0 || j >= a.length) return;
    var t = a[i]; a[i] = a[j]; a[j] = t; rerenderFaq();
  };

  A.actions['page-new'] = function () { openEditor('new', { title: '', slug: '', group: 'service', show: true, body: '', seoTitle: '', seoDescription: '' }); };
  A.actions['page-edit'] = function (el) { openEditor(el.dataset.i, A.clone(A.draft.pages[+el.dataset.i])); };
  A.actions['page-cancel'] = function () {
    if (A.editDirty && A.editDirty() && !confirm('Discard changes to this page?')) return;
    A.edit = null; A.editKey = null; A.editDirty = null; A.commitEdit = null; A.render();
  };
  A.actions['page-save'] = async function () { if (!commit()) return; if (await A.saveStore('Page saved')) A.render(); else A.render(); };
  A.actions['page-toggle'] = function (el) { var p = A.draft.pages[+el.dataset.i]; p.show = p.show === false; A.render(); };
  A.actions['page-delete'] = function (el) {
    if (SYSTEM.indexOf((A.draft.pages[+el.dataset.i] || {}).slug) > -1) { A.alert(['This page is built into the site, so it can’t be deleted. You can hide it instead.']); return; }
    var p = A.draft.pages[+el.dataset.i];
    if (['contact-us', 'track-your-order'].indexOf(p.slug) >= 0 && !confirm('“' + p.title + '” holds the ' + (p.slug === 'contact-us' ? 'contact form' : 'order lookup') + '. Delete it anyway?')) return;
    if (!confirm('Delete “' + p.title + '”? Click Save changes afterwards to publish.')) return;
    A.draft.pages.splice(+el.dataset.i, 1); A.render();
  };
})(window.HW = window.HW || {});
