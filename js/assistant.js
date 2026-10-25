/* Home Weavers — the storefront assistant.

   Four handlers behind a router. Each one takes what the customer typed and returns the
   answer as HTML. They are deliberately separate because they answer from three different
   places: the FAQ you wrote, the catalog everyone can see, and one customer's own orders.

   Only `order` touches anything personal, and it does so the way the account page does:
   through the customer's own session, over the route that already exists. It adds no store
   of its own, logs nothing, and puts nothing in a URL. (The account page already keeps the
   signed-in customer's details on their own device; the assistant reuses that rather than
   writing more.) */
(function (HW) {
  'use strict';

  var u = HW.u, esc = u.esc;

  var A = HW.assistant = {};

  /* ---------------------------------------------------------------- *
   * Small shared pieces
   * ---------------------------------------------------------------- */
  function p(text) { return '<p>' + text + '</p>'; }
  /* The rewrite marker is a note to ourselves about where our own navigation starts. It
     must never reach the page, where it would sit in the source of every reply. */
  function unmark(html) { return String(html).split('<!--tail-->').join(''); }
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
      // A date that did not come through must not push a brand-new order below a delivered
      // one from January: being wrong about someone's money is worse than being unsorted.
      var when = function (x) { var t = Date.parse(x && x.created_at); return isNaN(t) ? Infinity : t; };
      var o = orders.slice().sort(function (a, b) { return when(b) - when(a); })[0];
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
     survives whichever way it was typed.

     It did not, in fact, survive. Stripping punctuation first turned the × in "17×24" into
     a space and left two unrelated numbers, so a shopper who typed the size off their own
     product page matched nothing in the catalogue. The pairs are joined up before anything
     else is thrown away. */
  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/["”″′]/g, ' ')
      .replace(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/g, '$1x$2')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
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

  /* 'skip' holds the entries this question has already been answered with and had
     rejected. Without it, "that wasn't it" and asking again both hand back the same
     paragraph, which is the most infuriating thing a help widget does. */
  function bestFaq(text, skip) {
    var ws = words(text);
    if (!ws.length) return null;
    var topics = topicWords();
    var best = null, bestScore = 0;
    shownFaq().forEach(function (f) {
      if (skip && skip[f.id]) return;
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
    var out = {}, sizeSet = {};
    function add(s) { norm(s).split(' ').forEach(function (w) { if (w.length > 2) out[w] = true; }); }
    (HW.DB.categories || []).forEach(function (c) {
      add(c.name);
      (c.subcategories || []).forEach(function (s) { add(s.name); });
    });
    (HW.DB.products || []).forEach(function (prod) {
      add(prod.material);
      if (!HW.m.isCollection(prod)) return;
      HW.m.optColor(prod).values.forEach(function (c) { add(c.label); });
      // A size is something a shopper asks for by name. Without these, "i need 17x24"
      // had no word the catalog recognised, so the only thing left to match was "need" —
      // which lives in "Do I need an account to order?" and got answered with that.
      HW.m.offeredSizes(prod).forEach(function (sz) {
        var k = HW.m.sizeKey(sz.label);
        if (k && k.length > 2) { out[k] = true; sizeSet[k] = true; }
        add(sz.note);        // runner, slice rug, contour rug, tank lid cover
      });
    });
    A._vocabDb = HW.DB;
    A._vocab = out;
    A._sizeVocab = sizeSet;
    return out;
  }

  /* The words in a question that name a measurement we actually stock.

     The digit is the whole test. Towel sizes are written 'Set of 2' and '3 Pieces', so
     without it the word 'sets' matched a size key and sent 'what sizes do the towel sets
     come in' — a question with a written answer — off to the product list. */
  function sizeWords(text) {
    catalogVocab();
    var sizes = A._sizeVocab || {};
    return words(text).filter(function (w) {
      if (!/[0-9]/.test(w)) return false;
      return Object.keys(sizes).some(function (v) { return hasWord(v, w); });
    });
  }

  function catalogWords(text) {
    var vocab = Object.keys(catalogVocab());
    // Whole words, give or take a plural — the same tolerance the FAQ matching uses. An open
    // prefix made "washing" a catalog word because we sell wash cloths, which sent a question
    // about laundry to the product list.
    return words(text).filter(function (w) {
      return vocab.some(function (v) { return hasWord(v, w); });
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

    // Round-robin, so every word that matched something contributes a card. Counting hits
    // alone ordered by whichever word came first in the sentence, which answered "a soft
    // cotton rug" with four cotton towels and no rug at all.
    var lists = cw.map(function (w) { return HW.search.run(w).filter(listable); })
      .filter(function (l) { return l.length; });
    var out = [], seen = {}, i = 0, more = true;
    while (more) {
      more = false;
      for (var j = 0; j < lists.length; j++) {
        var prod = lists[j][i];
        if (!prod) continue;
        more = true;
        if (!seen[prod.id]) { seen[prod.id] = true; out.push(prod); }
      }
      i++;
    }
    return out;
  }

  /* Asked as a question, or just named? "how do I wash these" wants an answer; "navy bath
     towels" wants towels, even though both contain a word our FAQ uses. */
  function isQuestion(text) {
    var t = norm(text);
    return /\?/.test(String(text)) || /^(how|what|when|where|why|who|can|could|do|does|did|is|are|will|would|should|may|must)\b/.test(t);
  }

  /* ---------------------------------------------------------------- *
   * voice — the difference between answering and being a lookup table
   * ---------------------------------------------------------------- */
  /* Nothing below understands anything. The answers are still exactly the ones written in
     Admin → FAQ, word for word. What changes is the shape of a turn: it opens by saying what
     it took the question to mean, closes by offering the next move, and carries the last turn
     forward so a follow-up fragment still lands somewhere. That is most of what separates an
     assistant from a search box — but it is manner, not comprehension, and it should not be
     mistaken for the model layer the design note describes. */

  A.turn = 0;

  /* Rotating, not random: random repeats, and the same opener twice running is the one thing
     that makes a script audibly a script. */
  function pick(list) { return list[A.turn % list.length]; }

  var SURE = ['Sure.', 'Of course.', 'Yes — here you go.', 'Happy to help.'];

  /* Suggested replies. A chip is a question the customer can ask without typing it, which is
     how a chat UI tells someone what it is actually good at. */
  function chips(list) {
    if (!list || !list.length) return '';
    return '<div class="as-chips">' + list.map(function (t) {
      return '<button class="as-chip" type="button" data-act="assist-ask" data-q="' + esc(t) + '">' + esc(t) + '</button>';
    }).join('') + '</div>';
  }

  function topQuestions(n) {
    return shownFaq().slice(0, n).map(function (f) { return f.q; });
  }

  /* Other entries the owner tagged the same way. Offered after an answer, because the next
     question is usually next door to the last one. */
  function relatedIds(entry, n) {
    return relatedEntries(entry, n).map(function (f) { return f.id; });
  }

  function related(entry, n) {
    return relatedEntries(entry, n).map(function (f) { return f.q; });
  }

  function relatedEntries(entry, n) {
    var tags = norm(entry.tags).split(' ').filter(function (w) { return w.length > 2; });
    if (!tags.length) return [];
    return shownFaq().filter(function (f) { return f.id !== entry.id; })
      .map(function (f) {
        var hay = norm(f.q) + ' ' + norm(f.tags), hits = 0;
        tags.forEach(function (w) { if (hasWord(hay, w)) hits += 1; });
        return { f: f, hits: hits };
      })
      .filter(function (r) { return r.hits > 0; })
      .sort(function (a, b) { return b.hits - a.hits; })
      .slice(0, n)
      .map(function (r) { return r.f; });
  }

  /* What the conversation is carrying. Reset when the panel opens. */
  A.ctx = { terms: [], misses: 0, lastQ: '', gave: '', rejected: {} };

  /* A follow-up is a fragment — "in navy", "what about round ones", "anything cheaper". On
     its own it matches nothing, which is exactly where a lookup table ends a conversation.
     Carrying the previous search's words forward is the smallest thing that makes the second
     question work at all. */
  /* The words that name a kind of thing rather than a quality of one. "What about rugs"
     starts a new search; "in navy" refines the last one. */
  function namesAType(text) {
    var t = norm(text);
    return (HW.DB.categories || []).some(function (c) {
      var names = [c.name, String(c.slug || '').replace(/-/g, ' ')]
        .concat((c.subcategories || []).map(function (sub) { return sub && (sub.name || sub); }));
      return names.filter(Boolean).some(function (n) {
        return norm(n).split(' ').some(function (w) { return w.length > 2 && hasWord(t, w); });
      });
    });
  }

  A.expand = function (text) {
    var t = String(text || '');
    if (!A.ctx.terms.length) return t;
    if (bestFaq(t)) return t;               // a real question, not a fragment
    if (words(t).length > 6) return t;      // a sentence, not a fragment
    if (namesAType(t)) return t;            // "what about rugs" is a fresh search
    var own = catalogWords(t);
    // Nothing in it names anything we sell, so there is no refinement here to carry — and
    // gluing the last search onto "still about Mars" would answer it with towels.
    if (!own.length) return t;
    var carry = A.ctx.terms.filter(function (w) { return own.indexOf(w) < 0; });
    return carry.length ? t + ' ' + carry.join(' ') : t;
  };

  A.handlers.faq = function (text) {
    var f = bestFaq(text, A.ctx.rejected);
    if (!f) return A.handlers.handoff(text);
    A.ctx.misses = 0;
    A.ctx.gave = f.id;
    var answer = HW.richText(HW.tokens(HW.m.pageText(f.a)));
    var more = chips(related(f, 2));
    // Confident: just answer, the way a person would. Unsure: say which question it is
    // answering, so a wrong guess is visible and correctable rather than silently wrong.
    var lead = confident(text, f)
      ? p(pick(SURE))
      : p('I’ll take that as <b>' + esc(f.q) + '</b>.');
    var tail = confident(text, f) ? '' : p('If you meant something else, tell me a bit more.');
    A.ctx.aiFaq = [f.id].concat(relatedIds(f, 2));
    A.ctx.aiProducts = [];
    A.ctx.aiConfident = confident(text, f);
    // Everything after this marker survives an AI rewrite: the suggestions and the
    // escape hatches are ours, not the model's.
    return lead + answer + tail + '<!--tail-->' + more +
      '<div class="as-actions">' + btn(HW.link('/page/faq'), 'All questions') +
      '<button class="as-nope" type="button" data-act="assist-nope">That wasn\u2019t it</button></div>';
  };

  /* ---------------------------------------------------------------- *
   * "that wasn't it"
   * ---------------------------------------------------------------- */
  /* A rejection is information, not a complaint: it rules one entry out and asks for the
     next best. Only when nothing else scores does it give up and offer a person. */
  A.reject = function () {
    var q = A.ctx.lastQ;
    if (A.ctx.gave) A.ctx.rejected[A.ctx.gave] = true;
    A.ctx.gave = '';
    if (!q) return p('Ask me again and I\u2019ll have another go.');
    var next = bestFaq(q, A.ctx.rejected);
    if (next) {
      A.ctx.gave = next.id;
      A.ctx.misses = 0;
      return p('Sorry \u2014 trying again:') +
        p('<b>' + esc(next.q) + '</b>') +
        HW.richText(HW.tokens(HW.m.pageText(next.a))) +
        '<div class="as-actions">' + btn(HW.link('/page/faq'), 'All questions') +
        '<button class="as-nope" type="button" data-act="assist-nope">Still not it</button></div>';
    }
    // Nothing written covers it. The catalogue might.
    var prods = catalogHits(q).filter(function (prod) { return !HW.m.productOut(prod); });
    if (prods.length) return p('Then you may have meant one of these:') + A.handlers.finder(q);
    return p('That\u2019s everything I have written down on it, sorry.') + contactBlock(q);
  };

  /* Not "did it beat the runner-up" — on a real FAQ two entries about shipping are always
     neck and neck — but "how much of this entry’s own question did they actually say".
     "How much is shipping" covers every word of the shipping entry and one word of the
     return-shipping one, which is the distinction the raw score cannot see. */
  function confident(text, entry) {
    var ws = words(text);
    var own = words(entry.q);
    if (!ws.length || !own.length) return false;
    var covered = own.filter(function (w) {
      return ws.some(function (q) { return hasWord(w, q); });
    }).length;
    return covered / own.length >= 0.6 && faqScore(entry, ws, topicWords()) >= 5;
  }

  /* ---------------------------------------------------------------- *
   * finder — only things we actually sell and can actually send
   * ---------------------------------------------------------------- */
  var FINDER_ROWS = 6;

  A.handlers.finder = function (text) {
    var matched = catalogHits(text);
    var available = matched.filter(function (prod) { return !HW.m.productOut(prod); });
    var hits = available.slice(0, FINDER_ROWS);
    if (!hits.length) {
      // "We don't sell that" and "that is sold out" are different answers, and only one of
      // them is true when the catalog matched but every size has gone.
      return p(matched.length
        ? 'We do make those — they’re all sold out at the moment.'
        : 'I couldn’t find anything matching that.') + contactBlock(text);
    }
    // A compact row rather than a product card. A card is 300px of mostly picture, four of
    // them fill the panel with scrolling, and its Add to cart opened the drawer *behind* the
    // panel — an action control on a surface that is only supposed to answer. The image is
    // eager because a lazy one inside this scrolling panel never loads at all.
    A.ctx.terms = catalogWords(text);
    A.ctx.misses = 0;
    A.ctx.aiProducts = hits.map(function (prod) { return prod.id; });
    A.ctx.aiFaq = [];
    A.ctx.aiConfident = true;      // real products are facts, whatever the phrasing was
    return p(pick(['Here’s what fits that:', 'These look right:', 'Closest I have:', 'Try these:'])) +
      '<ul class="as-results">' + hits.map(function (prod) {
        var r = HW.m.priceRange(prod);
        return '<li><a class="sres" href="' + esc(HW.link('/product/' + prod.slug)) + '">' +
          '<img src="' + esc(HW.asset(HW.m.thumb(HW.m.imageOrSwatch(prod)))) + '" alt="" width="56" height="56">' +
          '<span class="snm">' + esc(HW.seo.clip(prod.name, 70)) +
          '<span class="spr">' + (r.min === r.max ? u.money(r.min) : 'from ' + u.money(r.min)) + '</span></span></a></li>';
      }).join('') + '</ul>' + '<!--tail-->' +
      // Four of eighteen with no hint that fourteen were left out reads as "that is all we
      // have". Say the number, and link to the full list rather than asking anyone to
      // scroll a chat panel through it.
      (available.length > hits.length
        ? p(esc(available.length + ' matches in all.') + ' <a class="link-u" href="' +
            esc(HW.link('/search?q=' + encodeURIComponent(text))) + '">See them all</a>')
        : '') +
      p('Tell me a size, a colour or a shape and I’ll narrow it down.');
  };

  /* ---------------------------------------------------------------- *
   * handoff — a dead end that catches the question
   * ---------------------------------------------------------------- */
  /* The question is carried in this tab's own storage, never in the address bar: whatever a
     customer typed is theirs, and a URL gets copied, logged and shared. */
  function remember(text) {
    A.lastQuestion = String(text || '');
    try { u.session.set('hw:asked', A.lastQuestion); } catch (e) { /* private mode */ }
  }

  function contactAction() {
    return '<div class="as-actions">' + btn(HW.link('/page/contact-us'), 'Contact us') + '</div>';
  }

  function contactBlock(text) {
    remember(text);
    return p('Send it to us and we’ll answer properly — usually the same day.') + contactAction();
  }

  /* A first miss asks rather than surrenders — half of them are a word away from an answer,
     and "I don't know, here is a form" is how a customer decides the whole thing is useless.
     The contact link is on both replies regardless: asking again must never be the only way
     out. */
  A.handlers.handoff = function (text) {
    A.ctx.misses = (A.ctx.misses || 0) + 1;
    remember(text);
    if (A.ctx.misses === 1) {
      return p('I’m not sure I follow. I know our towels, rugs, shower curtains and accessories, and I can answer on sizes, care, delivery and returns.') +
        p('Say it another way and I’ll try again — or ask us directly.') +
        chips(topQuestions(3)) + contactAction();
    }
    return p('Still not getting there, sorry. A person will do better than me with this one.') +
      contactBlock(text);
  };

  /* ---------------------------------------------------------------- *
   * saying hello
   * ---------------------------------------------------------------- */
  /* "hi" has no word longer than two letters, so it matched nothing in the FAQ and nothing
     in the catalogue and fell through to "I'm not sure I follow" — which is a cold thing to
     say to someone who has only said hello. */
  var HELLO = ['hi', 'hii', 'hiii', 'hiya', 'hey', 'heya', 'hello', 'helo', 'hallo', 'yo',
  'hai', 'namaste', 'good morning', 'good afternoon', 'good evening', 'greetings', 'howdy'];
  var THANKS = ['thanks', 'thank you', 'thankyou', 'thanx', 'thx', 'ty', 'cheers', 'nice one',
  'appreciate it', 'thank u'];
  var BYE = ['bye', 'goodbye', 'good bye', 'see you', 'see ya', 'later', 'good night', 'cya'];
  var NODS = ['ok', 'okay', 'oki', 'k', 'kk', 'cool', 'nice', 'great', 'fine', 'sure',
  'got it', 'alright', 'perfect', 'lovely'];

  function inList(t, list) { return list.indexOf(t) >= 0; }

  /* Only when the whole message is the pleasantry. "Hi, do you ship to Canada" is a
     question wearing a greeting, and answering it with "hello" would be worse than
     ignoring the greeting entirely. */
  function pleasantry(text) {
    var t = norm(text);
    if (!t || t.length > 24) return '';
    if (inList(t, HELLO)) return 'hello';
    if (inList(t, THANKS)) return 'thanks';
    if (inList(t, BYE)) return 'bye';
    if (inList(t, NODS)) return 'nod';
    return '';
  }

  /* A greeting in front of a real question is just noise before the signal. */
  function dropHello(text) {
    var t = String(text || '');
    for (var i = 0; i < HELLO.length; i++) {
      var re = new RegExp('^\\s*' + HELLO[i] + '\\b[\\s,.!-]*', 'i');
      if (re.test(t)) { var rest = t.replace(re, '').trim(); if (rest) return rest; }
    }
    return t;
  }

  A.handlers.smalltalk = function (text) {
    var kind = pleasantry(text);
    A.ctx.misses = 0;
    if (kind === 'thanks') return p(pick(['Any time.', 'You\u2019re very welcome.', 'Glad to help.']));
    if (kind === 'bye') return p(pick(['Thanks for stopping by.', 'See you soon.', 'Take care.']));
    if (kind === 'nod') return p(pick(['Anything else I can look up?', 'Happy to keep going if there\u2019s more.']));
    var who = (HW.account && HW.account.get()) || null;
    var first = who && who.name ? String(who.name).split(' ')[0] : '';
    return p(pick(['Hello' + (first ? ' ' + esc(first) : '') + '.', 'Hi there.', 'Hello.']) +
      ' What are you looking for?') + chips(topQuestions(3));
  };

  /* ---------------------------------------------------------------- *
   * route — which handler gets it
   * ---------------------------------------------------------------- */
  /* Only a question about THEIR order. "When will my towels arrive" and "where is your
     warehouse" are not lookups, and answering those with "sign in to track your order" is the
     rudest thing this can do to someone who has not bought anything yet. */
  var ORDER_RE = /\b(my|the)\s+(order|parcel|package|delivery|shipment)\b|\border\s+(status|number)\b|\b(track|tracking|dispatched)\b|\bwhere\s+is\s+(my|the)\b/i;

  A.route = function (text) {
    var t = dropHello(String(text || ''));
    if (pleasantry(text)) return 'smalltalk';
    // The order test comes first and the catalog search second, so an order question never
    // runs through the retrieval step — which is where a model gets wired in later.
    var answer = bestFaq(t);
    if (ORDER_RE.test(t)) {
      // "How long will my order take" names an order but asks about our dispatch time, not
      // about theirs. The question frame tells them apart: a lookup has no "how long" in it.
      var framed = words(t).some(function (w) { return FRAME.indexOf(w) >= 0; });
      if (!(framed && answer)) return 'order';
    }
    // Something we cannot actually sell them should not outrank an answer we can give.
    var products = catalogHits(t).filter(function (prod) { return !HW.m.productOut(prod); }).length;
    // When both could answer: a question gets an answer, and so does a word that names a
    // subject rather than a thing. "Navy bath towels" wants towels; "care" and "washing" want
    // the care answer, even though the catalog mentions those words too. The test is whether
    // what they typed names something we sell.
    // A size is the most concrete thing a shopper can type, and typing one is asking to
    // be shown things. "What size is 17x24" is about a rug, not about our sizing policy,
    // however much it opens like a question.
    if (products && sizeWords(t).length) return 'finder';
    if (answer && products) {
      var namesAThing = catalogWords(t).length > 0;
      return (isQuestion(t) || !namesAThing) ? 'faq' : 'finder';
    }
    if (answer) return 'faq';
    if (products) return 'finder';
    return 'handoff';
  };

  /* The launcher stays hidden until there is both a catalog to search and at least one answer
     written. An assistant with no answers sends every question to the contact form, which is
     worse than no assistant: it looks like help and isn't. */
  A.ready = function () {
    return !!(HW.DB && Array.isArray(HW.DB.products) && HW.DB.products.length && shownFaq().length);
  };

  /* ---------------------------------------------------------------- *
   * the model layer
   * ---------------------------------------------------------------- */
  /* Off unless the shop turns it on in Admin. When it is on, the written answer is still
     produced first and still decides WHICH entries are relevant — the model only gets
     their ids and writes the sentence. If it is slow, unreachable, or says nothing, the
     written answer is what the customer sees. The feature can fail completely and the
     assistant still works exactly as it did yesterday. */
  function aiOn() {
    return !!(((HW.DB || {}).settings || {}).aiAssistant) && !!(HW.api && HW.api.server);
  }

  var AI_WAIT = 6000;

  /* Through the same helper the rest of the site uses to reach the function, so the URL
     and the headers are decided in one place rather than two. A slow model must not leave
     the bubble sitting on an ellipsis, so the wait is capped and the written answer wins
     the race by default. */
  function aiAsk(question) {
    var live = HW.api.server('/ask', {
      q: question, faq: A.ctx.aiFaq || [], products: A.ctx.aiProducts || []
    }).then(function (d) {
      return d && typeof d.text === 'string' ? d.text.trim() : '';
    });
    var giveUp = new Promise(function (resolve) { setTimeout(function () { resolve(''); }, AI_WAIT); });
    return Promise.race([live, giveUp]);
  }

  /* Swaps the written prose for the model's sentence and keeps our own tail — the
     suggested questions, "All questions" and "That wasn't it" are navigation, and a
     model has no business rewriting those. */
  function aiRewrite(question, route, html) {
    if (!aiOn()) return html;
    if (route !== 'faq' && route !== 'finder') return html;
    /* Only when the written answer was a confident match. When Ada is unsure she says so
       and shows the question she settled on, which a customer can correct — and that is
       exactly the moment a model stops quoting and starts filling the gap from what shops
       are generally like. The hedge is worth more than a fluent guess. */
    if (!A.ctx.aiConfident) return html;
    var parts = String(html).split('<!--tail-->');
    if (parts.length !== 2) return html;
    var ids = (A.ctx.aiFaq || []).length + (A.ctx.aiProducts || []).length;
    if (!ids) return html;
    var keep = route === 'finder' ? parts[0] : '';   // the product rows stay; the FAQ prose does not
    return aiAsk(question).then(function (text) {
      if (!text) return html;
      return (route === 'finder' ? p(esc(text)) + keep : p(esc(text))) + parts[1];
    }, function () { return html; });
  }

  /* ---------------------------------------------------------------- *
   * The panel
   * ---------------------------------------------------------------- */
  var release = null;

  function log() { return document.getElementById('assistLog'); }

  function say(who, html) {
    var box = log();
    if (!box) return null;
    var row = document.createElement('div');
    row.className = 'as-row as-' + who;
    row.innerHTML = html;
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
    return row;
  }

  function greet() {
    var box = log();
    if (!box || box.childNodes.length) return;
    var who = (HW.account && HW.account.get()) || null;
    var first = who && who.name ? String(who.name).split(' ')[0] : '';
    say('bot', p('Hi' + (first ? ' ' + esc(first) : '') + ' — I’m Ada, the ' +
        esc((HW.DB.brand || {}).name || 'Home Weavers') + ' assistant.') +
      p('Tell me what you’re after and I’ll find it, or ask me about sizes, care, delivery and returns' +
        (who ? '. You’re signed in, so I can also tell you where your order is' : '') + '.') +
      chips(topQuestions(3)));
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
      A.ctx = { terms: [], misses: 0, lastQ: '', gave: '', rejected: {} };
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
    /* Its own turn, so the thread reads as a reply to something the customer said
       rather than an answer quietly rewriting itself in place. */
    reject: function () {
      say('you', '<p>That wasn\u2019t it</p>');
      var row = say('bot', '<p class="as-wait" aria-label="Typing">' +
        '<span class="as-dot"></span><span class="as-dot"></span><span class="as-dot"></span></p>');
      return new Promise(function (go) { setTimeout(go, 420); }).then(function () {
        return A.reject();
      }).then(function (html) {
        if (row) row.innerHTML = unmark(html);
        var box = log(); if (box) box.scrollTop = box.scrollHeight;
      }, function () {
        if (row) row.innerHTML = p('Something went wrong on our side. Try again in a moment.');
      });
    },
    ask: function (text) {
      text = String(text || '').trim().slice(0, 200);
      if (!text) return Promise.resolve();
      say('you', '<p>' + esc(text) + '</p>');
      // Hold the row this question owns. Writing into whichever row was last meant that two
      // questions in flight could put an order number under a laundry question.
      var row = say('bot', '<p class="as-wait" aria-label="Typing">' +
        '<span class="as-dot"></span><span class="as-dot"></span><span class="as-dot"></span></p>');
      var done = function (html) {
        if (row) row.innerHTML = unmark(html);
        var box = log();
        if (box) box.scrollTop = box.scrollHeight;
      };
      // A beat before the answer. The reply is ready immediately, and arriving immediately is
      // what makes it read as a form submission rather than someone replying.
      A.turn += 1;
      // A repeated question is a rejection said politely. Rule out what was given last
      // time rather than saying it again word for word.
      var key = norm(text);
      if (key === A.ctx.lastQ) { if (A.ctx.gave) A.ctx.rejected[A.ctx.gave] = true; }
      else { A.ctx.lastQ = key; A.ctx.rejected = {}; A.ctx.gave = ''; }
      var beat = Math.min(900, 260 + String(text).length * 10);
      // Routing and the handler both run inside the chain, so a synchronous fault lands in the
      // message below rather than escaping and leaving the bubble stuck on an ellipsis.
      return new Promise(function (go) { setTimeout(go, beat); }).then(function () {
        var q = A.expand(text);
        var route = A.route(q);
        return aiRewrite(q, route, A.handlers[route](q));
      }).then(done, function () {
        done(p('Something went wrong on our side. Try again in a moment.'));
      });
    }
  };

  function statusWord(s) {
    return { 'new': 'being prepared', accepted: 'being prepared', packed: 'packed and waiting for the courier',
      shipped: 'on its way', delivered: 'delivered', refunded: 'refunded', cancelled: 'cancelled' }[s] || 'being looked after';
  }

})(window.HW = window.HW || {});
