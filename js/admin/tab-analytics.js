/* Home Weavers — admin: Analytics.
   Real figures, measured on our own server (public.events + orders). No Google Analytics, no advertising
   cookies, nothing personal: a visit is a random number that lives in one browser tab. */
(function (HW) {
  'use strict';

  var A = HW.A, u = HW.u, esc = u.esc;
  var an = { days: 30, data: null, loading: false, error: null, loadedFor: null };
  var RANGES = [[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days']];

  var money = function (n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var num = function (n) { return Number(n || 0).toLocaleString('en-US'); };
  var rate = function (a, b) { return b > 0 ? (Math.round(a / b * 1000) / 10).toFixed(1) + '%' : '—'; };

  async function load() {
    an.loading = true; an.error = null;
    var r = await A.sb.rpc('admin_analytics', { p_days: an.days });
    an.loading = false;
    an.loadedFor = an.days;
    if (r.error) { an.error = r.error.message; an.data = null; return; }
    an.data = r.data || null;
  }

  /* Visits and orders by day, drawn from the numbers themselves. */
  function chart(daily) {
    var w = 720, h = 150, pad = 4;
    var vs = daily.map(function (d) { return Number(d.visits) || 0; });
    var os = daily.map(function (d) { return Number(d.orders) || 0; });
    if (vs.length < 2) return '<p class="hint">Not enough days yet.</p>';
    var maxV = Math.max.apply(null, vs) || 1, maxO = Math.max.apply(null, os) || 1;
    var x = function (i) { return pad + i * (w - pad * 2) / (vs.length - 1); };
    var y = function (v, max) { return h - pad - v / (max * 1.15) * (h - pad * 2); };
    var line = function (arr, max) { return arr.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v, max).toFixed(1); }).join(' '); };
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="150" preserveAspectRatio="none" role="img" aria-label="Visits and orders by day" style="display:block">' +
      '<path d="' + line(vs, maxV) + ' L' + x(vs.length - 1).toFixed(1) + ' ' + (h - pad) + ' L' + pad + ' ' + (h - pad) + ' Z" fill="rgba(47,74,61,.10)"/>' +
      '<path d="' + line(vs, maxV) + '" fill="none" stroke="#2F4A3D" stroke-width="2"/>' +
      '<path d="' + line(os, maxO * 1.6) + '" fill="none" stroke="#B4674A" stroke-width="2" stroke-dasharray="4 3"/>' +
      '</svg><p class="hint" style="margin:6px 0 0"><span style="color:#2F4A3D">━</span> Visits (busiest day ' + num(maxV) + ')' +
      ' &nbsp; <span style="color:#B4674A">╌</span> Orders (busiest day ' + num(maxO) + ')</p>';
  }

  function table(head, rows, empty) {
    if (!rows.length) return '<p class="hint">' + esc(empty) + '</p>';
    return '<div class="tablewrap"><table class="adt"><thead><tr>' +
      head.map(function (h, i) { return '<th' + (i ? ' style="text-align:right"' : '') + '>' + esc(h) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.map(function (r) {
        return '<tr>' + r.map(function (c, i) { return '<td' + (i ? ' style="text-align:right"' : '') + '>' + c + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  function productName(id) {
    var p = (A.draft.products || []).find(function (x) { return x.id === id; });
    return p ? p.name : id;
  }

/* ----------------------------------------------------------------
   * Sales tax watch — how much this website has sold into each state.
   * A state can require you to collect its sales tax once you pass a
   * threshold there, and nobody warns you: not Snipcart, not the state.
   * Marketplace sales (Amazon, Walmart, Macy's) are collected by the
   * marketplace itself and are not in this table, which is correct.
   * ---------------------------------------------------------------- */
  var TAX_LIMIT_SALES = 100000, TAX_LIMIT_ORDERS = 200;   // the common state thresholds
  var TAX_LIMIT_TEXT = '$100,000';                        // written out, so it reads as a round number
  var TAX_WARN = 0.75;                                     // shout at three quarters of the way
  var HOME_STATE = 'NJ';
  var st = { rows: null, loading: false, error: '' };

  async function loadStates() {
    st.loading = true; st.error = '';
    try {
      var since = new Date(Date.now() - 365 * 86400000).toISOString();
      var all = [], from = 0;
      for (var page = 0; page < 20; page++) {
        var r = await A.sb.from('orders')
          .select('total,status,created_at,shipping_address')
          .gte('created_at', since).range(from, from + 999);
        if (r.error) throw new Error(r.error.message);
        all = all.concat(r.data || []);
        if ((r.data || []).length < 1000) break;
        from += 1000;
      }
      var by = {};
      all.forEach(function (o) {
        if (/^(cancelled|refunded)$/.test(o.status || '')) return;   // money that was given back is not a sale
        var s = String(((o.shipping_address || {}).state) || '').trim().toUpperCase();
        if (!s) return;
        by[s] = by[s] || { state: s, orders: 0, sales: 0 };
        by[s].orders++; by[s].sales += Number(o.total) || 0;
      });
      st.rows = Object.keys(by).map(function (k) { return by[k]; })
        .sort(function (a, b) { return b.sales - a.sales; });
    } catch (e) { st.error = e.message || String(e); st.rows = []; }
    st.loading = false; A.render();
  }

  function stateLevel(r) {
    if (r.state === HOME_STATE) return { cls: 'green', label: 'Registered — collecting' };
    var share = Math.max(r.sales / TAX_LIMIT_SALES, r.orders / TAX_LIMIT_ORDERS);
    if (share >= 1) return { cls: 'clay', label: 'Over the usual threshold — ask your accountant now' };
    if (share >= TAX_WARN) return { cls: 'clay', label: 'Getting close — worth asking your accountant' };
    return { cls: '', label: 'Well under' };
  }

  function taxPanel() {
    if (st.rows === null) { if (!st.loading) loadStates(); return A.ui.panel('Sales tax watch', '<p class="hint">Adding up sales by state…</p>'); }
    if (st.error) return A.ui.panel('Sales tax watch', A.ui.warn('<b>Couldn’t read the orders:</b> ' + esc(st.error)));
    var near = st.rows.filter(function (r) { return r.state !== HOME_STATE && Math.max(r.sales / TAX_LIMIT_SALES, r.orders / TAX_LIMIT_ORDERS) >= TAX_WARN; });
    var rows = st.rows.map(function (r) {
      var lv = stateLevel(r);
      return [esc(r.state), num(r.orders), u.money(r.sales), (lv.cls ? A.ui.tag(lv.label, lv.cls) : '<span class="hint">' + lv.label + '</span>')];
    });
    return A.ui.panel('Sales tax watch',
      (near.length
        ? A.ui.warn('<b>' + near.map(function (r) { return esc(r.state); }).join(', ') +
            '</b> ' + (near.length === 1 ? 'is' : 'are') + ' near the usual threshold for collecting sales tax ' +
            '(about ' + TAX_LIMIT_TEXT + ' or ' + TAX_LIMIT_ORDERS + ' orders in a year). Ask your accountant whether to register there.')
        : '<p class="hint" style="margin:-6px 0 12px">Website orders in the last 12 months, by delivery state. ' +
          'Amazon, Walmart and the other marketplaces collect their own sales tax, so they are not counted here.</p>') +
      table(['State', 'Orders', 'Sales', 'Where you stand'], rows, 'No website orders yet.') +
      '<p class="hint" style="margin-top:12px">Most states ask you to collect once you pass about ' +
      TAX_LIMIT_TEXT + ' or ' + TAX_LIMIT_ORDERS + ' orders into that state in a year; a few differ ' +
      '(California and Texas are higher). This is a prompt to ask your accountant, not tax advice.</p>');
  }

  A.tabs.analytics = {
    render: function () {
      var chips = RANGES.map(function (r) {
        return '<button class="chip' + (an.days === r[0] ? ' active' : '') + '" type="button" data-a="an-range" data-d="' + r[0] + '" aria-pressed="' + (an.days === r[0]) + '">' + esc(r[1]) + '</button>';
      }).join('');
      var head = '<h1 class="h1row">Analytics <span class="btnrow">' + chips +
        '<button class="btn ghost sm" type="button" data-a="an-refresh">↻ Refresh</button></span></h1>';

      if (an.error) return head + A.ui.warn('<b>Couldn’t load the figures:</b> ' + esc(an.error));
      if (!an.data) return head + '<p class="hint">' + (an.loading ? 'Reading the figures…' : 'Loading…') + '</p>';

      var d = an.data, t = d.totals || {}, people = d.people || {};
      var stats = [
        [num(t.visits), 'Visits'],
        [num(t.views), 'Product views'],
        [num(t.carts), 'Added to cart'],
        [num(t.orders), 'Orders'],
        [money(t.revenue), 'Revenue'],
        [rate(t.orders, t.visits), 'Visit → order']
      ].map(function (s) { return '<div class="stat"><div class="n">' + s[0] + '</div><div class="l">' + s[1] + '</div></div>'; }).join('');

      var aov = t.orders > 0 ? Number(t.revenue) / Number(t.orders) : 0;
      var peopleRow = [
        [num(people.new_customers), 'First-time customers'],
        [num(people.returning_customers), 'Ordered before'],
        [money(aov), 'Average order'],
        [num(t.checkouts), 'Reached checkout']
      ].map(function (s) { return '<div class="stat"><div class="n">' + s[0] + '</div><div class="l">' + s[1] + '</div></div>'; }).join('');

      var srcRows = (d.sources || []).map(function (s) {
        return [esc(s.source) + ' ' + A.ui.tag(s.medium, s.medium === 'paid' ? 'clay' : ''),
          num(s.visits), rate(s.visits, t.visits), num(s.orders), money(s.revenue), rate(s.orders, s.visits)];
      });

      var prodRows = (d.products || []).slice(0, 25).map(function (p) {
        return [esc(productName(p.product_id)), num(p.impressions), num(p.clicks), rate(p.clicks, p.impressions),
          num(p.carts), num(p.qty), money(p.revenue)];
      });

      var devRows = (d.devices || []).map(function (x) { return [esc(x.device), num(x.visits), rate(x.visits, t.visits)]; });

      return head +
        (!t.visits ? A.ui.warn('<b>No visits recorded for this period yet.</b> Measuring starts the day it is switched on, so the figures build up from here.') : '') +
        '<div class="stat-row stat-6">' + stats + '</div>' +
        A.ui.panel('Visits and orders by day', chart(d.daily || [])) +
        A.ui.panel('Where visitors came from',
          table(['Source', 'Visits', 'Share', 'Orders', 'Revenue', 'Visit → order'], srcRows, 'No visits yet.') +
          '<p class="hint">Taken from the address people arrive on (utm tags, Google Ads and Facebook click ids) and the site that linked to us.</p>') +
        '<div class="stat-row">' + peopleRow + '</div>' +
        A.ui.panel('Products',
          table(['Product', 'Card seen', 'Card clicked', 'Click rate', 'Added to cart', 'Sold', 'Revenue'], prodRows, 'No product activity yet.') +
          '<p class="hint">“Card seen” counts a product card that was actually scrolled into view on a category, search or home page.</p>') +
        A.ui.panel('Devices', table(['Device', 'Visits', 'Share'], devRows, 'No visits yet.')) +
        taxPanel() +
        A.ui.panel('Google search',
          '<p class="hint" style="margin:0">Search terms, impressions and position come from Google Search Console, which isn’t connected yet. ' +
          'Verify the site there once and that table can be pulled in here.</p>') +
        A.ui.panel('What is and isn’t measured',
          '<ul class="bullets">' +
          '<li>Kept: the page, where the visit came from, phone/tablet/computer, which product cards were seen, clicked and added to a cart, and whether checkout was reached.</li>' +
          '<li>Never kept: names, emails, addresses, what a named person bought, IP addresses, or anything that follows someone between visits. The visit number is random and goes when the browser tab closes.</li>' +
          '<li>Figures are kept for six months, then deleted.</li>' +
          '</ul>');
    },
    after: function () {
      if (!an.loading && (!an.data || an.loadedFor !== an.days)) load().then(function () { if (A.tab === 'analytics') A.render(); });
    }
  };

  A.actions['an-range'] = function (el) { an.days = Number(el.dataset.d) || 30; an.data = null; A.render(); };
  A.actions['an-refresh'] = async function () { an.data = null; A.render(); await load(); A.render(); };
})(window.HW = window.HW || {});
