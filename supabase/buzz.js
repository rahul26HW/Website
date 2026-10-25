/* Home Weavers — the card that slides in from the corner.

   "Someone in New Jersey just bought — Willow Hand Towels", bottom left, dismissible.
   It is shop-wide and that is the whole reason it exists: a product nobody has bought yet
   still shows that the shop is alive, because what the card reports is usually some other
   product. It appears on product pages.

   What it will not say is who. The shops this is copied from print a first name and a city
   — "Mrinal from Ghaziabad just bought" — which is a real customer identified to every
   stranger on the page. A state and a coarse time is the same reassurance without the
   person in it, and it is exactly what the product page already says out loud.

   Dismissing it is remembered for the rest of the browser tab: someone who closed it once
   has said what they think of it. */
(function (HW) {
  'use strict';

  var u = HW.u, esc = u.esc;

  var KEY = 'hw:buzzOff';
  var GAP = 11000;        // between cards
  var SHOW = 6000;        // how long one stays
  var FIRST = 7000;       // nothing at all until the page has been read for a moment

  var rows = null, i = 0, timer = null, started = false, el = null;

  function off() {
    try { return u.session.get(KEY, '') === '1'; } catch (e) { return false; }
  }

  function stop() {
    if (timer) { clearTimeout(timer); timer = null; }
    started = false;
    if (el) { el.remove(); el = null; }
  }

  function dismiss() {
    try { u.session.set(KEY, '1'); } catch (e) { /* private mode */ }
    stop();
  }

  HW.actions = HW.actions || {};

  function node() {
    if (el && document.body.contains(el)) return el;
    el = document.createElement('div');
    el.className = 'buzz';
    el.setAttribute('role', 'status');
    el.hidden = true;
    document.body.appendChild(el);
    return el;
  }

  /* A row only earns a card when we can name the product it refers to and the state it
     came from. Anything else would read as "someone somewhere bought something". */
  function usable(r) {
    if (!r || !r.state || !r.when) return null;
    var p = (HW.DB.products || []).find(function (x) { return x.id === r.product_id; });
    if (!p || p.hidden) return null;
    return { p: p, state: r.state, when: r.when };
  }

  function stateName(code) {
    var list = (HW.checkout && HW.checkout.states && HW.checkout.states()) || [];
    var up = String(code || '').toUpperCase();
    for (var k = 0; k < list.length; k++) if (list[k][0] === up) return list[k][1];
    return code;
  }

  function show(r) {
    var box = node();
    var img = HW.asset(HW.m.thumb(HW.m.imageOrSwatch(r.p)));
    box.innerHTML =
      '<a class="buzz-in" href="' + esc(HW.link('/product/' + r.p.slug)) + '">' +
      '<img src="' + esc(img) + '" alt="" width="54" height="54">' +
      '<span class="buzz-txt"><span class="buzz-who">Someone in ' + esc(stateName(r.state)) + ' bought ' + esc(r.when) + '</span>' +
      '<b>' + esc(HW.seo.clip(r.p.name, 46)) + '</b></span></a>' +
      '<button class="buzz-x" type="button" aria-label="Stop showing these">✕</button>';
    box.querySelector('.buzz-x').addEventListener('click', dismiss);
    box.hidden = false;
    // The class drives the slide; set it on the next frame so the transition actually runs.
    requestAnimationFrame(function () { box.classList.add('on'); });
    timer = setTimeout(hide, SHOW);
  }

  function hide() {
    if (!el) return;
    el.classList.remove('on');
    timer = setTimeout(function () {
      if (el) el.hidden = true;
      timer = setTimeout(next, GAP - 600);
    }, 600);
  }

  function next() {
    if (off() || !rows || !rows.length) return;
    var r = null, tries = 0;
    while (!r && tries < rows.length) { r = usable(rows[i % rows.length]); i++; tries++; }
    if (!r) return;             // nothing in the batch we can honestly name
    show(r);
  }

  HW.buzz = {
    /* Called on every product page. Loads once per page session, then cycles. */
    start: function () {
      if (started || off()) return;
      started = true;
      if (!HW.api || !HW.api.rpc) return;
      if (rows) { timer = setTimeout(next, FIRST); return; }
      HW.api.rpc('recent_purchases', { p_limit: 8 }).then(function (d) {
        rows = Array.isArray(d) ? d : [];
        if (!rows.length) { started = false; return; }
        timer = setTimeout(next, FIRST);
      }).catch(function () { started = false; });
    },
    stop: stop,
    /* For the console, and for anyone wondering why it went quiet. */
    silenced: off
  };

  // Leaving the product page takes the card with it.
  window.addEventListener('popstate', function () {
    if (!/\/product\//.test(location.pathname)) stop();
  });

})(window.HW = window.HW || {});
