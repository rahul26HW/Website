/* Home Weavers — admin: Analytics.
   SAMPLE DATA for now: the numbers below are made up so the layout can be agreed before anything is measured.
   Nothing here reads from the store yet, and no visitor is tracked. */
(function (HW) {
  'use strict';

  var A = HW.A, u = HW.u, esc = u.esc;
  var an = { days: 30 };
  var RANGES = [[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days']];

  var money = function (n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var num = function (n) { return Number(n || 0).toLocaleString('en-US'); };
  var pct = function (n) { return (Math.round(n * 10) / 10).toFixed(1) + '%'; };
  var scale = function (per30) { return Math.round(per30 / 30 * an.days); };

  /* A steady made-up series, so the picture doesn't jump around between renders. */
  function series(days, base, swing, seed) {
    var out = [], x = seed || 7;
    for (var i = 0; i < days; i++) {
      x = (x * 9301 + 49297) % 233280;
      var wave = Math.sin(i / 6) * 0.18 + (i % 7 === 5 || i % 7 === 6 ? 0.22 : 0);   // weekends run higher
      out.push(Math.max(1, Math.round(base * (1 + wave) + (x / 233280 - 0.5) * swing)));
    }
    return out;
  }

  function sparkline(a, b) {
    var w = 720, h = 150, pad = 4, max = Math.max.apply(null, a) * 1.15;
    var x = function (i) { return pad + i * (w - pad * 2) / (a.length - 1); };
    var y = function (v) { return h - pad - v / max * (h - pad * 2); };
    var path = function (arr) { return arr.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); }).join(' '); };
    var maxB = Math.max.apply(null, b), yb = function (v) { return h - pad - v / (maxB * 1.6) * (h - pad * 2); };
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="150" preserveAspectRatio="none" role="img" aria-label="Visits and orders by day" style="display:block">' +
      '<path d="' + path(a) + ' L' + x(a.length - 1).toFixed(1) + ' ' + (h - pad) + ' L' + pad + ' ' + (h - pad) + ' Z" fill="rgba(47,74,61,.10)"/>' +
      '<path d="' + path(a) + '" fill="none" stroke="#2F4A3D" stroke-width="2"/>' +
      '<path d="' + b.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + yb(v).toFixed(1); }).join(' ') + '" fill="none" stroke="#B4674A" stroke-width="2" stroke-dasharray="4 3"/>' +
      '</svg>' +
      '<p class="hint" style="margin:6px 0 0"><span style="color:#2F4A3D">━</span> Visits &nbsp; <span style="color:#B4674A">╌</span> Orders</p>';
  }

  function table(head, rows, cls) {
    return '<div class="tablewrap"><table class="adt ' + (cls || '') + '"><thead><tr>' +
      head.map(function (h, i) { return '<th' + (i ? ' style="text-align:right"' : '') + '>' + esc(h) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.map(function (r) {
        return '<tr>' + r.map(function (c, i) { return '<td' + (i ? ' style="text-align:right"' : '') + '>' + c + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* ---- the made-up numbers ---- */
  function data() {
    var d = an.days;
    var visits = scale(4820), orders = scale(63), revenue = scale(2740.5);
    return {
      visits: visits,
      views: scale(11260),
      orders: orders,
      revenue: revenue,
      conv: orders / visits * 100,
      aov: revenue / orders,
      newCust: scale(41),
      returning: scale(22),
      carts: scale(214),
      daily: { visits: series(d, visits / d, visits / d * 0.5, 11), orders: series(d, orders / d, orders / d * 0.9, 29) },
      sources: [
        ['Google — free search', 0.34, 0.021, 'organic'],
        ['Direct / typed the address', 0.22, 0.028, 'direct'],
        ['Google Ads', 0.14, 0.033, 'paid'],
        ['Instagram', 0.11, 0.009, 'social'],
        ['Facebook', 0.08, 0.011, 'social'],
        ['Pinterest', 0.06, 0.014, 'social'],
        ['Email', 0.05, 0.047, 'email']
      ],
      queries: [
        ['cotton bath towels set', 12840, 412, 4.2],
        ['bath rug non slip', 9310, 268, 6.8],
        ['shower curtain fabric 70x72', 6120, 231, 5.1],
        ['home weavers towels', 3180, 604, 1.4],
        ['wash cloths bulk', 2470, 88, 9.3]
      ],
      products: [
        ['Willow Bath Towels - 27x54', 4210, 612, 148, 31],
        ['Impression Micro Bath Rug', 3680, 505, 121, 24],
        ['Elmstone Printed Shower Curtain - 70x72', 2940, 388, 96, 18],
        ['Hazel Hand Towels - 16x24', 2110, 244, 61, 11],
        ['Ashford 4 Piece Ceramic Set', 1580, 190, 44, 7]
      ],
      devices: [['Mobile', 0.63], ['Desktop', 0.31], ['Tablet', 0.06]]
    };
  }

  A.tabs.analytics = {
    render: function () {
      var d = data();
      var chips = RANGES.map(function (r) {
        return '<button class="chip' + (an.days === r[0] ? ' active' : '') + '" type="button" data-a="an-range" data-d="' + r[0] + '" aria-pressed="' + (an.days === r[0]) + '">' + esc(r[1]) + '</button>';
      }).join('');

      var stats = [
        [num(d.visits), 'Visits'],
        [num(d.views), 'Product views'],
        [num(d.carts), 'Added to cart'],
        [num(d.orders), 'Orders'],
        [money(d.revenue), 'Revenue'],
        [pct(d.conv), 'Visit → order']
      ].map(function (s) { return '<div class="stat"><div class="n">' + s[0] + '</div><div class="l">' + s[1] + '</div></div>'; }).join('');

      var people = [
        [num(d.newCust), 'New customers'],
        [num(d.returning), 'Ordered before'],
        [money(d.aov), 'Average order'],
        [pct(d.newCust / (d.newCust + d.returning) * 100), 'Share new']
      ].map(function (s) { return '<div class="stat"><div class="n">' + s[0] + '</div><div class="l">' + s[1] + '</div></div>'; }).join('');

      var srcRows = d.sources.map(function (s) {
        var v = Math.round(d.visits * s[1]), o = Math.round(v * s[2]);
        return [esc(s[0]) + ' ' + A.ui.tag(s[3], s[3] === 'paid' ? 'clay' : ''), num(v), pct(s[1] * 100), num(o), money(o * d.aov), pct(s[2] * 100)];
      });

      var qRows = d.queries.map(function (q) {
        var imp = scale(q[1]), clicks = scale(q[2]);
        return [esc(q[0]), num(imp), num(clicks), pct(clicks / imp * 100), q[3].toFixed(1)];
      });

      var pRows = d.products.map(function (p) {
        var seen = scale(p[1]), clicks = scale(p[2]), carts = scale(p[3]), ord = scale(p[4]);
        return [esc(p[0]), num(seen), num(clicks), pct(clicks / seen * 100), num(carts), num(ord), pct(ord / clicks * 100)];
      });

      var devRows = d.devices.map(function (x) { return [esc(x[0]), num(Math.round(d.visits * x[1])), pct(x[1] * 100)]; });

      return '<h1 class="h1row">Analytics <span class="btnrow">' + chips + '</span></h1>' +
        A.ui.warn('<b>Sample numbers.</b> Nothing here is measured yet — this is a layout to agree on. ' +
          'Say the word and I will start collecting the real figures on your own server (no Google Analytics, no advertising cookies), ' +
          'and connect Google Search Console for the search impressions and clicks.') +

        '<div class="stat-row stat-6">' + stats + '</div>' +

        A.ui.panel('Visits and orders by day', sparkline(d.daily.visits, d.daily.orders)) +

        A.ui.panel('Where visitors came from',
          table(['Source', 'Visits', 'Share', 'Orders', 'Revenue', 'Visit → order'], srcRows)) +

        '<div class="stat-row">' + people + '</div>' +

        A.ui.panel('Google search: what people searched before clicking',
          table(['Search term', 'Impressions', 'Clicks', 'Click rate', 'Avg position'], qRows) +
          '<p class="hint">Impressions = how often a Home Weavers page appeared in Google results. Needs Google Search Console (free) connected to this site.</p>') +

        A.ui.panel('Products',
          table(['Product', 'Card seen', 'Card clicked', 'Click rate', 'Added to cart', 'Orders', 'Click → order'], pRows) +
          '<p class="hint">“Card seen” counts a product card actually scrolled into view on a category, search or home page.</p>') +

        A.ui.panel('Devices', table(['Device', 'Visits', 'Share'], devRows)) +

        A.ui.panel('What I would need for the real thing',
          '<ul class="bullets">' +
          '<li><b>On your own server (no third parties):</b> visits, where each visit came from, product cards seen and clicked, add to cart, checkout started, orders, new vs returning. Stored without names, emails or addresses, and without advertising cookies — so the cookie banner stays as it is.</li>' +
          '<li><b>Google Search Console</b> (free, you own it): the search terms, impressions, clicks and position table. I would need you to verify the site there once; I can prepare the verification file.</li>' +
          '<li><b>Google Ads / Meta:</b> only if you run ads — spend and return on ad spend would need each account connected.</li>' +
          '<li>Figures start from the day collection is switched on; nothing can be filled in for the past.</li>' +
          '</ul>');
    }
  };

  A.actions['an-range'] = function (el) { an.days = Number(el.dataset.d) || 30; A.render(); };
})(window.HW = window.HW || {});
