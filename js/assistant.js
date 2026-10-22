/* Home Weavers — the storefront assistant.

   Four handlers behind a router. Each one takes what the customer typed and returns the
   answer as HTML. They are deliberately separate because they answer from three different
   places: the FAQ you wrote, the catalog everyone can see, and one customer's own orders.

   Only `order` touches anything personal, and it does so the way the account page does:
   through the customer's own session, over the route that already exists. It stores
   nothing, logs nothing, and puts nothing in a URL. */
(function (HW) {
  'use strict';

  var u = HW.u, esc = u.esc;

  var A = HW.assistant = {};

  /* ---------------------------------------------------------------- *
   * Small shared pieces
   * ---------------------------------------------------------------- */
  function p(text) { return '<p>' + text + '</p>'; }
  function btn(href, label) { return '<a class="btn ghost sm" href="' + esc(href) + '">' + esc(label) + '</a>'; }

  function signInPrompt(why) {
    return p(esc(why)) + '<div class="as-actions">' + btn(HW.link('/account'), 'Sign in') + '</div>';
  }

  /* ---------------------------------------------------------------- *
   * order — the only handler that sees anything personal
   * ---------------------------------------------------------------- */
  A.handlers = {};

  A.handlers.order = function () {
    var acct = HW.account;
    // Signed out we stop here, before any call. We never ask for an email or an order
    // number: a stranger who can guess either should not be shown someone's order.
    if (!acct || !acct.get || !acct.get()) {
      return Promise.resolve(signInPrompt('Sign in and I can tell you exactly where your order is.'));
    }
    return acct.load().then(function (data) {
      var orders = (data && data.orders) || [];
      if (!orders.length) {
        return p('You haven’t placed an order with us yet.') +
          '<div class="as-actions">' + btn(HW.link('/'), 'Start shopping') + '</div>';
      }
      var o = orders.slice().sort(function (a, b) {
        return (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0);
      })[0];
      var link = HW.trackingUrl ? HW.trackingUrl(o.carrier, o.tracking_number) : '';
      var when = o.created_at && u.fmtDate ? u.fmtDate(o.created_at) : '';
      return p('Your most recent order is <b>' + esc(o.order_number) + '</b>' + (when ? ', placed ' + esc(when) : '') +
          '. It’s <b>' + esc(statusWord(o.status)) + '</b>.') +
        (o.tracking_number
          ? p('Tracking: ' + (link
              ? '<a class="link-u" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">' + esc(o.tracking_number) + '</a>'
              : esc(o.tracking_number)))
          : '') +
        '<div class="as-actions">' + btn(HW.link('/account/orders'), 'See all your orders') + '</div>';
    }, function () {
      // call() already signs this device out on a 401; say so plainly rather than showing a code.
      return signInPrompt('Your session has expired. Sign in again and I’ll look it up.');
    });
  };

  /* ---------------------------------------------------------------- *
   * faq — your words, quoted back
   * ---------------------------------------------------------------- */
  /* The same normalising the product search uses, so "towels" finds "towel" and 27x54
     survives whichever way it was typed. */
  function norm(s) {
    return String(s || '').toLowerCase().replace(/["”″′]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function words(s) { return norm(s).split(' ').filter(function (w) { return w.length > 2 && STOP.indexOf(w) < 0; }); }
  var STOP = ['the', 'and', 'for', 'you', 'your', 'are', 'can', 'how', 'what', 'does', 'did', 'will', 'with', 'from', 'have', 'has', 'any', 'they', 'this', 'that', 'was', 'his', 'her'];

  function shownFaq() { return (HW.DB.faq || []).filter(function (f) { return f.show !== false && (f.q || f.a); }); }

  /* Whole words, give or take a plural. Substring matching looked clever until "do you ship
     to Mars" matched "How much is shipping?" and answered it. */
  function hasWord(haystack, w) {
    return haystack.split(' ').some(function (t) {
      if (t === w) return true;
      if (t.length > w.length && t.indexOf(w) === 0) return t.length - w.length <= 2;   // towel → towels
      if (w.length > t.length && w.indexOf(t) === 0) return w.length - t.length <= 2;   // towels → towel
      return false;
    });
  }

  /* Every word the owner has written as a keyword, anywhere. Those are the words that name a
     topic in this shop; "long" and "much" are not, however often a customer types them. */
  function topicWords() {
    if (A._topics && A._topicsDb === HW.DB) return A._topics;
    var set = {};
    shownFaq().forEach(function (f) {
      norm(f.tags).split(' ').forEach(function (w) { if (w.length > 2) set[w] = true; });
    });
    A._topicsDb = HW.DB;
    A._topics = set;
    return set;
  }

  /* Scaffolding, not subject. "How long do I have to return something" is about returning,
     not about length, and "how long" being a sensible keyword on another entry must not make
     it one here. These never carry topic weight and never outrank a noun. */
  var FRAME = ['long', 'much', 'many', 'soon', 'often', 'time', 'take', 'cost'];

  /* Scores an entry against what was typed. A word the owner curated as a keyword counts for
     more than a word that merely appears: "return" decides a question, "long" does not. */
  function faqScore(entry, ws, topics) {
    var q = norm(entry.q), tags = norm(entry.tags), body = norm(entry.a), hits = 0;
    ws.forEach(function (w) {
      if (FRAME.indexOf(w) >= 0) { if (hasWord(q, w) || hasWord(tags, w)) hits += 1; return; }
      var weight = topics[w] ? 2 : 1;
      if (hasWord(q, w)) hits += 3 * weight;
      else if (hasWord(tags, w)) hits += 2 * weight;
      else if (hasWord(body, w)) hits += 1 * weight;
    });
    return hits;
  }

  function bestFaq(text) {
    var ws = words(text);
    if (!ws.length) return null;
    var topics = topicWords();
    var best = null, bestScore = 0;
    shownFaq().forEach(function (f) {
      var s = faqScore(f, ws, topics);
      if (s > bestScore) { bestScore = s; best = f; }
    });
    // One word landing in the question itself is enough — "return" in "how long do I have to
    // return something" is the whole signal. A body-only match is not: that is a coincidence.
    return bestScore >= 3 ? best : null;
  }

  /* The words in a question that name something we sell — a category, a material, a colour.
     The product search asks every word to match, which is right for a search box and wrong
     for a sentence: "a soft cotton rug" has two words that mean nothing to the catalog. */
  function catalogVocab() {
    if (A._vocab && A._vocabDb === HW.DB) return A._vocab;
    var out = {};
    function add(s) { norm(s).split(' ').forEach(function (w) { if (w.length > 2) out[w] = true; }); }
    (HW.DB.categories || []).forEach(function (c) {
      add(c.name);
      (c.subcategories || []).forEach(function (s) { add(s.name); });
    });
    (HW.DB.products || []).forEach(function (prod) {
      add(prod.material);
      if (HW.m.isCollection(prod)) HW.m.optColor(prod).values.forEach(function (c) { add(c.label); });
    });
    A._vocabDb = HW.DB;
    A._vocab = out;
    return out;
  }

  function catalogWords(text) {
    var vocab = Object.keys(catalogVocab());
    return words(text).filter(function (w) {
      return vocab.some(function (v) { return v === w || (w.length > 2 && (v.indexOf(w) === 0 || w.indexOf(v) === 0)); });
    });
  }

  /* Three passes, loosening each time. The whole phrase first, because an exact match is the
     best answer. Then only the words that name something we sell. Then each of those on its
     own, ranked by how many of them a product matched — "a cotton rug" has no exact answer
     when the rugs are microfiber, and showing rugs and cotton towels beats showing nothing. */
  function catalogHits(text) {
    if (!HW.search) return [];
    var listable = function (prod) { return HW.m.listable(prod); };
    var hits = HW.search.run(text).filter(listable);
    if (hits.length) return hits;

    var cw = catalogWords(text);
    if (!cw.length) return [];

    hits = HW.search.run(cw.join(' ')).filter(listable);
    if (hits.length) return hits;

    var score = {}, byId = {};
    cw.forEach(function (w) {
      HW.search.run(w).filter(listable).forEach(function (prod) {
        score[prod.id] = (score[prod.id] || 0) + 1;
        byId[prod.id] = prod;
      });
    });
    return Object.keys(score).sort(function (a, b) { return score[b] - score[a]; })
      .map(function (id) { return byId[id]; });
  }

  /* Asked as a question, or just named? "how do I wash these" wants an answer; "navy bath
     towels" wants towels, even though both contain a word our FAQ uses. */
  function isQuestion(text) {
    var t = norm(text);
    return /\?/.test(String(text)) || /^(how|what|when|where|why|who|can|could|do|does|did|is|are|will|would|should|may|must)\b/.test(t);
  }

  A.handlers.faq = function (text) {
    var f = bestFaq(text);
    if (!f) return A.handlers.handoff(text);
    return '<p class="asst-q">' + esc(f.q) + '</p>' +
      HW.richText(HW.tokens(HW.m.pageText(f.a))) +
      '<div class="as-actions">' + btn(HW.link('/page/faq'), 'All questions') + '</div>';
  };

  /* ---------------------------------------------------------------- *
   * finder — only things we actually sell and can actually send
   * ---------------------------------------------------------------- */
  A.handlers.finder = function (text) {
    var hits = catalogHits(text).filter(function (prod) { return !HW.m.productOut(prod); }).slice(0, 4);
    if (!hits.length) {
      return p('I couldn’t find anything matching that.') + contactBlock(text);
    }
    return p('These look closest:') +
      '<div class="p-grid asst-grid">' + hits.map(function (prod) { return HW.productCard(prod); }).join('') + '</div>';
  };

  /* ---------------------------------------------------------------- *
   * handoff — a dead end that catches the question
   * ---------------------------------------------------------------- */
  /* The question is carried in this tab's own storage, never in the address bar: whatever a
     customer typed is theirs, and a URL gets copied, logged and shared. */
  function contactBlock(text) {
    A.lastQuestion = String(text || '');
    try { u.session.set('hw:asked', A.lastQuestion); } catch (e) { /* private mode */ }
    return p('Send it to us and we’ll answer properly — usually the same day.') +
      '<div class="as-actions">' + btn(HW.link('/page/contact-us'), 'Contact us') + '</div>';
  }

  A.handlers.handoff = function (text) {
    return p('I don’t have an answer for that one.') + contactBlock(text);
  };

  /* ---------------------------------------------------------------- *
   * route — which handler gets it
   * ---------------------------------------------------------------- */
  var ORDER_RE = /\b(my|the)\s+(order|parcel|package|delivery|shipment)\b|\border\s+(status|number)\b|\b(track|tracking|dispatched|shipped|arrive|arriving|delivered)\b|\bwhere\s+is\b/i;

  A.route = function (text) {
    var t = String(text || '');
    var answer = bestFaq(t), products = catalogHits(t).length;
    if (ORDER_RE.test(t)) {
      // "How long will my order take" names an order but asks about our dispatch time, not
      // about theirs. The question frame tells them apart: a lookup has no "how long" in it.
      var framed = words(t).some(function (w) { return FRAME.indexOf(w) >= 0; });
      if (!(framed && answer)) return 'order';
    }
    // When both could answer, the phrasing decides. A question gets an answer; a list of
    // things gets things. Without that, "navy bath towels" lands on "how do I wash towels".
    if (answer && products) return isQuestion(t) ? 'faq' : 'finder';
    if (answer) return 'faq';
    if (products) return 'finder';
    return 'handoff';
  };

  /* True once a catalog is loaded. The launcher stays hidden until then, so no handler can
     run against an empty store and answer "we don't sell that". */
  A.ready = function () {
    return !!(HW.DB && Array.isArray(HW.DB.products) && HW.DB.products.length);
  };

  /* ---------------------------------------------------------------- *
   * The panel
   * ---------------------------------------------------------------- */
  var release = null;

  function log() { return document.getElementById('assistLog'); }

  function say(who, html) {
    var box = log();
    if (!box) return;
    var row = document.createElement('div');
    row.className = 'as-row as-' + who;
    row.innerHTML = html;
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
  }

  function greet() {
    var box = log();
    if (!box || box.childNodes.length) return;
    say('bot', p('Ask me about sizes, materials, care, delivery or returns — or tell me what you’re looking for.' +
      (HW.account && HW.account.get() ? ' You’re signed in, so I can also tell you where your order is.' : '')));
  }

  HW.assistantPanel = {
    open: function () {
      var panel = document.getElementById('assistPanel');
      if (!panel || !panel.hidden) return;
      if (HW.menu) HW.menu.close(false);
      if (HW.cart) HW.cart.close(false);
      if (HW.searchPanel) HW.searchPanel.close(false);
      panel.hidden = false;
      var btn = document.getElementById('assistBtn');
      if (btn) btn.setAttribute('aria-expanded', 'true');
      release = u.trapFocus(panel, HW.assistantPanel.close);
      greet();
      setTimeout(function () {
        var input = document.getElementById('assistInput');
        if (input) input.focus();
      }, 40);
    },
    close: function (restore) {
      var panel = document.getElementById('assistPanel');
      if (!panel || panel.hidden) return;
      panel.hidden = true;
      var btn = document.getElementById('assistBtn');
      if (btn) btn.setAttribute('aria-expanded', 'false');
      if (release) { release(restore); release = null; }
      var a = document.activeElement;
      if (restore !== false && btn && (!a || a === document.body || panel.contains(a))) btn.focus();
    },
    ask: function (text) {
      text = String(text || '').trim().slice(0, 200);
      if (!text) return Promise.resolve();
      say('you', '<p>' + esc(text) + '</p>');
      var where = A.route(text);
      say('bot', '<p class="as-wait">…</p>');
      return Promise.resolve(A.handlers[where](text)).then(function (html) {
        var box = log();
        if (box && box.lastChild) box.lastChild.innerHTML = html;
        if (box) box.scrollTop = box.scrollHeight;
      }, function () {
        var box = log();
        if (box && box.lastChild) box.lastChild.innerHTML = p('Something went wrong on our side. Try again in a moment.');
      });
    }
  };

  function statusWord(s) {
    return { 'new': 'being prepared', accepted: 'being prepared', packed: 'packed and waiting for the courier',
      shipped: 'on its way', delivered: 'delivered', refunded: 'refunded', cancelled: 'cancelled' }[s] || String(s || 'being prepared');
  }

})(window.HW = window.HW || {});
