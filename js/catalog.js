/* Home Weavers — product cards and category listing with filters + sort. */
(function (HW) {
  'use strict';

  var u = HW.u, esc = u.esc, m = HW.m;

  /* ---------- product card ---------- */
  HW.productCard = function (p, opts) {
    opts = opts || {};
    var h = opts.heading || 'h3';
    var cat = m.categoryById(p.categoryId);
    var coll = m.isCollection(p);
    var out = m.productOut(p);
    var url = HW.link('/product/' + p.slug);
    var badge = out
      ? '<span class="badge out">Out of stock</span>'
      : (p.badge ? '<span class="badge ' + (/sale/i.test(p.badge) ? 'sale' : '') + '">' + esc(p.badge) + '</span>' : '');
    var priceHtml, action, swatches = '';

    if (coll) {
      var r = m.priceRange(p);
      priceHtml = r.min === r.max
        ? '<span class="now">' + u.money(r.min) + '</span>'
        : '<span class="muted" style="font-size:12px;letter-spacing:.04em">from</span> <span class="now">' + u.money(r.min) + '</span>';
      action = out
        ? '<button class="btn block sm" type="button" disabled>Out of stock</button>'
        : '<a class="btn block sm loom" href="' + url + '" aria-label="Select options for ' + esc(p.name) + '">Select options</a>';
      var cols = m.optColor(p).values;
      swatches = '<div class="cardswatch">' + cols.slice(0, 6).map(function (c) {
        return '<span role="img" aria-label="' + esc(c.label) + '" title="' + esc(c.label) + '" style="background:' + esc(c.hex) + '"></span>';
      }).join('') + (cols.length > 6 ? '<em>+' + (cols.length - 6) + '<span class="sr-only"> more colors</span></em>' : '') + '</div>';
    } else {
      var sp = m.simplePrice(p);
      priceHtml = '<span class="now ' + (sp.onSale ? 'on' : '') + '">' + u.money(sp.effective) + '</span>' +
        (sp.onSale ? '<span class="was"><span class="sr-only">Was </span>' + u.money(sp.price) + '</span>' : '');
      if (out) action = '<button class="btn block sm" type="button" disabled>Out of stock</button>';
      else if (HW.snip && HW.snip.enabled()) action = '<button class="btn block sm loom snipcart-add-item" type="button" ' + HW.snip.attrs(HW.snip.simpleItem(p)) + '>Add to cart</button>';
      else action = '<button class="btn block sm loom" type="button" data-act="add" data-id="' + esc(p.id) + '" aria-label="Add ' + esc(p.name) + ' to cart">Add to cart</button>';
    }

    return '<article class="pcard reveal' + (out ? ' is-out' : '') + '">' +
      '<div class="imgwrap">' +
      '<a href="' + url + '" tabindex="-1" aria-hidden="true"><img class="ph" src="' + esc(HW.asset(m.thumb(m.imageOrSwatch(p)))) + '" alt="' + esc(m.imageAlt(p)) + '" loading="lazy" decoding="async" width="600" height="770"></a>' +
      badge + (HW.wishlist ? HW.wishlist.button(p) : '') + '<div class="quick">' + action + '</div></div>' +
      '<div class="meta"><div class="cat">' + esc(cat ? cat.name : '') + '</div>' +
      '<' + h + ' class="pname"><a href="' + url + '">' + esc(p.name) + '</a></' + h + '>' +
      '<div class="price">' + priceHtml + '</div>' + swatches + '</div></article>';
  };

  /* ---------- category ---------- */
  var ctx = null;

  function emptyFilter() { return { subs: new Set(), colors: new Set(), materials: new Set(), min: null, max: null }; }
  function colorsOf(p) { return m.isCollection(p) ? m.optColor(p).values.map(function (v) { return { label: v.label, hex: v.hex }; }) : []; }

  function matches(p, f, skip) {
    if (skip !== 'subs' && f.subs.size && !f.subs.has(p.subcategoryId)) return false;
    if (skip !== 'materials' && f.materials.size && !f.materials.has(p.material)) return false;
    if (skip !== 'colors' && f.colors.size && !colorsOf(p).some(function (c) { return f.colors.has(c.label); })) return false;
    if (skip !== 'price') {
      var r = m.priceRange(p);
      if (f.min != null && r.max < f.min) return false;
      if (f.max != null && r.min > f.max) return false;
    }
    return true;
  }

  function sorted(list, sort) {
    var arr = list.slice();
    if (sort === 'price-asc') arr.sort(function (a, b) { return m.priceRange(a).min - m.priceRange(b).min; });
    else if (sort === 'price-desc') arr.sort(function (a, b) { return m.priceRange(b).min - m.priceRange(a).min; });
    else if (sort === 'name') arr.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    // Out-of-stock always last, stable within groups.
    return m.stockSort(arr);
  }

  function results() {
    return sorted(ctx.all.filter(function (p) { return matches(p, ctx.f); }), ctx.sort);
  }

  function facet(group, values, labelFn, extraFn) {
    var f = ctx.f;
    var base = ctx.all.filter(function (p) { return matches(p, f, group); });
    var rows = values.map(function (v) {
      var n = base.filter(function (p) {
        if (group === 'subs') return p.subcategoryId === v;
        if (group === 'materials') return p.material === v;
        return colorsOf(p).some(function (c) { return c.label === v; });
      }).length;
      return { v: v, n: n, on: f[group].has(v) };
    }).filter(function (r) { return r.n > 0 || r.on; });
    return rows.map(function (r) {
      var id = 'cf-' + group + '-' + u.slugify(r.v);
      return '<label class="' + (group === 'colors' ? 'cf-color' : 'cf-opt') + '" for="' + id + '">' +
        '<input type="checkbox" id="' + id + '" data-act="cf" data-g="' + group + '" data-v="' + esc(r.v) + '"' + (r.on ? ' checked' : '') + '>' +
        (extraFn ? extraFn(r.v) : '') + '<span class="cf-clabel">' + esc(labelFn(r.v)) + '</span>' +
        '<span class="cf-count" aria-label="' + u.plural(r.n, 'product') + '">(' + r.n + ')</span></label>';
    }).join('');
  }

  function groupHTML(key) {
    var cat = ctx.cat, fcfg = ctx.fcfg, all = ctx.all, inner = '';
    if (key === 'subs' && fcfg.type) {
      inner = facet('subs', cat.subcategories.map(function (s) { return s.id; }), function (id) {
        var s = cat.subcategories.find(function (x) { return x.id === id; }); return s ? s.name : id;
      });
      return inner ? '<fieldset class="cf-group"><legend class="h4">Type</legend>' + inner + '</fieldset>' : '';
    }
    if (key === 'colors' && fcfg.color) {
      var cmap = {};
      all.forEach(function (p) { colorsOf(p).forEach(function (c) { if (!cmap[c.label]) cmap[c.label] = c.hex; }); });
      inner = facet('colors', Object.keys(cmap).sort(), function (l) { return l; }, function (l) {
        return '<span class="cf-dot" style="background:' + esc(cmap[l]) + '" aria-hidden="true"></span>';
      });
      return inner ? '<fieldset class="cf-group"><legend class="h4">Color</legend><div class="cf-colors">' + inner + '</div></fieldset>' : '';
    }
    if (key === 'materials' && fcfg.material) {
      var mats = Array.from(new Set(all.map(function (p) { return p.material; }).filter(Boolean))).sort();
      inner = facet('materials', mats, function (x) { return x; });
      return inner ? '<fieldset class="cf-group"><legend class="h4">Material</legend>' + inner + '</fieldset>' : '';
    }
    if (key === 'price' && fcfg.price && all.length) {
      var lo = Infinity, hi = -Infinity;
      all.forEach(function (p) { var r = m.priceRange(p); lo = Math.min(lo, r.min); hi = Math.max(hi, r.max); });
      lo = Math.floor(lo); hi = Math.ceil(hi);
      if (!(hi > lo)) return '<fieldset class="cf-group"><legend class="h4">Price</legend><div class="cf-pricehint">All ' + u.money(lo) + '</div></fieldset>';
      ctx.lo = lo; ctx.hi = hi;
      var mn = ctx.f.min != null ? ctx.f.min : lo, mx = ctx.f.max != null ? ctx.f.max : hi;
      return '<fieldset class="cf-group" id="cfPrice"><legend class="h4">Price</legend>' +
        '<div class="cf-slider" data-lo="' + lo + '" data-hi="' + hi + '">' +
        '<div class="cf-strack"></div><div class="cf-srange"></div>' +
        '<input type="range" class="cf-smin" min="' + lo + '" max="' + hi + '" step="1" value="' + mn + '" data-act="cf-range" aria-label="Minimum price">' +
        '<input type="range" class="cf-smax" min="' + lo + '" max="' + hi + '" step="1" value="' + mx + '" data-act="cf-range" aria-label="Maximum price"></div>' +
        '<div class="cf-price">' +
        '<label>Min<input type="number" inputmode="numeric" class="cf-nmin" min="' + lo + '" max="' + hi + '" value="' + mn + '" data-act="cf-num"></label>' +
        '<span class="dash" aria-hidden="true">–</span>' +
        '<label>Max<input type="number" inputmode="numeric" class="cf-nmax" min="' + lo + '" max="' + hi + '" value="' + mx + '" data-act="cf-num"></label></div>' +
        '</fieldset>';
    }
    return '';
  }

  function activeCount() {
    var f = ctx.f;
    return f.subs.size + f.colors.size + f.materials.size + (f.min != null || f.max != null ? 1 : 0);
  }

  function headHTML() {
    var n = activeCount();
    return '<div class="cf-head"><h2 class="h4" style="font:inherit;letter-spacing:inherit;margin:0">Filter</h2>' +
      '<span>' + (n ? '<button class="cf-clear" type="button" data-act="cf-clear">Clear all</button>' : '') +
      ' <button class="cf-clear cf-toggle" type="button" data-act="cf-toggle" aria-expanded="false" aria-controls="catFilters">Show filters</button></span></div>';
  }

  function sidebarHTML() {
    return headHTML() + ['subs', 'colors', 'materials', 'price'].map(function (k) {
      return '<div data-group="' + k + '">' + groupHTML(k) + '</div>';
    }).join('');
  }

  function paintSlider() {
    var sl = document.querySelector('.cf-slider'); if (!sl) return;
    var lo = +sl.dataset.lo, hi = +sl.dataset.hi;
    var mn = +sl.querySelector('.cf-smin').value, mx = +sl.querySelector('.cf-smax').value;
    var range = sl.querySelector('.cf-srange');
    range.style.left = ((mn - lo) / (hi - lo)) * 100 + '%';
    range.style.right = (100 - ((mx - lo) / (hi - lo)) * 100) + '%';
  }

  function refresh(sourceGroup) {
    var items = results();
    var grid = document.getElementById('catGrid');
    if (grid) {
      grid.innerHTML = items.length
        ? items.map(function (p) { return HW.productCard(p, { heading: 'h2' }); }).join('')
        : '<p class="muted" style="padding:30px 0 80px">No products match these filters. <button class="link-u" type="button" style="background:none;border:none;border-bottom:1px solid var(--ink);cursor:pointer" data-act="cf-clear">Clear filters</button></p>';
    }
    var c = document.getElementById('catCount');
    if (c) c.textContent = u.plural(items.length, 'product');
    var sb = document.getElementById('catFilters');
    if (sb) {
      var active = document.activeElement;
      var focusKey = active && active.dataset && active.dataset.g ? active.dataset.g + '|' + active.dataset.v : null;
      var head = sb.querySelector('.cf-head');
      var expanded = !sb.classList.contains('collapsed');
      if (head) head.outerHTML = headHTML();
      var tg = sb.querySelector('.cf-toggle');
      if (tg) { tg.setAttribute('aria-expanded', String(expanded)); tg.textContent = expanded ? 'Hide filters' : 'Show filters'; }
      ['subs', 'colors', 'materials'].forEach(function (k) {
        if (k === sourceGroup) return;
        var box = sb.querySelector('[data-group="' + k + '"]');
        if (box) box.innerHTML = groupHTML(k);
      });
      if (sourceGroup === 'clear') { var pb = sb.querySelector('[data-group="price"]'); if (pb) pb.innerHTML = groupHTML('price'); paintSlider(); }
      if (focusKey) {
        var el = sb.querySelector('[data-g="' + focusKey.split('|')[0] + '"][data-v="' + CSS.escape(focusKey.split('|').slice(1).join('|')) + '"]');
        if (el && el !== document.activeElement) el.focus();
      }
    }
    HW.observeReveals();
  }

  HW.catalog = {
    toggle: function (el) {
      var g = el.dataset.g, v = el.dataset.v;
      if (el.checked) ctx.f[g].add(v); else ctx.f[g].delete(v);
      refresh(g);
    },
    range: function (el) {
      var sl = el.closest('.cf-slider');
      var minI = sl.querySelector('.cf-smin'), maxI = sl.querySelector('.cf-smax');
      var mn = +minI.value, mx = +maxI.value;
      if (mn > mx) { if (el === minI) { mn = mx; minI.value = mn; } else { mx = mn; maxI.value = mx; } }
      var box = document.getElementById('cfPrice');
      box.querySelector('.cf-nmin').value = mn;
      box.querySelector('.cf-nmax').value = mx;
      paintSlider();
      ctx.f.min = mn <= ctx.lo ? null : mn;
      ctx.f.max = mx >= ctx.hi ? null : mx;
      refresh('price');
    },
    num: function (el) {
      var box = document.getElementById('cfPrice');
      var nmin = box.querySelector('.cf-nmin'), nmax = box.querySelector('.cf-nmax');
      var mn = Math.max(ctx.lo, Math.min(ctx.hi, parseFloat(nmin.value)));
      var mx = Math.max(ctx.lo, Math.min(ctx.hi, parseFloat(nmax.value)));
      if (isNaN(mn)) mn = ctx.lo;
      if (isNaN(mx)) mx = ctx.hi;
      if (mn > mx) { var t = mn; mn = mx; mx = t; }
      box.querySelector('.cf-smin').value = mn;
      box.querySelector('.cf-smax').value = mx;
      paintSlider();
      ctx.f.min = mn <= ctx.lo ? null : mn;
      ctx.f.max = mx >= ctx.hi ? null : mx;
      refresh('price');
    },
    clear: function () {
      ctx.f = emptyFilter();
      refresh('clear');
      var sb = document.getElementById('catFilters');
      if (sb) ['subs', 'colors', 'materials'].forEach(function (k) { var b = sb.querySelector('[data-group="' + k + '"]'); if (b) b.innerHTML = groupHTML(k); });
    },
    sort: function (el) {
      ctx.sort = el.value;
      var url = new URL(location.href);
      if (ctx.sort && ctx.sort !== 'featured') url.searchParams.set('sort', ctx.sort); else url.searchParams.delete('sort');
      history.replaceState({}, '', url.pathname + url.search);
      refresh('sort');
    },
    toggleSidebar: function (btn) {
      var sb = document.getElementById('catFilters');
      var collapsed = sb.classList.toggle('collapsed');
      btn.setAttribute('aria-expanded', String(!collapsed));
      btn.textContent = collapsed ? 'Show filters' : 'Hide filters';
      if (!collapsed) paintSlider();
    }
  };

  HW.views = HW.views || {};
  HW.views.category = function (params) {
    var cat = m.categoryBySlug(params.slug);
    if (!cat || cat.hidden) return HW.views.notfound();
    var all = m.productsIn(cat);
    var fcfg = Object.assign({ type: true, color: true, material: true, price: true }, cat.filters || {});
    ctx = { cat: cat, all: all, fcfg: fcfg, f: emptyFilter(), sort: params.sort || 'featured', lo: 0, hi: 0 };
    if (params.sub) {
      var sub = cat.subcategories.find(function (s) { return s.slug === params.sub; });
      if (sub) ctx.f.subs.add(sub.id);
    }
    var items = results();
    var anyFilter = all.length > 1 && ((fcfg.type && cat.subcategories.length) || fcfg.color || fcfg.material || fcfg.price);
    var sortSel = '<div class="listing-tools"><label for="catSort">Sort</label><select id="catSort" data-act="sort">' +
      [['featured', 'Featured'], ['price-asc', 'Price: low to high'], ['price-desc', 'Price: high to low'], ['name', 'Name: A–Z']].map(function (o) {
        return '<option value="' + o[0] + '"' + (ctx.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select></div>';

    var body;
    if (!all.length) {
      var others = m.visibleCategories().filter(function (c) { return c !== cat; });
      body = '<div class="panelbox" style="text-align:center;margin:10px auto 80px;max-width:560px">' +
        '<div class="weave-rule" style="margin-bottom:12px">' + HW.SVG.weave + '</div>' +
        '<h2 style="font-size:26px;margin-bottom:10px">New pieces are on the way</h2>' +
        '<p class="muted" style="margin:0 0 18px">This collection is being restocked. In the meantime, explore our other collections.</p>' +
        (others.length ? '<div class="subnav" style="justify-content:center">' + others.map(function (c) {
          return '<a class="chip" href="' + HW.link('/category/' + c.slug) + '">' + esc(c.name) + '</a>';
        }).join('') + '</div>' : '<a class="btn" href="' + HW.link('/') + '">Back home</a>') + '</div>';
    } else {
      body = '<div class="catlayout ' + (anyFilter ? '' : 'nofilters') + '">' +
        (anyFilter ? '<aside class="cfilters' + (window.innerWidth <= 980 ? ' collapsed' : '') + '" id="catFilters" aria-label="Product filters">' + sidebarHTML() + '</aside>' : '') +
        '<div class="catmain"><div class="p-grid" id="catGrid">' + items.map(function (p) { return HW.productCard(p, { heading: 'h2' }); }).join('') + '</div></div></div>';
    }

    return {
      html: '<div class="wrap">' +
        '<nav class="crumb" aria-label="Breadcrumb"><a href="' + HW.link('/') + '">Home</a> &nbsp;/&nbsp; <span aria-current="page">' + esc(cat.name) + '</span></nav>' +
        '<div class="listing-head"><div><div class="eyebrow" id="catCount" style="margin-bottom:8px" aria-live="polite">' + u.plural(items.length, 'product') + '</div>' +
        '<h1>' + esc(cat.name) + '</h1></div>' + (all.length > 1 ? sortSel : '') + '</div>' +
        body + '<div style="height:70px"></div></div>',
      seo: {
        title: cat.seoTitle || cat.name,
        description: cat.seoDescription || ('Shop ' + cat.name + ' from ' + HW.DB.brand.name + ' — ' + u.plural(all.length, 'product') + '. ' + HW.DB.brand.tagline + '.'),
        path: '/category/' + cat.slug,
        image: all[0] ? m.primaryImage(all[0]) : cat.image,
        jsonld: HW.ld && HW.ld.breadcrumb([['Home', '/'], [cat.name, '/category/' + cat.slug]])
      },
      after: function () {
        paintSlider();
        var tg = document.querySelector('.cf-toggle');
        var sb = document.getElementById('catFilters');
        if (tg && sb) { var exp = !sb.classList.contains('collapsed'); tg.setAttribute('aria-expanded', String(exp)); tg.textContent = exp ? 'Hide filters' : 'Show filters'; }
      }
    };
  };
})(window.HW = window.HW || {});
