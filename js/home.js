/* Home Weavers — home page: hero slider, collections rail, band, featured rail, video, features, social. */
(function (HW) {
  'use strict';

  var u = HW.u, esc = u.esc, m = HW.m;
  var GRADIENTS = ['linear-gradient(120deg,#3A5A52,#2C463F 55%,#1f332e)', 'linear-gradient(120deg,#6C5A48,#3a2f25)', 'linear-gradient(120deg,#7C8B7E 0%,#3A5A52 70%)', 'linear-gradient(120deg,#B5754F,#7a4327)'];
  var SWATCH = ['#9FB3A6', '#C9BBA6', '#B7C2C9', '#A88C6E', '#8A9B8E', '#D8CDBA', '#CBC0AC', '#B59F84', '#C7C6BE'];

  function ctaButton(text, link, cls) {
    if (!String(text || '').trim()) return '';
    var t = m.linkTarget(link);
    if (!t) return '';
    var ext = t.external ? ' target="_blank" rel="noopener noreferrer"' : '';
    return '<a class="' + cls + '" href="' + esc(t.external ? t.href : HW.link(t.href)) + '"' + ext + '>' + esc(text) + '</a>';
  }
  HW.ctaButton = ctaButton;

  function heroHTML() {
    var hero = HW.DB.hero || {};
    var slides = (hero.slides || []).filter(function (s) { return s.title || s.image || s.eyebrow; });
    if (!slides.length) slides = [{ eyebrow: '', title: HW.DB.brand.name, subtitle: HW.DB.brand.tagline, ctaText: '', ctaLink: '', image: '' }];
    var many = slides.length > 1;
    var firstPic = slides[0] && slides[0].image && !slides[0].eyebrow && !slides[0].title && !slides[0].subtitle && !String(slides[0].ctaText || '').trim();
    return '<section class="hero' + (firstPic ? ' light' : '') + '" id="heroSlider" aria-roledescription="carousel" aria-label="Featured collections">' +
      slides.map(function (s, i) {
        var bg;
        var attrs = 'data-i="' + i + '" role="group" aria-roledescription="slide" aria-label="' + (i + 1) + ' of ' + slides.length + '"' + (i === 0 ? '' : ' aria-hidden="true" inert');
        // Picture-only slide: a banner that already has its words in the image. Shown whole (not cropped), no text on top.
        if (s.image && !s.eyebrow && !s.title && !s.subtitle && !String(s.ctaText || '').trim()) {
          var pic = '<picture class="bg">' + (s.mobileImage ? '<source media="(max-width:720px)" srcset="' + esc(HW.asset(s.mobileImage)) + '">' : '') +
            '<img src="' + esc(HW.asset(s.image)) + '" alt="' + esc(s.alt || '') + '" width="1600" height="700" decoding="async"' + (i === 0 ? ' fetchpriority="high"' : ' loading="lazy"') + '></picture>';
          var target = m.linkTarget(s.ctaLink);
          var fill = /^#[0-9a-f]{3,8}$/i.test(s.bg || '') ? ' style="background:' + s.bg + '"' : '';
          return '<div class="hslide pic' + (i === 0 ? ' active' : '') + '"' + fill + ' ' + attrs + '>' +
            (target ? '<a class="piclink" href="' + esc(target.external ? target.href : HW.link(target.href)) + '"' + (target.external ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + pic + '</a>' : pic) +
            '</div>';
        }
        if (s.image) {
          var img = '<img src="' + esc(HW.asset(s.image)) + '" alt="' + esc(s.alt || '') + '" width="1600" height="700" decoding="async"' +
            (i === 0 ? ' fetchpriority="high"' : ' loading="lazy"') + '>';
          bg = '<picture class="bg">' + (s.mobileImage ? '<source media="(max-width:720px)" srcset="' + esc(HW.asset(s.mobileImage)) + '">' : '') + img + '</picture>';
        } else {
          bg = '<div class="bg" style="background:' + GRADIENTS[i % GRADIENTS.length] + '"></div>';
        }
        return '<div class="hslide ' + (i === 0 ? 'active' : '') + '" ' + attrs + '>' +
          bg + '<div class="scrim"></div>' +
          '<div class="inner"><div class="card">' +
          (s.eyebrow ? '<div class="eyebrow">' + esc(s.eyebrow) + '</div>' : '') +
          (s.title ? '<h2 class="htitle">' + esc(s.title) + '</h2>' : '') +
          (s.subtitle ? '<p>' + esc(s.subtitle) + '</p>' : '') +
          ctaButton(s.ctaText, s.ctaLink, 'btn') +
          '</div></div></div>';
      }).join('') +
      (many
        ? '<button class="hnav prev" type="button" data-act="hero-prev" aria-label="Previous slide">‹</button>' +
          '<button class="hnav next" type="button" data-act="hero-next" aria-label="Next slide">›</button>' +
          '<div class="hdots">' + slides.map(function (s, i) {
            return '<button type="button" class="' + (i === 0 ? 'active' : '') + '" data-act="hero-to" data-i="' + i + '" aria-label="Go to slide ' + (i + 1) + '"' + (i === 0 ? ' aria-current="true"' : '') + '></button>';
          }).join('') +
          '<button type="button" class="hpause" data-act="hero-toggle" aria-label="Pause slideshow"><span aria-hidden="true">❚❚</span></button></div>'
        : '') +
      '</section>';
  }

  function railHTML(id, cls, inner, label) {
    return '<div class="rail-wrap">' +
      '<button class="rail-nav prev off" type="button" data-act="rail" data-rail="' + id + '" data-dir="-1" aria-label="Scroll ' + label + ' left">‹</button>' +
      '<div class="rail ' + cls + '" id="' + id + '" tabindex="0" aria-label="' + esc(label) + '">' + inner + '</div>' +
      '<button class="rail-nav next off" type="button" data-act="rail" data-rail="' + id + '" data-dir="1" aria-label="Scroll ' + label + ' right">›</button>' +
      '</div>';
  }

  function videoEmbed(url) {
    url = (url || '').trim();
    if (!url) return '';
    var mm = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
    if (mm) return '<iframe src="https://www.youtube-nocookie.com/embed/' + mm[1] + '?autoplay=1&mute=1&loop=1&playlist=' + mm[1] + '&controls=0&modestbranding=1&playsinline=1&rel=0" title="Background video" allow="autoplay; encrypted-media; picture-in-picture" loading="lazy" tabindex="-1"></iframe>';
    mm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (mm) return '<iframe src="https://player.vimeo.com/video/' + mm[1] + '?background=1&autoplay=1&loop=1&muted=1" title="Background video" allow="autoplay; fullscreen; picture-in-picture" loading="lazy" tabindex="-1"></iframe>';
    if (/\.(mp4|webm|ogg)(\?|#|$)/i.test(url)) return '<video src="' + esc(url) + '" autoplay muted loop playsinline aria-hidden="true"></video>';
    return '';
  }

  HW.views = HW.views || {};
  HW.views.home = function () {
    var DB = HW.DB;
    var cats = m.visibleCategories();
    var listable = (DB.products || []).filter(m.listable);
    var featured = m.stockSort(listable.filter(function (p) { return p.featured; })).slice(0, 12);
    var feat = featured.length ? featured : m.stockSort(listable).slice(0, 8);
    var b = DB.band || {};
    var vb = DB.videoBanner || {};
    var media = vb.enabled ? videoEmbed(vb.videoUrl) : '';
    var g = DB.socialGallery || {};
    var tiles = (g.tiles || []).filter(function (t) { return t.image || t.url; });

    var html = '<h1 class="sr-only">' + esc(DB.brand.name) + ' — ' + esc(DB.brand.tagline) + '</h1>' + heroHTML();

    if (cats.length) {
      html += '<section class="section"><div class="wrap">' +
        '<div class="shead reveal"><div class="weave-rule">' + HW.SVG.weave + '</div><div class="eyebrow">Shop by room</div><h2>Explore the collections</h2></div>' +
        railHTML('catRail', 'cat-rail', cats.map(function (c, i) {
          var n = m.productsIn(c).length;
          var ph = c.image
            ? '<img class="ph" src="' + esc(HW.asset(m.thumb(c.image))) + '" alt="" loading="lazy" decoding="async" width="600" height="770">'
            : '<div class="ph" style="background:linear-gradient(160deg,' + SWATCH[i % SWATCH.length] + ',' + SWATCH[(i + 4) % SWATCH.length] + ')"></div>';
          return '<a class="cat-tile reveal" href="' + HW.link('/category/' + c.slug) + '">' + ph + '<div class="ov"></div>' +
            '<div class="lab"><span>' + u.plural(n, 'product') + '</span><h3>' + esc(c.name) + '</h3></div></a>';
        }).join(''), 'Collections') +
        '</div></section>';
    }

    if (b.title) {
      html += '<section class="band"><div class="grid">' +
        '<div class="copy reveal"><div class="weave-rule" style="margin:0 0 14px">' + HW.SVG.weave + '</div>' +
        (b.eyebrow ? '<div class="eyebrow">' + esc(b.eyebrow) + '</div>' : '') +
        '<h2>' + esc(b.title) + '</h2>' + (b.body ? '<p>' + esc(b.body) + '</p>' : '') +
        ctaButton(b.ctaText, b.ctaLink, 'btn ghost') + '</div>' +
        (b.image
          ? '<div class="pic"><img src="' + esc(HW.asset(b.image)) + '" alt="" loading="lazy" decoding="async" width="900" height="700"></div>'
          : '<div class="pic" style="background:linear-gradient(135deg,#C9BBA6,#A88C6E)"></div>') +
        '</div></section>';
    }

    if (feat.length) {
      html += '<section class="section"><div class="wrap">' +
        '<div class="shead reveal"><div class="weave-rule">' + HW.SVG.weave + '</div><div class="eyebrow">Editors\' picks</div><h2>Featured this season</h2></div>' +
        railHTML('featRail', 'prod-rail', feat.map(function (p) { return HW.productCard(p); }).join(''), 'Featured products') +
        '</div></section>';
    }

    if (media) {
      html += '<section class="vbanner" style="background:' + esc(vb.bg || '#2A2622') + '">' +
        '<div class="vbanner-bg">' + media + '</div><div class="vbanner-scrim"></div>' +
        '<div class="wrap vbanner-inner"><div class="vbanner-copy reveal">' +
        (vb.eyebrow ? '<div class="eyebrow">' + esc(vb.eyebrow) + '</div>' : '') +
        '<h2>' + esc(vb.heading || '') + '</h2>' + (vb.body ? '<p>' + esc(vb.body) + '</p>' : '') +
        ctaButton(vb.ctaText, vb.ctaLink, 'btn') + '</div></div></section>';
    }

    var feats = (DB.features || []).filter(function (f) { return f.title || f.body; });
    if (feats.length) {
      html += '<section class="section tight"><div class="wrap"><div class="features">' + feats.map(function (f) {
        return '<div class="feature reveal"><div class="ic">' +
          (f.image ? '<img src="' + esc(HW.asset(f.image)) + '" alt="" loading="lazy" height="46">' : HW.SVG.logo) +
          '</div><h3 class="h4">' + esc(f.title || '') + '</h3><p>' + esc(f.body || '') + '</p></div>';
      }).join('') + '</div></div></section>';
    }

    if (g.enabled && tiles.length) {
      html += '<section class="sgband">' +
        (g.heading ? '<div class="wrap"><div class="shead reveal" style="margin-bottom:18px"><div class="weave-rule">' + HW.SVG.weave + '</div><h2>' + esc(g.heading) + '</h2></div></div>' : '') +
        '<div class="sgrid">' + tiles.map(function (t) {
          var name = (t.platform || 'social').replace(/^\w/, function (c) { return c.toUpperCase(); });
          var inner = (t.image ? '<img src="' + esc(HW.asset(m.thumb(t.image))) + '" alt="" loading="lazy" decoding="async" width="600" height="540">' : '') +
            '<span class="sgtile-scrim"></span><span class="sgtile-circle">' + (HW.SVG[t.platform] || HW.SVG.logo) + '</span>';
          return /^https?:\/\//i.test(t.url)
            ? '<a class="sgtile ' + (t.image ? '' : 'noimg') + '" href="' + esc(t.url) + '" target="_blank" rel="noopener noreferrer" aria-label="' + esc(name) + ' (opens in a new tab)">' + inner + '</a>'
            : '<div class="sgtile ' + (t.image ? '' : 'noimg') + '" role="img" aria-label="' + esc(name) + '">' + inner + '</div>';
        }).join('') + '</div></section>';
    }

    return {
      html: html,
      seo: { title: '', description: (DB.brand.name + ' — ' + DB.brand.tagline + '. Bath rugs, towels and home textiles with ' + (DB.shipping && DB.shipping.enabled ? 'free shipping over ' + u.money(DB.shipping.freeThreshold) : 'fast shipping') + '.'), path: '/', image: m.primaryImage(feat[0] || {}), jsonld: HW.ld && HW.ld.site() },
      after: function () { HW.hero.init(); HW.rails.init(); }
    };
  };

  /* ---------- hero slider ---------- */
  var idx = 0, timer = null, paused = false, hovering = false;
  HW.hero = {
    slides: function () { return u.qsa('#heroSlider .hslide'); },
    show: function (i) {
      var s = HW.hero.slides(); if (!s.length) return;
      idx = (i + s.length) % s.length;
      s.forEach(function (el, j) {
        var on = j === idx;
        el.classList.toggle('active', on);
        if (on) { el.removeAttribute('aria-hidden'); el.removeAttribute('inert'); }
        else { el.setAttribute('aria-hidden', 'true'); el.setAttribute('inert', ''); }
      });
      var root = document.getElementById('heroSlider');
      if (root) root.classList.toggle('light', s[idx].classList.contains('pic'));
      u.qsa('#heroSlider .hdots button[data-i]').forEach(function (d, j) {
        d.classList.toggle('active', j === idx);
        if (j === idx) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current');
      });
    },
    stop: function () { if (timer) { clearInterval(timer); timer = null; } },
    play: function () {
      HW.hero.stop();
      var h = HW.DB.hero || {};
      if (paused || hovering || h.autoplay === false || u.reducedMotion() || HW.hero.slides().length < 2) return;
      timer = setInterval(function () { HW.hero.show(idx + 1); }, Math.max(4000, Number(h.interval) || 5000));
    },
    toggle: function (btn) {
      paused = !paused;
      btn.setAttribute('aria-label', paused ? 'Play slideshow' : 'Pause slideshow');
      btn.innerHTML = '<span aria-hidden="true">' + (paused ? '▶' : '❚❚') + '</span>';
      HW.hero.play();
    },
    init: function () {
      var el = document.getElementById('heroSlider');
      idx = 0; hovering = false;
      if (!el) { HW.hero.stop(); return; }
      if (u.reducedMotion() || (HW.DB.hero || {}).autoplay === false) {
        paused = true;
        var pb = el.querySelector('.hpause');
        if (pb) { pb.setAttribute('aria-label', 'Play slideshow'); pb.innerHTML = '<span aria-hidden="true">▶</span>'; }
      }
      el.addEventListener('mouseenter', function () { hovering = true; HW.hero.stop(); });
      el.addEventListener('mouseleave', function () { hovering = false; HW.hero.play(); });
      el.addEventListener('focusin', function () { hovering = true; HW.hero.stop(); });
      el.addEventListener('focusout', function (e) { if (!el.contains(e.relatedTarget)) { hovering = false; HW.hero.play(); } });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowLeft') { HW.hero.show(idx - 1); }
        if (e.key === 'ArrowRight') { HW.hero.show(idx + 1); }
      });
      var sx = null;
      el.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
      el.addEventListener('touchend', function (e) {
        if (sx == null) return;
        var dx = e.changedTouches[0].clientX - sx; sx = null;
        if (Math.abs(dx) > 40) { HW.hero.show(idx + (dx < 0 ? 1 : -1)); HW.hero.play(); }
      }, { passive: true });
      HW.hero.play();
    },
    step: function (d) { HW.hero.show(idx + d); HW.hero.play(); },
    to: function (i) { HW.hero.show(i); HW.hero.play(); }
  };

  /* ---------- horizontal rails ---------- */
  HW.rails = {
    scroll: function (id, dir) {
      var r = document.getElementById(id); if (!r) return;
      r.classList.add('snap');
      r.scrollBy({ left: dir * Math.max(280, r.clientWidth * 0.85), behavior: u.reducedMotion() ? 'auto' : 'smooth' });
    },
    update: function (r) {
      var wrap = r.closest('.rail-wrap'); if (!wrap) return;
      var overflow = r.scrollWidth - r.clientWidth > 4;
      var atStart = r.scrollLeft <= 2, atEnd = r.scrollLeft >= r.scrollWidth - r.clientWidth - 2;
      var prev = wrap.querySelector('.rail-nav.prev'), next = wrap.querySelector('.rail-nav.next');
      if (prev) { prev.classList.toggle('off', !overflow || atStart); prev.tabIndex = (!overflow || atStart) ? -1 : 0; }
      if (next) { next.classList.toggle('off', !overflow || atEnd); next.tabIndex = (!overflow || atEnd) ? -1 : 0; }
    },
    init: function () {
      u.qsa('.rail').forEach(function (r) {
        HW.rails.update(r);
        if (!r._wired) {
          r._wired = true;
          r.addEventListener('scroll', function () { HW.rails.update(r); }, { passive: true });
          var snap = function () { r.classList.add('snap'); };
          ['pointerdown', 'touchstart', 'wheel', 'focusin'].forEach(function (ev) { r.addEventListener(ev, snap, { once: true, passive: true }); });
        }
      });
    }
  };
})(window.HW = window.HW || {});
