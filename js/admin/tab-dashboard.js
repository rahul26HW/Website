/* Home Weavers — admin: Dashboard (stats, checklist, media migration, backup, danger zone). */
(function (HW) {
  'use strict';

  var A = HW.A, u = HW.u, esc = u.esc, m = HW.m;

  function withDraft(fn) {
    // Run catalog helpers against the draft (they read HW.DB).
    var saved = HW.DB; HW.DB = A.draft;
    try { return fn(); } finally { HW.DB = saved; }
  }

  function skuStats() {
    return withDraft(function () {
      var total = 0, low = 0, out = 0, thr = m.lowStock();
      (A.draft.products || []).forEach(function (p) {
        if (m.isCollection(p)) {
          m.eachVariant(p, function (v) {
            total++;
            if (m.invTracked(v.sku)) { var q = m.invQty(v.sku); if (q <= 0) out++; else if (q <= thr) low++; }
            else if (!v.inStock) out++;
          });
        } else {
          total++;
          var k = m.simpleQtyKey(p);
          if (m.invTracked(k)) { var q2 = m.invQty(k); if (q2 <= 0) out++; else if (q2 <= thr) low++; }
          else if (p.inStock === false) out++;
        }
      });
      return { total: total, low: low, out: out };
    });
  }

  function checklist() {
    var d = A.draft, items = [];
    var simpleNoSku = (d.products || []).filter(function (p) { return !(Array.isArray(p.options) && p.options.length) && !String(p.sku || '').trim(); });
    if (simpleNoSku.length) items.push(['warn', simpleNoSku.length + ' simple product' + (simpleNoSku.length > 1 ? 's need' : ' needs') + ' a real SKU.', 'inventory']);
    var longNames = (d.products || []).filter(function (p) { return String(p.name || '').length > 80; });
    if (longNames.length) items.push(['warn', longNames.length + ' product name' + (longNames.length > 1 ? 's are' : ' is') + ' over 80 characters.', 'products']);
    var welcome = (d.promos || []).filter(function (p) { return p.active && /^welcome/i.test(p.code); });
    if (welcome.length > 1) items.push(['warn', welcome.length + ' welcome codes are active (' + welcome.map(function (p) { return p.code; }).join(', ') + '). Keep one.', 'promotions']);
    var ext = A.media.collect(A.clone(d)).length;
    if (ext) items.push(['warn', ext + ' image link' + (ext > 1 ? 's point' : ' points') + ' outside your Storage (slow Dropbox/postimg files). Use “Move images to Storage” below.', null]);
    var noThumb = A.media.missingThumbs(d);
    if (noThumb) items.push(['info', noThumb + ' catalog image' + (noThumb > 1 ? 's have' : ' has') + ' no small version yet, so product grids load the full photo. Use “Create small images” below.', null]);
    if (!d.brand.logoImage) items.push(['info', 'No logo image — the text logo is shown. Add one in Storefront.', 'storefront']);
    if (!u.isEmail((d.contact || {}).email)) items.push(['warn', 'No contact email. Add one in Storefront > Contact.', 'storefront']);
    if (!(d.settings || {}).siteUrl) items.push(['info', 'Site address not set (used for sitemap and share links). Add it in Storefront > Store settings.', 'storefront']);
    var slidesNoImg = (d.hero.slides || []).filter(function (s) { return !s.image; }).length;
    if (slidesNoImg) items.push(['info', slidesNoImg + ' hero slide' + (slidesNoImg > 1 ? 's have' : ' has') + ' no photo (brand color is shown).', 'banner']);
    var badLinks = (d.hero.slides || []).filter(function (s) { return s.ctaText && A.linkProblem(s.ctaLink); }).length;
    if (badLinks) items.push(['warn', badLinks + ' hero button' + (badLinks > 1 ? 's link' : ' links') + ' to something that doesn’t exist, so ' + (badLinks > 1 ? 'they are' : 'it is') + ' hidden.', 'banner']);
    if (!/^https:\/\//.test((A.privDraft.marketing || {}).endpoint || '')) items.push(['info', 'AI worker not set up — Marketing AI buttons are off.', 'marketing']);
    return items;
  }

  A.tabs.dashboard = {
    render: function () {
      var d = A.draft;
      var s = skuStats();
      var onSale = (d.products || []).filter(function (p) {
        if (Array.isArray(p.options) && p.options.length) return p.baseSalePrice != null || Object.keys(p.variants || {}).some(function (k) { return p.variants[k].salePrice != null; });
        return p.salePrice != null && p.salePrice < p.price;
      }).length;
      var list = checklist();
      var recent = (d.products || []).slice(-5).reverse();
      return '<h1>Dashboard</h1><p class="sub">Every form has a <b>Save</b> button. Changes go live for shoppers only after you save.</p>' +
        '<div class="stat-row stat-6">' +
        stat('stOrders', '…', 'Orders') + stat('stRevenue', '…', 'Revenue') +
        stat('', s.low, 'Low stock SKUs', s.low ? 'clay' : '') + stat('', s.out, 'Out of stock SKUs', s.out ? 'clay' : '') +
        stat('stSubs', '…', 'Subscribers') + stat('stMsgs', '…', 'Unread messages') + '</div>' +
        '<div class="stat-row">' + stat('', (d.products || []).length, 'Products') + stat('', s.total, 'Total SKUs') +
        stat('', (d.categories || []).length, 'Categories') + stat('', onSale, 'On sale') + '</div>' +

        A.ui.panel('Quick actions', '<div class="btnrow">' +
          '<button class="btn loom sm" type="button" data-a="dash-newproduct">+ Add product</button>' +
          '<button class="btn ghost sm" type="button" data-a="tab" data-tab="orders">View orders</button>' +
          '<button class="btn ghost sm" type="button" data-a="tab" data-tab="inventory">Update inventory</button>' +
          '<button class="btn ghost sm" type="button" data-a="tab" data-tab="banner">Edit hero banner</button>' +
          '<button class="btn ghost sm" type="button" data-a="tab" data-tab="storefront">Storefront settings</button></div>') +

        (list.length ? A.ui.panel('Needs attention', '<ul class="checklist">' + list.map(function (it) {
          return '<li class="' + it[0] + '"><span>' + (it[0] === 'warn' ? '⚠' : 'ℹ') + '</span><span>' + esc(it[1]) + '</span>' +
            (it[2] ? '<button class="txtbtn" type="button" data-a="tab" data-tab="' + it[2] + '">Open</button>' : '') + '</li>';
        }).join('') + '</ul>') : '') +

        A.ui.panel('Move images to Storage',
          '<p class="hint" style="margin:-6px 0 12px">Copies every product, hero, category and logo image that is hosted elsewhere (Dropbox, postimg…) into your Supabase Storage as fast WebP files, then updates the links. Large originals (about 1 MB each) become roughly 100–200 KB. Nothing is deleted from Dropbox.</p>' +
          '<div class="btnrow"><button class="btn loom sm" type="button" data-a="media-migrate">Move images to Storage</button></div>' +
          '<div id="migrateOut" aria-live="polite" style="margin-top:10px"></div>') +

        A.ui.panel('Small images for faster pages',
          '<p class="hint" style="margin:-6px 0 12px">Makes a 700px copy of every product, category and social image. Product cards, the cart and gallery thumbnails use the small copy; the product page still shows the full photo. New uploads get one automatically. Run this after pasting image links or importing a backup.</p>' +
          '<div class="btnrow"><button class="btn loom sm" type="button" data-a="media-thumbs">Create small images</button></div>' +
          '<div id="thumbsOut" aria-live="polite" style="margin-top:10px"></div>') +

        A.ui.panel('Recently added', recent.length ? '<table class="adt"><thead><tr><th><span class="sr-only">Photo</span></th><th>Name</th><th>Category</th><th>Price</th></tr></thead><tbody>' +
          recent.map(function (p) {
            return withDraft(function () {
              var c = m.categoryById(p.categoryId), r = m.priceRange(p);
              return '<tr><td><img class="thumbsm" src="' + esc(HW.asset(m.imageOrSwatch(p))) + '" alt="" loading="lazy"></td><td>' + esc(HW.seo.clip(p.name, 70)) + '</td><td>' + esc(c ? c.name : '—') + '</td><td>' +
                (r.min === r.max ? u.money(r.min) : u.money(r.min) + '–' + u.money(r.max)) + '</td></tr>';
            });
          }).join('') + '</tbody></table>' : '<p class="hint">No products yet.</p>') +

        A.ui.panel('Connection',
          '<p style="margin:0 0 6px;font-size:14px">✅ Signed in as <b>' + esc(A.user.email) + '</b>. Saves publish live to every visitor.</p>' +
          '<p class="hint" style="margin:0">Database: ' + esc((window.HW_CONFIG || {}).supabaseUrl || '') + ' · Store last saved: ' + esc(new Date(A.storeAt).toLocaleString()) + '</p>' +
          '<p class="hint" style="margin:6px 0 0">You are signed out automatically after 30 minutes without activity.</p>') +

        A.ui.panel('Backup &amp; data',
          '<p class="hint" style="margin:-6px 0 12px">Export a backup before big changes. It includes the catalog, settings, marketing data and the subscriber list.</p>' +
          '<div class="btnrow">' +
          '<button class="btn loom sm" type="button" data-a="backup-export">⬇ Export backup (.json)</button>' +
          '<button class="btn ghost sm" type="button" data-a="backup-import">⬆ Import backup (.json)</button>' +
          '<button class="btn ghost sm" type="button" data-a="backup-import-old">⬆ Import old backup (.json)</button></div>' +
          '<p class="hint" style="margin:10px 0 0"><b>Import old backup</b> converts a file from the previous site: it removes the old password, splits private marketing data out, moves subscribers into their own table and fixes known data problems. You’ll see a report before anything changes.</p>') +

        '<section class="panel danger"><h2 class="ph3" style="color:var(--clay)">Danger zone</h2>' +
        '<p class="hint" style="margin:-6px 0 12px">Export a backup first. You must type DELETE to confirm.</p>' +
        '<div class="btnrow"><button class="btn ghost sm dangerbtn" type="button" data-a="store-empty">Empty the store (start blank)</button>' +
        '<button class="btn ghost sm dangerbtn" type="button" data-a="store-reset">Reset to sample data</button></div></section>';
    },
    after: loadStats
  };

  function stat(id, n, label, cls) {
    return '<div class="stat"><div class="n ' + (cls || '') + '"' + (id ? ' id="' + id + '"' : '') + '>' + esc(n) + '</div><div class="l">' + esc(label) + '</div></div>';
  }

  async function loadStats() {
    var set = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
    var o = await A.sb.from('orders').select('total,status,payment_status');
    if (!o.error) {
      var rows = o.data || [];
      // Real orders only: abandoned or cancelled checkouts don't count, and revenue is money actually taken (or approved).
      var real = rows.filter(function (r) { return r.payment_status !== 'unpaid' && r.status !== 'cancelled'; });
      var revenue = real.filter(function (r) { return /^(paid|authorized)$/.test(r.payment_status) && r.status !== 'refunded'; }).reduce(function (s, r) { return s + Number(r.total || 0); }, 0);
      set('stOrders', real.length);
      set('stRevenue', u.money(revenue));
      A.newOrders = rows.filter(function (r) { return r.status === 'new'; }).length;
    } else { set('stOrders', '—'); set('stRevenue', '—'); }
    var sc = await A.sb.from('subscribers').select('id', { count: 'exact', head: true });
    set('stSubs', sc.error ? '—' : sc.count);
    var mc = await A.sb.from('contact_messages').select('id', { count: 'exact', head: true }).eq('is_read', false);
    set('stMsgs', mc.error ? '—' : mc.count);
    A.unread = mc.error ? 0 : mc.count;
  }
  A.loadBadges = loadStats;

  /* ---------- actions ---------- */
  A.actions['dash-newproduct'] = function () { A.go('products'); A.actions['product-new'](); };

  var stopMigrate = false;
  A.actions['media-migrate'] = async function (btn) {
    if (A.dirty() && !confirm('You have unsaved changes. They will be saved together with the new image links. Continue?')) return;
    var out = document.getElementById('migrateOut');
    var refs = A.media.collect(A.clone(A.draft));
    if (!refs.length) { out.innerHTML = '<p class="hint">All images are already in Storage. 🎉</p>'; return; }
    btn.disabled = true; stopMigrate = false;
    out.innerHTML = '<div class="progress"><i style="width:0%"></i></div><p class="hint" id="migTxt">Starting…</p><button class="txtbtn" type="button" id="migStop">Stop</button>';
    document.getElementById('migStop').onclick = function () { stopMigrate = true; };
    var res = await A.media.migrate(A.draft, function (done, total, fails) {
      var bar = out.querySelector('.progress i'); if (bar) bar.style.width = Math.round(done / total * 100) + '%';
      var t = document.getElementById('migTxt'); if (t) t.textContent = done + ' of ' + total + ' images' + (fails.length ? ' · ' + fails.length + ' failed' : '');
    }, function () { return stopMigrate; });
    var saved = await A.saveStore('Image links updated');
    btn.disabled = false;
    out.innerHTML = '<p class="' + (saved ? 'okmsg' : 'badmsg') + '">' + (saved ? 'Moved ' + (res.done - res.failures.length) + ' of ' + res.total + ' images and saved.' : 'Images were uploaded but the store did NOT save. Try Save changes again.') + '</p>' +
      (res.failures.length ? '<details><summary class="hint">' + res.failures.length + ' could not be moved</summary><ul class="hint">' + res.failures.map(function (f) { return '<li>' + esc(f.label) + ': ' + esc(f.error) + '</li>'; }).join('') + '</ul></details>' : '');
  };

  A.actions['media-thumbs'] = async function (btn) {
    if (A.dirty() && !confirm('You have unsaved changes. They will be saved together with the small images. Continue?')) return;
    var out = document.getElementById('thumbsOut');
    btn.disabled = true; stopMigrate = false;
    out.innerHTML = '<div class="progress"><i style="width:0%"></i></div><p class="hint" id="thTxt">Starting…</p><button class="txtbtn" type="button" id="thStop">Stop</button>';
    document.getElementById('thStop').onclick = function () { stopMigrate = true; };
    var before = JSON.stringify(A.draft.thumbs || {});
    var res = await A.media.makeThumbs(A.draft, function (done, total, fails) {
      var bar = out.querySelector('.progress i'); if (bar) bar.style.width = Math.round(done / total * 100) + '%';
      var t = document.getElementById('thTxt'); if (t) t.textContent = done + ' of ' + total + ' images' + (fails.length ? ' · ' + fails.length + ' failed' : '');
    }, function () { return stopMigrate; });
    btn.disabled = false;
    if (JSON.stringify(A.draft.thumbs) === before) { out.innerHTML = '<p class="hint">Every catalog image already has a small version. 🎉</p>'; return; }
    var saved = await A.saveStore('Small images saved');
    out.innerHTML = '<p class="' + (saved ? 'okmsg' : 'badmsg') + '">' + (saved ? 'Created ' + (res.done - res.failures.length) + ' of ' + res.total + ' small images and saved.' : 'Small images were uploaded but the store did NOT save. Try Save changes again.') + '</p>' +
      (res.failures.length ? '<details><summary class="hint">' + res.failures.length + ' failed</summary><ul class="hint">' + res.failures.map(function (f) { return '<li>' + esc(f.label) + ': ' + esc(f.error) + '</li>'; }).join('') + '</ul></details>' : '');
  };

  A.actions['backup-export'] = async function () {
    var subs = await A.sb.from('subscribers').select('email,code,source,created_at').order('created_at');
    var payload = {
      format: 'home-weavers-backup', version: 2, exportedAt: new Date().toISOString(),
      store: A.store, private: A.priv, subscribers: subs.error ? [] : subs.data
    };
    if (A.dirty()) u.toast('Note: unsaved changes are not included in the backup.');
    A.download('home-weavers-backup-' + A.today() + '.json', JSON.stringify(payload, null, 2), 'application/json');
    if (!A.dirty()) u.toast('Backup downloaded');
  };

  async function readJsonFile() {
    var file = await A.pickFile('.json,application/json');
    if (!file) return null;
    try { return JSON.parse(await A.readFile(file)); }
    catch (e) { u.toast('That file isn’t valid JSON.'); return null; }
  }

  async function applyImport(result, label) {
    var rep = result.report || [];
    var body = '<p>This will <b>replace the current store</b> with ' + esc(label) + ':</p>' +
      '<ul class="hint"><li>' + result.store.products.length + ' products, ' + result.store.categories.length + ' categories, ' + result.store.pages.length + ' pages, ' + result.store.promos.length + ' promo codes</li>' +
      '<li>' + Object.keys(result.store.inventory || {}).length + ' stock rows</li><li>' + result.subscribers.length + ' subscribers (added, never removed)</li></ul>' +
      (rep.length ? '<details open><summary><b>Import report (' + rep.length + ')</b></summary><ul class="report">' + rep.map(function (r) {
        return '<li class="' + r.kind + '"><span class="tag ' + (r.kind === 'warn' || r.kind === 'action' ? 'clay' : 'green') + '">' + esc(r.kind) + '</span> ' + esc(r.msg) + '</li>';
      }).join('') + '</ul></details>' : '');
    A.modal({
      title: 'Import backup',
      body: body,
      buttons: [{ label: 'Continue', cls: 'loom', onClick: async function () {
        var ok = await A.confirmTyped('Replace the store?', 'The current catalog, pages and settings will be overwritten. Export a backup first if you might need them.', 'DELETE');
        if (!ok) return;
        A.edit = null;
        A.draft = HW.schema.normalizeStore(A.clone(result.store));
        var p = A.normalizePrivate(A.clone(result.storePrivate || {}));
        A.privDraft = p;
        var s1 = await A.saveStore('Store imported');
        if (!s1) { A.render(); return; }
        await A.savePrivate(false);
        var added = 0, failed = 0;
        for (var i = 0; i < result.subscribers.length; i++) {
          var r = await A.sb.rpc('subscribe', { p_email: result.subscribers[i].email, p_source: 'import' });
          if (r.error) failed++; else added++;
        }
        A.render();
        u.toast('Import complete' + (result.subscribers.length ? ' · ' + added + ' subscribers' + (failed ? ', ' + failed + ' failed' : '') : ''));
      } }]
    });
  }

  A.actions['backup-import'] = async function () {
    var obj = await readJsonFile(); if (!obj) return;
    if (obj.format === 'home-weavers-backup' && obj.store) {
      applyImport({ store: obj.store, storePrivate: obj.private || {}, subscribers: Array.isArray(obj.subscribers) ? obj.subscribers : [], report: [] }, 'this backup from ' + (obj.exportedAt ? new Date(obj.exportedAt).toLocaleString() : 'an unknown date'));
    } else if (Array.isArray(obj.products)) {
      u.toast('This looks like an old-site backup — converting it.');
      A.actions['backup-import-old'](null, obj);
    } else u.toast('That file isn’t a Home Weavers backup.');
  };

  A.actions['backup-import-old'] = async function (el, preloaded) {
    // Called from a click (second argument is the click event) or with an already-read backup.
    var obj = preloaded && Array.isArray(preloaded.products) ? preloaded : await readJsonFile();
    if (!obj) return;
    var result;
    try { result = HW.schema.importBackup(obj); }
    catch (e) { u.toast(e.message); return; }
    applyImport(result, 'the converted old backup');
  };

  A.actions['store-empty'] = async function () {
    var ok = await A.confirmTyped('Empty the store?', 'Deletes ALL products, categories, promo codes and inventory. Brand, pages, Snipcart and AI settings are kept. Orders, messages and subscribers are not touched.');
    if (!ok) return;
    A.edit = null;
    A.draft.products = []; A.draft.categories = []; A.draft.promos = []; A.draft.inventory = {};
    if (await A.saveStore('Store emptied')) A.render();
  };

  A.actions['store-reset'] = async function () {
    var ok = await A.confirmTyped('Reset to sample data?', 'Replaces products, categories, promo codes, inventory and hero slides with the sample catalog. Pages and settings are kept.');
    if (!ok) return;
    A.edit = null;
    var s = A.sampleData();
    Object.keys(s).forEach(function (k) { A.draft[k] = s[k]; });
    if (await A.saveStore('Reset to sample data')) A.render();
  };
})(window.HW = window.HW || {});
