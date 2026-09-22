/* Home Weavers — admin core: sign-in, data, saving, layout, form binding, dialogs, CSV. */
(function (HW) {
  'use strict';

  var u = HW.u, esc = u.esc;
  var cfg = window.HW_CONFIG || {};
  var IDLE_MINUTES = 30;
  var ACTIVE_KEY = 'hw:adminActive', UNSAVED_KEY = 'hw:adminUnsaved';

  var A = HW.A = {
    sb: null, user: null,
    store: null, storeAt: null, draft: null,
    priv: null, privAt: null, privDraft: null,
    tab: 'dashboard', edit: null, editKey: null,
    tabs: {}, actions: {}, live: {},
    lastActive: Date.now()
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  A.clone = clone;

  var ICONS = {
    dash: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
    store: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 9l1-5h16l1 5M4 9v10h16V9M9 19v-5h6v5"/></svg>',
    banner: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 15l5-5 4 4 3-3 6 6"/><circle cx="8" cy="9" r="1.4"/></svg>',
    cats: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
    prod: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7M12 11v10"/></svg>',
    promo: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M20.6 9.4l-8-8a2 2 0 0 0-1.4-.6H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8 8a2 2 0 0 0 2.8 0l7.2-7.2a2 2 0 0 0 0-2.8z"/><circle cx="7" cy="7" r="1.2" fill="currentColor"/></svg>',
    page: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v4h4M9 13h6M9 17h6"/></svg>',
    market: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 11l18-7-4 18-5-7-9-4z"/><path d="M12 15l5 5"/></svg>',
    orders: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M6 2l-2 4v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6l-2-4z"/><path d="M4 6h16M16 10a4 4 0 0 1-8 0"/></svg>',
    inv: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/></svg>',
    mail: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
    chart: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>'
  };

  var NAV = [
    ['Overview', [['dashboard', 'Dashboard', ICONS.dash], ['analytics', 'Analytics', ICONS.chart]]],
    ['Content', [['storefront', 'Storefront', ICONS.store], ['banner', 'Hero banner', ICONS.banner], ['pages', 'Pages', ICONS.page]]],
    ['Catalog', [['categories', 'Categories', ICONS.cats], ['products', 'Products', ICONS.prod], ['inventory', 'Inventory', ICONS.inv]]],
    ['Selling', [['orders', 'Orders', ICONS.orders], ['promotions', 'Promotions', ICONS.promo], ['marketing', 'Marketing', ICONS.market]]],
    ['Inbox', [['messages', 'Messages', ICONS.mail]]]
  ];

  /* ================================================================ *
   * Sign-in
   * ================================================================ */
  function client() {
    if (A.sb) return A.sb;
    A.sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'hw-admin-auth' }
    });
    return A.sb;
  }

  A.enter = async function () {
    client();
    wireOnce();
    var root = document.getElementById('admin');
    if (A.draft && A.user) { A.render(); return; }
    root.innerHTML = '<div class="login"><div class="box"><p class="muted" style="margin:0">Loading…</p></div></div>';
    var s = await A.sb.auth.getSession();
    var session = s && s.data && s.data.session;
    if (!session) { renderLogin(); return; }
    var ok = await afterSignIn(session.user);
    if (!ok) renderLogin(A.loginNote || '');
  };

  function renderLogin(note) {
    var bd = (HW.DB && HW.DB.brand) || { name: 'Home Weavers' };
    document.getElementById('admin').innerHTML =
      '<div class="login"><form class="box" data-aform="login" novalidate aria-labelledby="loginHead">' +
      '<div class="mark">' + HW.SVG.logo + ' ' + esc(bd.name) + '</div>' +
      '<h1 id="loginHead" class="muted" style="margin:0 0 20px;font-family:var(--ui);font-size:15px;font-weight:400">Store admin</h1>' +
      (note ? '<p class="form-msg err" role="alert" style="margin:0 0 14px;text-align:left">' + esc(note) + '</p>' : '') +
      '<div class="field" style="text-align:left"><label for="ademail">Email</label><input id="ademail" name="email" type="email" autocomplete="username" required></div>' +
      '<div class="field" style="text-align:left"><label for="adpass">Password</label><input id="adpass" name="password" type="password" autocomplete="current-password" required></div>' +
      '<button class="btn loom block" type="submit">Sign in</button>' +
      '<p id="aderr" class="hint" role="alert" style="margin-top:10px;color:#a23b2b;min-height:18px"></p>' +
      '<p style="margin:10px 0 0"><a class="link-u" href="' + HW.link('/') + '">← Back to store</a></p>' +
      '</form></div>';
    A.loginNote = '';
    setTimeout(function () { var i = document.getElementById('ademail'); if (i) i.focus(); }, 50);
  }

  async function signIn(form) {
    var err = document.getElementById('aderr');
    var btn = form.querySelector('button[type=submit]');
    var email = form.elements.email.value.trim(), pw = form.elements.password.value;
    if (!email || !pw) { err.textContent = 'Enter your email and password.'; return; }
    if (!u.isEmail(email)) { err.textContent = 'Enter a valid email address.'; form.elements.email.setAttribute('aria-invalid', 'true'); form.elements.email.focus(); return; }
    A.freshLogin = true;
    btn.disabled = true; err.textContent = 'Signing in…';
    var r = await A.sb.auth.signInWithPassword({ email: email, password: pw });
    btn.disabled = false;
    if (r.error) {
      // Same message whether the email exists or not.
      err.textContent = r.error.status === 429 ? 'Too many attempts. Wait a minute and try again.' : 'Email or password is incorrect.';
      form.elements.password.value = '';
      form.elements.password.focus();
      return;
    }
    var ok = await afterSignIn(r.data.user);
    if (!ok) renderLogin(A.loginNote || 'Email or password is incorrect.');
  }

  async function afterSignIn(user) {
    var isAdmin = await A.sb.rpc('is_admin');
    if (isAdmin.error || isAdmin.data !== true) {
      await A.sb.auth.signOut();
      A.loginNote = isAdmin.error ? 'Couldn’t check admin access. Try again.' : 'This account doesn’t have admin access.';
      return false;
    }
    A.user = user;
    var prevActive = Number(u.store.get(ACTIVE_KEY, 0)) || 0;
    if (prevActive && Date.now() - prevActive > IDLE_MINUTES * 60000 && !A.freshLogin) {
      // Reloading doesn't reset the idle clock.
      await A.sb.auth.signOut().catch(function () {});
      A.user = null;
      A.loginNote = 'You were signed out after ' + IDLE_MINUTES + ' minutes of inactivity.';
      return false;
    }
    A.freshLogin = false;
    A.lastActive = Date.now(); u.store.set(ACTIVE_KEY, A.lastActive);
    var loaded = await A.loadAll();
    if (!loaded) return false;
    var unsaved = u.store.get(UNSAVED_KEY, null);
    if (unsaved && unsaved.draft && confirm('You had unsaved changes from ' + new Date(unsaved.at).toLocaleString('en-US') + ' when you were signed out. Restore them? (They are not saved until you press Save.)')) {
      A.draft = unsaved.draft; if (unsaved.privDraft) A.privDraft = unsaved.privDraft;
    }
    u.store.del(UNSAVED_KEY);
    if (location.hash && A.tabs[location.hash.slice(1)]) A.tab = location.hash.slice(1);
    A.render();
    if (A.dirty && A.dirty()) refreshDirtyBar();
    return true;
  }

  A.signOut = async function (note) {
    if (A.dirty() && !note && !confirm('You have unsaved changes. Sign out and lose them?')) return;
    try { await A.sb.auth.signOut(); } catch (e) {}
    A.user = null; A.draft = null; A.privDraft = null; A.edit = null;
    renderLogin(note || '');
  };

  /* Sign out after inactivity. */
  function idleCheck() {
    if (!A.user || !HW.isAdminView()) return;
    if (Date.now() - A.lastActive > IDLE_MINUTES * 60000) {
      // Keep unsaved work on this device so it can be restored after signing in again.
      try { if (A.dirty && A.dirty()) u.store.set(UNSAVED_KEY, { at: Date.now(), draft: A.draft, privDraft: A.privDraft }); } catch (e) {}
      A.user = null;
      A.sb.auth.signOut().catch(function () {});
      A.draft = null; A.privDraft = null; A.edit = null;
      renderLogin('You were signed out after ' + IDLE_MINUTES + ' minutes of inactivity.');
    }
  }

  /* ================================================================ *
   * Data
   * ================================================================ */
  A.loadAll = async function () {
    var r1 = await A.sb.from('store').select('data,updated_at').eq('id', 'main').single();
    var r2 = await A.sb.from('store_private').select('data,updated_at').eq('id', 'main').single();
    if (r1.error || r2.error) {
      A.loginNote = 'Couldn’t load the store: ' + ((r1.error || r2.error).message || 'unknown error');
      return false;
    }
    A.store = HW.schema.normalizeStore(r1.data.data || {});
    A.storeAt = r1.data.updated_at;
    // Counted stock has its own table, so an order can take stock off while this screen is open.
    // Until that table exists, fall back to the copy inside the store record.
    var rs = await A.sb.rpc('admin_stock');
    A.stockTable = !rs.error;
    A.store.inventory = A.stockTable ? (rs.data || {}) : (A.store.inventory || {});
    A.stockBase = clone(A.store.inventory);
    A.draft = clone(A.store);
    A.priv = normalizePrivate(r2.data.data || {});
    A.privAt = r2.data.updated_at;
    A.privDraft = clone(A.priv);
    HW.DB = clone(A.store);
    return true;
  };

  function normalizePrivate(p) {
    p = p && typeof p === 'object' ? p : {};
    var m = p.marketing = p.marketing && typeof p.marketing === 'object' ? p.marketing : {};
    m.goal = m.goal && typeof m.goal === 'object' ? m.goal : {};
    m.log = Array.isArray(m.log) ? m.log : [];
    m.tasks = m.tasks && typeof m.tasks === 'object' ? m.tasks : {};
    m.operator = m.operator && typeof m.operator === 'object' ? m.operator : {};
    m.voice = m.voice || ''; m.endpoint = m.endpoint || ''; m.imageEndpoint = m.imageEndpoint || '';
    p.notes = p.notes || '';
    return p;
  }
  A.normalizePrivate = normalizePrivate;

  A.dirtyStore = function () { return !!A.draft && JSON.stringify(A.draft) !== JSON.stringify(A.store); };
  A.dirtyPrivate = function () { return !!A.privDraft && JSON.stringify(A.privDraft) !== JSON.stringify(A.priv); };
  A.dirty = function () { return A.dirtyStore() || A.dirtyPrivate() || !!(A.edit && A.editDirty && A.editDirty()); };

  function staleDialog() {
    A.modal({
      title: 'Someone else changed the store — reload first',
      body: '<p>The store was saved from another tab or device after you opened the admin. To avoid overwriting those changes, your save was not applied.</p>' +
        '<p class="hint">Download your unsaved changes first if you want to keep a copy.</p>',
      buttons: [
        { label: 'Download my changes', cls: 'ghost', onClick: function () { A.download('home-weavers-unsaved-' + today() + '.json', JSON.stringify({ store: A.draft, private: A.privDraft }, null, 2), 'application/json'); return false; } },
        { label: 'Reload latest', cls: 'loom', onClick: async function () { A.edit = null; await A.loadAll(); A.render(); u.toast('Reloaded the latest store'); } }
      ]
    });
  }

  function saveError(error) {
    var msg = (error && (error.message || error.hint)) || 'Unknown error';
    if (/STALE/.test(msg)) { staleDialog(); return; }
    if (/NOT_ADMIN|JWT|401|permission/i.test(msg)) { u.toast('Save failed: your session expired. Sign in again.'); A.signOut('Your session expired. Sign in again to save.'); return; }
    if (/TOO_LARGE/.test(msg)) msg = 'the store is too large (over 5 MB). Move images to Storage instead of pasting image data.';
    u.toast('Save failed: ' + msg);
  }

  /* Saves the whole store draft. Returns true only if the database confirmed it. */
  A.saveStore = async function (successMsg) {
    var data = A.pruneInventory(HW.schema.normalizeStore(clone(A.draft)));
    var problems = A.validateStore(data);
    if (problems.length) { A.alert(problems); return false; }
    A.alert([]);
    setSaving(true);
    // Stock goes to its own table, and only the counts that were actually changed here — so an order that
    // took stock off while this screen was open isn't undone.
    var stock = data.inventory || {};
    var payload = clone(data);
    if (A.stockTable) {
      var rk = await A.sb.rpc('admin_save_stock', { p_base: A.stockBase || {}, p_next: stock });
      if (rk.error) { setSaving(false); saveError(rk.error); return false; }
      stock = (rk.data && rk.data.inventory) || stock;
      A.stockBase = clone(stock);
      data.inventory = stock;
      delete payload.inventory;
    }
    var r = await A.sb.rpc('save_store', { p_data: payload, p_expected: A.storeAt });
    setSaving(false);
    if (r.error) { saveError(r.error); return false; }
    A.storeAt = r.data;
    A.store = clone(data);
    A.draft = clone(data);
    HW.DB = clone(data);
    u.store.set('hw:store:v2', { at: A.storeAt, data: data });
    publishSnapshot(data, A.storeAt);
    try { HW.paintChrome(); } catch (e) {}
    u.toast(successMsg || 'Saved');
    refreshDirtyBar();
    return true;
  };

  /* Publishes a copy of the saved store to Storage so shoppers load it from the CDN.
     The site checks the database for newer data, so a failed or slow copy never shows stale prices for long. */
  async function publishSnapshot(data, at) {
    try {
      // Publish the shopper's view (no private promo codes, no draft products) — the same filter the site uses.
      var pub = await A.sb.rpc('public_store');
      if (pub.error || !pub.data || !pub.data.data) { console.warn('Store snapshot not published:', pub.error && pub.error.message); return; }
      var blob = new Blob([JSON.stringify({ at: pub.data.updated_at || at, data: pub.data.data })], { type: 'application/json' });
      var r = await A.sb.storage.from('media').upload('public/store.json', blob, { upsert: true, cacheControl: '60', contentType: 'application/json' });
      if (r.error) console.warn('Store snapshot not published:', r.error.message);
    } catch (e) { console.warn('Store snapshot not published:', e); }
  }

  A.savePrivate = async function (successMsg) {
    setSaving(true);
    var r = await A.sb.rpc('save_private', { p_data: A.privDraft, p_expected: A.privAt });
    setSaving(false);
    if (r.error) { saveError(r.error); return false; }
    A.privAt = r.data;
    A.priv = clone(A.privDraft);
    if (successMsg !== false) u.toast(successMsg || 'Saved');
    refreshDirtyBar();
    return true;
  };

  A.saveAll = async function () {
    var ok = true;
    if (A.edit && A.commitEdit) { if (!A.commitEdit()) return false; }
    if (A.dirtyStore()) ok = await A.saveStore('Store saved');
    if (ok && A.dirtyPrivate()) ok = await A.savePrivate('Marketing settings saved');
    if (ok && !A.dirty()) u.toast('All changes saved');
    if (ok) A.render();
    return ok;
  };

  A.discard = function () {
    if (!confirm('Discard all unsaved changes?')) return;
    A.draft = clone(A.store); A.privDraft = clone(A.priv); A.edit = null; A.editKey = null; A.commitEdit = null; A.editDirty = null;
    A.render();
    u.toast('Changes discarded');
  };

  A.validateStore = function (d) {
    var out = A.saleProblems(d);
    var slugs = {};
    (d.products || []).forEach(function (p) {
      if (!String(p.name || '').trim()) out.push('Every product needs a name.');
      if (slugs[p.slug]) out.push('Two products use the web address "' + p.slug + '". Change one slug.');
      slugs[p.slug] = 1;
    });
    var cs = {};
    (d.categories || []).forEach(function (c) { if (cs[c.slug]) out.push('Two categories use "' + c.slug + '".'); cs[c.slug] = 1; });
    var ps = {};
    (d.pages || []).forEach(function (p) { if (ps[p.slug]) out.push('Two pages use "' + p.slug + '".'); ps[p.slug] = 1; });
    var codes = {};
    (d.promos || []).forEach(function (p) { if (codes[p.code]) out.push('Two promo codes are both "' + p.code + '".'); codes[p.code] = 1; });
    // Every product must cost more than $0 (a blank price would otherwise go live as free).
    var money = function (v) { var n = Number(v); return v === null || v === undefined || v === '' || isNaN(n) ? null : n; };
    (d.products || []).forEach(function (p) {
      var name = '“' + (p.name || 'Untitled') + '”';
      if (HW.m.isCollection(p)) {
        var colors = HW.m.optColor(p).values, sizes = HW.m.optSize(p).values, bad = false;
        colors.forEach(function (c) { sizes.forEach(function (sz) {
          var ov = (p.variants || {})[HW.m.vKey(c.id, sz.id)] || {};
          if (ov.off === true) return; // not sold, so no price needed
          var pr = money(ov.price) != null ? money(ov.price) : money(sz.price) != null ? money(sz.price) : money(p.basePrice);
          if (!(pr > 0)) bad = true;
        }); });
        if (bad) out.push(name + ' has a color or size without a price above $0. Set a base price or a price for every size.');
      } else if (!(money(p.price) > 0)) out.push(name + ' needs a price above $0.');
    });
    // Promo codes: sensible values and dates.
    (d.promos || []).forEach(function (p) {
      var c = '“' + (p.code || '?') + '”', v = Number(p.value);
      if (!/^[A-Za-z0-9_-]{3,40}$/.test(String(p.code || ''))) out.push('Promo ' + c + ': use 3–40 letters, numbers, - or _.');
      if (p.type === 'percent' ? !(v > 0 && v <= 100) : !(v > 0)) out.push('Promo ' + c + ': ' + (p.type === 'percent' ? 'the percentage must be between 1 and 100.' : 'the amount off must be above $0.'));
      if (Number(p.minOrder || 0) < 0) out.push('Promo ' + c + ': the minimum order can’t be negative.');
      if (p.usageLimit != null && p.usageLimit !== '' && !(Number.isInteger(Number(p.usageLimit)) && Number(p.usageLimit) >= 0)) out.push('Promo ' + c + ': the usage limit must be a whole number (0 = unlimited).');
      if (p.startsAt && p.endsAt && p.endsAt < p.startsAt) out.push('Promo ' + c + ': the end date is before the start date.');
    });
    Object.keys(d.inventory || {}).forEach(function (k) {
      var q = d.inventory[k];
      if (!(Number.isInteger(Number(q)) && Number(q) >= 0)) out.push('Stock for ' + k + ' must be a whole number, 0 or more.');
    });
    var sh = d.shipping || {};
    if (!(Number(sh.flatRate) >= 0) || !(Number(sh.freeThreshold) >= 0)) out.push('Shipping: the flat rate and the free-shipping amount must be numbers (0 or more).');
    var seenTax = {};
    ((d.tax || {}).rates || []).forEach(function (r) {
      var st = String(r.state || '').toUpperCase(), rate = Number(r.rate);
      if (!st) out.push('Sales tax: choose a state for every row (or remove the empty row).');
      else if (seenTax[st]) out.push('Sales tax: ' + st + ' is listed twice.');
      if (!(rate > 0 && rate <= 20)) out.push('Sales tax' + (st ? ' for ' + st : '') + ': the rate must be between 0.001 and 20 (%).');
      seenTax[st] = 1;
    });
    return out;
  };

  /* Problems stay on screen (not a passing toast) until fixed or closed. */
  A.alert = function (list, focusEl) {
    list = [].concat(list || []).filter(Boolean);
    var main = document.getElementById('adminMain') || document.getElementById('admin');
    var box = document.getElementById('adminAlert');
    if (!list.length) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement('div'); box.id = 'adminAlert'; box.className = 'adalert'; box.setAttribute('role', 'alert'); box.tabIndex = -1; main.insertBefore(box, main.firstChild); }
    box.innerHTML = '<b>' + (list.length === 1 ? 'Please fix this before saving:' : 'Please fix these before saving:') + '</b><ul>' + list.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
      '<button class="txtbtn" type="button" data-a="alert-close">Close</button>';
    if (focusEl) { focusEl.setAttribute('aria-invalid', 'true'); focusEl.focus(); focusEl.addEventListener('input', function () { focusEl.removeAttribute('aria-invalid'); }, { once: true }); }
    else { box.scrollIntoView({ block: 'center' }); box.focus(); }
  };

  /* Stock rows whose product or option no longer exists. */
  /* Where a timed sale stands: waiting, running or finished, in words. */
  A.saleWindow = function (sale) {
    sale = sale || {};
    var from = Date.parse(sale.startsAt), to = Date.parse(sale.endsAt);
    var fmt = function (t) { return new Date(t).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }); };
    if (!sale.enabled || !(sale.percent > 0) || !isFinite(from) || !isFinite(to)) return { state: 'off' };
    var now = Date.now();
    var left = to - now;
    var words = function (ms) {
      var d = Math.floor(ms / 86400000), h = Math.floor(ms / 3600000) % 24, mi = Math.floor(ms / 60000) % 60;
      return (d ? d + ' day' + (d === 1 ? '' : 's') + ' ' : '') + (d || h ? h + ' hr ' : '') + mi + ' min';
    };
    if (now < from) return { state: 'waiting', startsText: fmt(from), endsText: fmt(to) };
    if (left <= 0) return { state: 'done', endsText: fmt(to) };
    return { state: 'live', endsText: fmt(to), leftText: words(left) };
  };

  /* A sale has to make sense before it can be saved. */
  A.saleProblems = function (d) {
    var s = d.sale || {}, out = [];
    if (!s.enabled) return out;
    var from = Date.parse(s.startsAt), to = Date.parse(s.endsAt);
    if (!isFinite(from) || !isFinite(to)) out.push('The sale needs a start and an end time.');
    else if (to <= from) out.push('The sale ends before it starts.');
    else if (to - from > 90 * 86400000) out.push('A sale can run for at most 90 days.');
    if (!(s.percent >= 1 && s.percent <= 70)) out.push('The extra discount has to be between 1% and 70%.');
    if (!String(s.name || '').trim()) out.push('The sale needs band text — shoppers see it on the product page.');
    if (s.scope === 'categories' && !(s.categoryIds || []).length) out.push('Choose at least one category for the sale, or set it to every product.');
    if (s.scope === 'products' && !(s.productIds || []).length) out.push('List at least one product for the sale, or set it to every product.');
    if (s.scope === 'products') {
      var unknown = (s.productIds || []).filter(function (h) {
        return !(d.products || []).some(function (p) { return p.slug === h || p.id === h; });
      });
      if (unknown.length) out.push('No product with the handle ' + unknown.slice(0, 3).join(', ') + '.');
    }
    return out;
  };

  A.pruneInventory = function (d) {
    var keep = {};
    (d.products || []).forEach(function (p) {
      if (HW.m.isCollection(p)) {
        HW.m.optColor(p).values.forEach(function (c) { HW.m.optSize(p).values.forEach(function (sz) {
          var ov = (p.variants || {})[HW.m.vKey(c.id, sz.id)] || {};
          keep[String(ov.sku || '').trim() || HW.m.genSku(p, c, sz)] = 1;
        }); });
      } else { keep[HW.m.simpleSku(p)] = 1; keep[p.id] = 1; }
    });
    Object.keys(d.inventory || {}).forEach(function (k) { if (!keep[k]) delete d.inventory[k]; });
    return d;
  };

  function setSaving(on) {
    u.qsa('#admin [data-a="save"], #admin [data-a="save-all"], #admin .save-btn').forEach(function (b) { b.disabled = on; });
    var bar = document.getElementById('dirtyBar');
    if (bar) bar.classList.toggle('saving', on);
  }

  /* ================================================================ *
   * Layout
   * ================================================================ */
  A.go = function (tab) {
    if (A.edit && A.editDirty && A.editDirty() && !confirm('Leave this editor? Changes you haven’t applied will be lost.')) return;
    A.tab = tab; A.edit = null; A.editKey = null; A.commitEdit = null; A.editDirty = null;
    try { history.replaceState(null, '', location.pathname + location.search + '#' + tab); } catch (e) {}
    A.render();
    var main = document.querySelector('.admain'); if (main) { main.scrollTop = 0; window.scrollTo(0, 0); }
  };

  A.render = function () {
    var t = A.tabs[A.tab] || A.tabs.dashboard;
    var body;
    try { body = t.render(); } catch (e) { console.error(e); body = '<div class="panel"><b>Something went wrong showing this tab.</b><p class="hint">' + esc(e.message) + '</p></div>'; }
    var bd = A.draft.brand || {};
    document.getElementById('admin').innerHTML =
      '<div class="adbar">' +
      '<div class="brand">' + HW.SVG.logo + ' ' + esc(bd.name || 'Home Weavers') + ' <span class="muted" style="font-size:12px;font-family:var(--ui);margin-left:6px;color:#cfd8d4">Admin</span></div>' +
      '<div style="display:flex;gap:10px;align-items:center">' +
      '<span class="adwho">' + esc(A.user && A.user.email || '') + '</span>' +
      '<a class="btn ghost sm" style="border-color:rgba(255,255,255,.4);color:#fff" href="' + HW.link('/') + '" target="_blank" rel="noopener">View store ↗</a>' +
      '<button class="btn sm" type="button" style="background:#fff;color:var(--ink);border-color:#fff" data-a="signout">Sign out</button>' +
      '</div></div>' +
      '<div class="adlayout"><nav class="adside" aria-label="Admin sections">' +
      NAV.map(function (g) {
        return '<div class="sgroup">' + g[0] + '</div>' + g[1].map(function (n) {
          var badge = n[0] === 'messages' && A.unread ? ' <span class="navbadge">' + A.unread + '</span>' : (n[0] === 'orders' && A.newOrders ? ' <span class="navbadge">' + A.newOrders + '</span>' : '');
          return '<button type="button" class="' + (A.tab === n[0] ? 'active' : '') + '" data-a="tab" data-tab="' + n[0] + '"' + (A.tab === n[0] ? ' aria-current="page"' : '') + '>' + n[2] + '<span>' + n[1] + badge + '</span></button>';
        }).join('');
      }).join('') +
      '</nav><main class="admain" id="adminMain">' + body + '</main></div>' +
      '<div class="dirtybar" id="dirtyBar" role="region" aria-label="Unsaved changes" hidden>' +
      '<span><b>Unsaved changes</b> — they are not live until you save.</span>' +
      '<span style="display:flex;gap:8px"><button class="btn ghost sm" type="button" data-a="discard">Discard</button><button class="btn loom sm" type="button" data-a="save-all">Save changes</button></span></div>';
    refreshDirtyBar();
    if (t.after) { try { t.after(); } catch (e) { console.error(e); } }
  };

  function refreshDirtyBar() {
    var bar = document.getElementById('dirtyBar');
    if (bar) bar.hidden = !A.dirty();
  }
  A.refreshDirtyBar = refreshDirtyBar;

  /* ================================================================ *
   * Form binding: data-bind="brand.name" (store), "priv.marketing.voice" (private), "@name" (editor draft)
   * data-type: number | int | bool | lines | upper | trim | slug
   * ================================================================ */
  function setPath(obj, path, value) {
    var parts = path.split('.');
    var o = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      var k = parts[i];
      if (o[k] == null) o[k] = /^\d+$/.test(parts[i + 1]) ? [] : {};
      o = o[k];
    }
    o[parts[parts.length - 1]] = value;
  }
  function getPath(obj, path) {
    return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
  }
  A.getPath = getPath; A.setPath = setPath;

  function readValue(el) {
    var t = el.dataset.type;
    if (el.type === 'checkbox') return el.checked;
    var v = el.value;
    if (t === 'number') { if (String(v).trim() === '') return null; var n = parseFloat(v); return isNaN(n) ? null : n; }
    if (t === 'int') { var i = parseInt(v, 10); return isNaN(i) ? 0 : i; }
    if (t === 'lines') return String(v).split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    if (t === 'upper') return String(v).trim().toUpperCase();
    if (t === 'trim') return String(v).trim();
    if (t === 'slug') return u.slugify(v);
    return v;
  }

  function bindTarget(path) {
    if (path.indexOf('priv.') === 0) return { obj: A.privDraft, path: path.slice(5) };
    if (path.charAt(0) === '@') return { obj: A.edit, path: path.slice(1) };
    return { obj: A.draft, path: path };
  }

  function onBind(e) {
    var el = e.target;
    if (!el.dataset || !el.dataset.bind) return;
    var t = bindTarget(el.dataset.bind);
    if (!t.obj) return;
    setPath(t.obj, t.path, readValue(el));
    if (el.dataset.live && A.live[el.dataset.live]) A.live[el.dataset.live](el, e);
    refreshDirtyBar();
  }

  /* ================================================================ *
   * UI helpers (return HTML)
   * ================================================================ */
  var fid = 0;
  function nextId() { return 'af' + (++fid); }

  A.ui = {
    field: function (label, bind, value, o) {
      o = o || {};
      var id = o.id || nextId();
      var attrs = ' id="' + id + '" data-bind="' + esc(bind) + '"' + (o.type ? ' data-type="' + o.type + '"' : '') + (o.live ? ' data-live="' + o.live + '"' : '') +
        (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : '') + (o.maxlength ? ' maxlength="' + o.maxlength + '"' : '') +
        (o.inputmode ? ' inputmode="' + o.inputmode + '"' : '') + (o.required ? ' required' : '') + (o.hintId ? ' aria-describedby="' + o.hintId + '"' : '');
      var v = value == null ? '' : value;
      var input;
      if (o.textarea) input = '<textarea' + attrs + (o.rows ? ' rows="' + o.rows + '"' : '') + (o.style ? ' style="' + o.style + '"' : '') + '>' + esc(Array.isArray(v) ? v.join('\n') : v) + '</textarea>';
      else if (o.options) input = '<select' + attrs + '>' + o.options.map(function (op) { return '<option value="' + esc(op[0]) + '"' + (String(op[0]) === String(v) ? ' selected' : '') + '>' + esc(op[1]) + '</option>'; }).join('') + '</select>';
      else input = '<input' + attrs + ' type="' + (o.inputType || (o.type === 'number' || o.type === 'int' ? 'number' : 'text')) + '"' + (o.step ? ' step="' + o.step + '"' : (o.type === 'number' ? ' step="0.01"' : '')) + (o.min != null ? ' min="' + o.min + '"' : '') + ' value="' + esc(v) + '"' + (o.list ? ' list="' + o.list + '"' : '') + '>';
      return '<div class="field' + (o.cls ? ' ' + o.cls : '') + '"><label for="' + id + '">' + label + '</label>' + input +
        (o.hint ? '<div class="hint"' + (o.hintId ? ' id="' + o.hintId + '"' : '') + '>' + o.hint + '</div>' : '') + (o.after || '') + '</div>';
    },
    check: function (label, bind, checked, o) {
      o = o || {};
      return '<label class="checkrow"' + (o.style ? ' style="' + o.style + '"' : '') + '><input type="checkbox" data-bind="' + esc(bind) + '"' + (checked ? ' checked' : '') + (o.live ? ' data-live="' + o.live + '"' : '') + '> ' + label + '</label>';
    },
    panel: function (title, body, o) {
      o = o || {};
      return '<section class="panel"' + (o.style ? ' style="' + o.style + '"' : '') + (o.id ? ' id="' + o.id + '"' : '') + '>' +
        (title ? '<h2 class="ph3">' + title + '</h2>' : '') + body + '</section>';
    },
    saveBtn: function (label, action) {
      return '<div class="savebar"><button class="btn loom save-btn" type="button" data-a="' + (action || 'save-all') + '">' + (label || 'Save changes') + '</button></div>';
    },
    imageInput: function (label, bind, value, o) {
      o = o || {};
      var id = nextId();
      var previewId = id + '_pv';
      return '<div class="field imgfield"><label for="' + id + '">' + label + '</label>' +
        '<div class="imgrow"><input id="' + id + '" type="text" data-bind="' + esc(bind) + '" data-type="trim" data-live="imgPreview" data-preview="' + previewId + '" value="' + esc(value || '') + '" placeholder="' + esc(o.placeholder || 'https://… or upload') + '">' +
        '<button class="btn ghost sm" type="button" data-a="upload" data-for="' + id + '" data-folder="' + esc(o.folder || 'misc') + '"' + (o.max ? ' data-max="' + o.max + '"' : '') + '>Upload</button></div>' +
        (o.hint ? '<div class="hint">' + o.hint + '</div>' : '') +
        '<div class="imgprev' + (o.wide ? ' wide' : '') + '" id="' + previewId + '">' + A.ui.previewInner(value) + '</div></div>';
    },
    previewInner: function (url) {
      url = String(url || '').trim();
      if (!url) return '<span class="hint">No image</span>';
      return '<img src="' + esc(HW.asset(url)) + '" alt="" loading="lazy" data-check-img>';
    },
    tag: function (text, cls) { return '<span class="tag ' + (cls || '') + '">' + esc(text) + '</span>'; },
    warn: function (html) { return '<div class="adwarn" role="note">' + html + '</div>'; }
  };

  A.live.imgPreview = function (el) {
    var pv = document.getElementById(el.dataset.preview);
    if (!pv) return;
    pv.innerHTML = A.ui.previewInner(el.value);
    wireImgChecks(pv);
  };
  function wireImgChecks(root) {
    u.qsa('img[data-check-img]', root).forEach(function (img) {
      img.addEventListener('error', function () {
        var box = img.parentElement;
        if (box) box.innerHTML = '<span class="imgerr">This link isn’t a direct image. Use Upload, or a URL ending in .jpg, .png or .webp.</span>';
      }, { once: true });
    });
  }
  A.wireImgChecks = wireImgChecks;

  /* ================================================================ *
   * Links: validation against the draft catalog
   * ================================================================ */
  A.linkProblem = function (link) {
    var l = HW.schema.normalizeLink(link);
    if (!l) return '';
    if (/^(https?:|mailto:|tel:)/i.test(l)) return '';
    if (l.charAt(0) !== '/') return 'Links must start with / (for example /category/rugs) or https://';
    var parts = l.split('?')[0].split('/').filter(Boolean);
    if (!parts.length) return '';
    var d = A.draft;
    if (parts[0] === 'category') {
      var c = (d.categories || []).find(function (x) { return x.slug === parts[1]; });
      if (!c) return 'No category called "' + (parts[1] || '') + '". The button will be hidden.';
      if (c.hidden) return 'Category "' + c.name + '" is hidden. The button will be hidden.';
      if (!(d.products || []).some(function (p) { return p.categoryId === c.id && !p.hidden; }) && !(d.settings || {}).showEmptyCategories) return 'Category "' + c.name + '" has no products, so it is hidden. The button will be hidden.';
      return '';
    }
    if (parts[0] === 'product') return (d.products || []).some(function (p) { return p.slug === parts[1] && !p.hidden; }) ? '' : 'No product at "' + l + '". The button will be hidden.';
    if (parts[0] === 'page') return (d.pages || []).some(function (p) { return p.slug === parts[1]; }) ? '' : 'No page at "' + l + '". The button will be hidden.';
    if (['checkout'].indexOf(parts[0]) >= 0) return '';
    return 'Unknown link "' + l + '". The button will be hidden.';
  };
  A.linkDatalist = function () {
    var d = A.draft;
    var opts = ['/'].concat((d.categories || []).map(function (c) { return '/category/' + c.slug; }))
      .concat((d.products || []).map(function (p) { return '/product/' + p.slug; }))
      .concat((d.pages || []).map(function (p) { return '/page/' + p.slug; }));
    return '<datalist id="linkTargets">' + opts.map(function (o) { return '<option value="' + esc(o) + '">'; }).join('') + '</datalist>';
  };
  A.linkField = function (label, bind, value) {
    var id = nextId();
    var prob = A.linkProblem(value);
    return '<div class="field"><label for="' + id + '">' + label + '</label>' +
      '<input id="' + id + '" type="text" list="linkTargets" data-bind="' + esc(bind) + '" data-type="trim" data-live="linkCheck" data-msg="' + id + '_m" value="' + esc(value || '') + '" placeholder="/category/rugs" aria-describedby="' + id + '_m">' +
      '<div class="hint ' + (prob ? 'bad' : '') + '" id="' + id + '_m">' + (prob ? '⚠ ' + esc(prob) : 'Pick from the list or type a link.') + '</div></div>';
  };
  A.live.linkCheck = function (el) {
    var box = document.getElementById(el.dataset.msg); if (!box) return;
    var prob = A.linkProblem(el.value);
    box.className = 'hint ' + (prob ? 'bad' : '');
    box.textContent = prob ? '⚠ ' + prob : 'Link OK.';
  };

  /* ================================================================ *
   * Dialogs
   * ================================================================ */
  A.modal = function (o) {
    var old = document.getElementById('adModal'); if (old) old.remove();
    var wrap = document.createElement('div');
    wrap.id = 'adModal'; wrap.className = 'admodal';
    wrap.innerHTML = '<div class="admodal-box" role="dialog" aria-modal="true" aria-labelledby="adModalTitle">' +
      '<h2 id="adModalTitle">' + esc(o.title) + '</h2><div class="admodal-body">' + (o.body || '') + '</div>' +
      '<div class="admodal-btns">' + (o.buttons || []).map(function (b, i) {
        return '<button type="button" class="btn sm ' + (b.cls || '') + '" data-mi="' + i + '">' + esc(b.label) + '</button>';
      }).join('') + '<button type="button" class="btn ghost sm" data-mi="close">Cancel</button></div></div>';
    document.body.appendChild(wrap);
    var release = u.trapFocus(wrap.querySelector('.admodal-box'), close);
    function close() { release(); wrap.remove(); }
    wrap.addEventListener('click', async function (e) {
      var b = e.target.closest('[data-mi]');
      if (!b) { if (e.target === wrap) close(); return; }
      if (b.dataset.mi === 'close') { close(); return; }
      var def = o.buttons[+b.dataset.mi];
      b.disabled = true;
      var keep = def.onClick ? await def.onClick(wrap) : undefined;
      b.disabled = false;
      if (keep !== false) close();
    });
    return { close: close, el: wrap };
  };

  /* Resolves true only when the admin types the word exactly. */
  A.confirmTyped = function (title, message, word) {
    word = word || 'DELETE';
    return new Promise(function (resolve) {
      var done = false;
      var md = A.modal({
        title: title,
        body: '<p>' + message + '</p><div class="field"><label for="typedConfirm">Type <b>' + word + '</b> to confirm</label><input id="typedConfirm" autocomplete="off"></div>',
        buttons: [{ label: 'Confirm', cls: 'danger', onClick: function (w) {
          var v = w.querySelector('#typedConfirm').value.trim();
          if (v !== word) { w.querySelector('#typedConfirm').setAttribute('aria-invalid', 'true'); u.toast('Type ' + word + ' exactly to confirm'); return false; }
          done = true; resolve(true);
        } }]
      });
      var obs = new MutationObserver(function () { if (!document.body.contains(md.el)) { obs.disconnect(); if (!done) resolve(false); } });
      obs.observe(document.body, { childList: true });
    });
  };

  /* ================================================================ *
   * Files: download, CSV
   * ================================================================ */
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  A.today = today;

  A.download = function (filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename; a.setAttribute('data-native', '');
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  };

  A.toCsv = function (rows) {
    return rows.map(function (r) {
      return r.map(function (c) {
        var isNum = typeof c === 'number';
        c = String(c == null ? '' : c);
        // Stop spreadsheet formula injection (also behind spaces, tabs or line breaks) without mangling negative numbers.
        if (!isNum && !/^-?\d+(\.\d+)?$/.test(c) && /^[\t\r\n ]*[=+\-@]/.test(c)) c = "'" + c;
        return /[",\n\r]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c;
      }).join(',');
    }).join('\n');
  };

  /* RFC 4180-style CSV parser (quotes, escaped quotes, newlines in quotes). */
  A.parseCsv = function (text) {
    var rows = [], row = [], field = '', q = false, i = 0, s = String(text || '').replace(/^﻿/, '');
    while (i < s.length) {
      var ch = s[i];
      if (q) {
        if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && s[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += ch;
      i++;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  };

  A.readFile = function (file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(new Error('Could not read that file')); };
      fr.readAsText(file);
    });
  };

  A.pickFile = function (accept) {
    return new Promise(function (resolve) {
      var inp = document.createElement('input');
      inp.type = 'file'; inp.accept = accept || '';
      inp.style.display = 'none';
      inp.addEventListener('change', function () { resolve(inp.files && inp.files[0]); inp.remove(); });
      document.body.appendChild(inp);
      inp.click();
    });
  };

  /* ================================================================ *
   * Events (wired once)
   * ================================================================ */
  var wired = false;
  function wireOnce() {
    if (wired) return;
    wired = true;
    var root = document.getElementById('admin');

    root.addEventListener('input', onBind);
    root.addEventListener('change', function (e) { if (e.target.type === 'checkbox' || e.target.tagName === 'SELECT' || e.target.type === 'color') onBind(e); });

    root.addEventListener('click', function (e) {
      var el = e.target.closest('[data-a]');
      if (!el || !root.contains(el)) return;
      var fn = A.actions[el.dataset.a];
      if (!fn) return;
      e.preventDefault();
      Promise.resolve(fn(el, e)).catch(function (err) { console.error(err); u.toast('Something went wrong: ' + err.message); });
    });

    root.addEventListener('submit', function (e) {
      var f = e.target.closest('form[data-aform]');
      if (!f) return;
      e.preventDefault();
      if (f.dataset.aform === 'login') signIn(f);
      else if (A.actions['form:' + f.dataset.aform]) A.actions['form:' + f.dataset.aform](f);
    });

    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(function (t) {
      document.addEventListener(t, function () {
        A.lastActive = Date.now();
        if (!A._activeSaved || A.lastActive - A._activeSaved > 30000) { A._activeSaved = A.lastActive; u.store.set(ACTIVE_KEY, A.lastActive); }
      }, { passive: true });
    });
    setInterval(idleCheck, 30000);

    window.addEventListener('beforeunload', function (e) {
      if (HW.isAdminView() && A.user && A.dirty()) { e.preventDefault(); e.returnValue = ''; }
    });

    // Warn before leaving the admin with unsaved changes (e.g. browser back).
    window.addEventListener('popstate', function () {
      if (A.user && A.dirty() && HW.router.current.name !== 'admin') {
        if (!confirm('You have unsaved changes in the admin. Leave anyway?')) history.pushState({}, '', HW.link('/admin'));
      }
    }, true);

    A.sb.auth.onAuthStateChange(function (event) {
      if (event === 'SIGNED_OUT' && A.user) { A.user = null; renderLogin('You were signed out.'); }
    });
  }

  /* ---------- shared actions ---------- */
  A.actions.tab = function (el) { A.go(el.dataset.tab); };
  A.actions.signout = function () { A.signOut(); };
  A.actions['save-all'] = function () { return A.saveAll(); };
  A.actions['alert-close'] = function () { A.alert([]); };
  A.actions.discard = function () { A.discard(); };
  A.actions.upload = async function (el) {
    var input = document.getElementById(el.dataset.for);
    var file = await A.pickFile('image/*');
    if (!file) return;
    el.disabled = true; var label = el.textContent; el.textContent = 'Uploading…';
    try {
      var folder = el.dataset.folder || 'misc';
      var url = await A.media.upload(file, folder, { max: +el.dataset.max || 2000 });
      if (/^(products|categories|social)/.test(folder)) {
        try { A.draft.thumbs = A.draft.thumbs || {}; A.draft.thumbs[url] = await A.media.upload(file, 'thumbs/' + folder, { max: 700, quality: 0.78 }); } catch (e) {}
      }
      input.value = url;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      u.toast('Image uploaded');
    } catch (e) {
      u.toast('Upload failed: ' + e.message);
    } finally { el.disabled = false; el.textContent = label; }
  };
  /* The server that holds the Stripe and ShipStation keys: the Supabase Edge Function "hw", unless another address is entered
     in Storefront › Card payments. */
  A.defaultWorkerUrl = function () { return String((window.HW_CONFIG || {}).supabaseUrl || '').replace(/\/+$/, '') + '/functions/v1/hw'; };
  A.workerUrl = function () {
    return String(((A.draft && A.draft.payments) || {}).workerUrl || '').trim().replace(/\/+$/, '') || A.defaultWorkerUrl();
  };
  /* Calls an admin-only worker route with the signed-in session. */
  A.workerCall = async function (path, body) {
    var base = A.workerUrl();
    if (!/^https:\/\//.test(base)) throw new Error('The server address in Storefront › Card payments must start with https://');
    var s = await A.sb.auth.getSession();
    var token = s.data && s.data.session && s.data.session.access_token;
    if (!token) throw new Error('Your session expired. Sign in again.');
    var res;
    try {
      res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body || {}) });
    } catch (e) { throw new Error('Couldn’t reach the payments server. Is the “hw” Edge Function deployed?'); }
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || ('Worker error ' + res.status));
    return data;
  };

  A.actions.copy = function (el) {
    var t = document.getElementById(el.dataset.target);
    var text = t ? (t.value != null ? t.value : t.textContent) : (el.dataset.text || '');
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { u.toast('Copied'); }, function () { if (t && t.select) { t.select(); document.execCommand('copy'); u.toast('Copied'); } });
  };
})(window.HW = window.HW || {});
