/* Home Weavers — admin: Promotions (shipping rule, discount codes, newsletter subscribers). */
(function (HW) {
  'use strict';

  var A = HW.A, u = HW.u, esc = u.esc;
  var subs = { list: null, selected: {}, used: {} };

  async function loadSubs() {
    var r = await A.sb.from('subscribers').select('*').order('created_at', { ascending: false }).limit(5000);
    subs.error = r.error ? r.error.message : null;
    subs.list = r.error ? [] : r.data;
    var red = await A.sb.from('promo_redemptions').select('promo_code');
    subs.used = {};
    (red.data || []).forEach(function (x) { var k = String(x.promo_code).toUpperCase(); subs.used[k] = (subs.used[k] || 0) + 1; });
  }

  function welcomeWarning() {
    var d = A.draft;
    var welcome = (d.promos || []).filter(function (p) { return p.active && /^welcome/i.test(p.code); });
    var nl = String(d.newsletter.couponCode || '').toUpperCase();
    var nlPromo = (d.promos || []).find(function (p) { return p.code === nl; });
    var out = '';
    if (welcome.length > 1) out += A.ui.warn('⚠ <b>' + welcome.length + ' welcome codes are active</b> (' + welcome.map(function (p) { return esc(p.code); }).join(', ') + '). Only one should be. Sign-ups get <b>' + esc(nl || 'none') + '</b> — turn the others off.');
    if (nl && (!nlPromo || !nlPromo.active)) out += A.ui.warn('⚠ The sign-up welcome code <b>' + esc(nl) + '</b> is ' + (nlPromo ? 'not active' : 'missing') + ', so sign-ups won’t see a discount.');
    return out;
  }

  A.tabs.promotions = {
    render: function () {
      var ui = A.ui, d = A.draft, sh = d.shipping, promos = d.promos || [];
      var today = new Date().toISOString().slice(0, 10);
      return '<h1>Promotions</h1><p class="sub">Discount codes shoppers enter in the cart, your free-shipping rule, and newsletter sign-ups.</p>' +
        ui.panel('Free shipping',
          ui.check('Offer free shipping above a threshold', 'shipping.enabled', sh.enabled) +
          '<div class="grid2">' + ui.field('Free shipping at or above ($)', 'shipping.freeThreshold', sh.freeThreshold, { type: 'number', min: 0 }) +
          ui.field('Flat rate below threshold ($)', 'shipping.flatRate', sh.flatRate, { type: 'number', min: 0 }) + '</div>' +
          '<p class="hint">The announcement bar follows this automatically when it uses {{free_shipping}}.</p>' + ui.saveBtn()) +

        '<section class="panel"><h2 class="ph3 h1row" style="font-size:14px">Discount codes <button class="btn loom sm" type="button" data-a="promo-add">+ New code</button></h2>' +
        welcomeWarning() +
        (promos.length ? '<div class="tablewrap"><table class="adt promot"><thead><tr>' +
          '<th scope="col">Code</th><th scope="col">Type</th><th scope="col">Value</th><th scope="col">Min. order ($)</th><th scope="col">Starts</th><th scope="col">Ends</th>' +
          '<th scope="col">Usage limit</th><th scope="col">Used</th><th scope="col">One per customer</th><th scope="col">Active</th><th scope="col"><span class="sr-only">Delete</span></th></tr></thead><tbody>' +
          promos.map(function (p, i) {
            var b = 'promos.' + i + '.';
            var used = subs.used[p.code] || 0;
            var state = !p.active ? '' : (p.endsAt && p.endsAt < today ? ' <span class="tag">Expired</span>' : (p.startsAt && p.startsAt > today ? ' <span class="tag">Scheduled</span>' : (p.usageLimit && used >= p.usageLimit ? ' <span class="tag clay">Used up</span>' : '')));
            return '<tr><td><input type="text" class="codein" value="' + esc(p.code) + '" data-bind="' + b + 'code" data-type="upper" aria-label="Code" maxlength="30">' + state + '</td>' +
              '<td><select data-bind="' + b + 'type" aria-label="Discount type for ' + esc(p.code) + '"><option value="percent"' + (p.type === 'percent' ? ' selected' : '') + '>% off</option><option value="fixed"' + (p.type === 'fixed' ? ' selected' : '') + '>$ off</option></select></td>' +
              '<td><input type="number" step="0.01" min="0" style="width:80px" value="' + esc(p.value) + '" data-bind="' + b + 'value" data-type="number" aria-label="Discount value for ' + esc(p.code) + '"></td>' +
              '<td><input type="number" step="1" min="0" style="width:80px" value="' + esc(p.minOrder || 0) + '" data-bind="' + b + 'minOrder" data-type="number" aria-label="Minimum order for ' + esc(p.code) + '"></td>' +
              '<td><input type="date" value="' + esc(p.startsAt || '') + '" data-bind="' + b + 'startsAt" aria-label="Start date for ' + esc(p.code) + '"></td>' +
              '<td><input type="date" value="' + esc(p.endsAt || '') + '" data-bind="' + b + 'endsAt" aria-label="End date for ' + esc(p.code) + '"></td>' +
              '<td><input type="number" step="1" min="0" style="width:80px" value="' + esc(p.usageLimit || '') + '" placeholder="∞" data-bind="' + b + 'usageLimit" data-type="int" aria-label="Usage limit for ' + esc(p.code) + ' (blank = unlimited)"></td>' +
              '<td>' + used + '</td>' +
              '<td style="text-align:center"><input type="checkbox"' + (p.oncePerCustomer ? ' checked' : '') + ' data-bind="' + b + 'oncePerCustomer" aria-label="One use per customer for ' + esc(p.code) + '"></td>' +
              '<td style="text-align:center"><input type="checkbox"' + (p.active ? ' checked' : '') + ' data-bind="' + b + 'active" data-live="promoActive" aria-label="Active: ' + esc(p.code) + '"></td>' +
              '<td><button class="txtbtn danger" type="button" data-a="promo-delete" data-i="' + i + '">Delete</button></td></tr>';
          }).join('') + '</tbody></table></div>' +
          '<p class="hint">Blank usage limit = unlimited. Dates are inclusive. “One per customer” is checked by email at checkout. Limits are enforced by the database, not just the cart.</p>'
          : '<p class="muted" style="font-size:14px">No codes yet.</p>') + ui.saveBtn() + '</section>' +

        '<section class="panel"><h2 class="ph3 h1row" style="font-size:14px">Newsletter sign-ups <span class="tag green">' + (subs.list ? subs.list.length + ' on the list' : 'loading…') + '</span></h2>' +
        '<div class="grid2">' + ui.field('Welcome code for new sign-ups', 'newsletter.couponCode', d.newsletter.couponCode || '', {
          options: [['', '— No code —']].concat(promos.filter(function (p) { return p.active; }).map(function (p) { return [p.code, p.code + ' (' + (p.type === 'percent' ? p.value + '% off' : u.money(p.value) + ' off') + ')']; })),
          hint: 'Shown on screen after sign-up. Pick one active code.' }) + '</div>' + ui.saveBtn('Save welcome code') +
        '<div id="subsBox">' + subsTable() + '</div></section>';
    },
    after: function () {
      if (!subs.list) loadSubs().then(function () { if (A.tab === 'promotions') { var y = window.scrollY; A.render(); window.scrollTo(0, y); } });
      u.qsa('#adminMain input[data-subsel]').forEach(function (cb) {
        cb.addEventListener('change', function () { subs.selected[cb.dataset.subsel] = cb.checked; refreshSubs(); });
      });
      var all = document.getElementById('subSelAll');
      if (all) all.addEventListener('change', function () { (subs.list || []).forEach(function (s) { subs.selected[s.id] = all.checked; }); refreshSubs(); });
    }
  };

  function refreshSubs() { var y = window.scrollY; A.render(); window.scrollTo(0, y); }

  function subsTable() {
    if (!subs.list) return '<p class="hint">Loading subscribers…</p>';
    if (subs.error) return '<p class="badmsg">Couldn’t load subscribers: ' + esc(subs.error) + '</p>';
    if (!subs.list.length) return '<p class="muted" style="font-size:14px">No sign-ups yet. They appear here when shoppers join from the footer.</p>';
    var sel = subs.list.filter(function (s) { return subs.selected[s.id]; }).length;
    return '<div class="btnrow" style="margin:14px 0 10px"><button class="btn ghost sm" type="button" data-a="subs-copy">Copy emails</button>' +
      '<button class="btn ghost sm" type="button" data-a="subs-csv">⬇ Download CSV</button>' +
      '<button class="btn ghost sm dangerbtn" type="button" data-a="subs-delete"' + (sel ? '' : ' disabled') + '>Delete selected (' + sel + ')</button></div>' +
      '<div class="tablewrap"><table class="adt"><thead><tr><th><input type="checkbox" id="subSelAll" aria-label="Select all subscribers"></th><th>Email</th><th>Code</th><th>Source</th><th>Signed up</th></tr></thead><tbody>' +
      subs.list.map(function (s) {
        return '<tr><td><input type="checkbox" data-subsel="' + s.id + '"' + (subs.selected[s.id] ? ' checked' : '') + ' aria-label="Select ' + esc(s.email) + '"></td><td>' + esc(s.email) + '</td><td>' + (s.code ? A.ui.tag(s.code) : '—') + '</td><td class="hint">' + esc(s.source || '') + '</td><td class="hint">' + esc(u.fmtDate(s.created_at)) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  A.live.promoActive = function () { var y = window.scrollY; A.render(); window.scrollTo(0, y); };

  A.actions['promo-add'] = function () {
    var n = (A.draft.promos || []).length + 1, code = 'NEWCODE' + n;
    while (A.draft.promos.some(function (p) { return p.code === code; })) code = 'NEWCODE' + (++n);
    A.draft.promos.push({ id: u.uid('promo'), code: code, type: 'percent', value: 10, minOrder: 0, active: false, startsAt: '', endsAt: '', usageLimit: 0, oncePerCustomer: false });
    refreshSubs();
  };
  A.actions['promo-delete'] = function (el) {
    var p = A.draft.promos[+el.dataset.i];
    if (!confirm('Delete code ' + p.code + '? Click Save changes afterwards.')) return;
    A.draft.promos.splice(+el.dataset.i, 1);
    if (A.draft.newsletter.couponCode === p.code) A.draft.newsletter.couponCode = '';
    refreshSubs();
  };
  A.actions['subs-copy'] = function () {
    var text = (subs.list || []).map(function (s) { return s.email; }).join(', ');
    navigator.clipboard.writeText(text).then(function () { u.toast('Emails copied'); }, function () { u.toast('Copy failed'); });
  };
  A.actions['subs-csv'] = function () {
    var data = [['email', 'code', 'source', 'created_at']];
    (subs.list || []).forEach(function (s) { data.push([s.email, s.code, s.source, s.created_at]); });
    A.download('home-weavers-subscribers-' + A.today() + '.csv', A.toCsv(data), 'text/csv');
  };
  A.actions['subs-delete'] = async function () {
    var ids = (subs.list || []).filter(function (s) { return subs.selected[s.id]; }).map(function (s) { return s.id; });
    if (!ids.length) return;
    if (!confirm('Delete ' + u.plural(ids.length, 'subscriber') + '? This can’t be undone.')) return;
    var r = await A.sb.from('subscribers').delete().in('id', ids).select('id');
    if (r.error) { u.toast('Delete failed: ' + r.error.message); return; }
    var n = (r.data || []).length;
    subs.list = subs.list.filter(function (s) { return !(r.data || []).some(function (x) { return x.id === s.id; }); });
    subs.selected = {};
    refreshSubs();
    u.toast(n === ids.length ? 'Deleted ' + u.plural(n, 'subscriber') : 'Only ' + n + ' of ' + ids.length + ' deleted');
  };
})(window.HW = window.HW || {});
