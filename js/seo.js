/* Home Weavers — per-page title, description, canonical and social tags. */
(function (HW) {
  'use strict';

  function meta(attr, key, value) {
    var el = document.head.querySelector('meta[' + attr + '="' + key + '"]');
    if (!value) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
    el.setAttribute('content', value);
  }
  function linkRel(rel, href) {
    var el = document.head.querySelector('link[rel="' + rel + '"]');
    if (!href) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('link'); el.rel = rel; document.head.appendChild(el); }
    el.href = href;
  }
  function clip(s, n) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s;
  }

  HW.seo = {
    clip: clip,
    set: function (o) {
      o = o || {};
      var brand = (HW.DB && HW.DB.brand && HW.DB.brand.name) || 'Home Weavers';
      var tagline = (HW.DB && HW.DB.brand && HW.DB.brand.tagline) || 'Woven for the way you live';
      var title = o.title ? clip(o.title, 60) + ' | ' + brand : brand + ' — ' + tagline;
      var desc = clip(o.description || (brand + ' — bath rugs, towels and home textiles. ' + tagline + '.'), 160);
      document.title = title;
      meta('name', 'description', desc);
      meta('name', 'robots', o.noindex ? 'noindex, follow' : 'index, follow');
      var canonical = o.noindex ? '' : HW.absUrl(o.path != null ? o.path : location.pathname.slice(HW.router.base.length - 1));
      linkRel('canonical', canonical);
      meta('property', 'og:site_name', brand);
      meta('property', 'og:type', o.type || 'website');
      meta('property', 'og:title', title);
      meta('property', 'og:description', desc);
      meta('property', 'og:url', canonical || location.href);
      var img = o.image && !/^data:/.test(o.image) ? HW.asset(o.image) : '';
      meta('property', 'og:image', img);
      meta('name', 'twitter:card', img ? 'summary_large_image' : 'summary');
      meta('name', 'twitter:title', title);
      meta('name', 'twitter:description', desc);
      meta('name', 'twitter:image', img);

      // Structured data for search engines (Product, BreadcrumbList, WebSite, Organization).
      var old = document.getElementById('hwJsonLd');
      if (old) old.remove();
      if (o.jsonld && !o.noindex) {
        var s = document.createElement('script');
        s.type = 'application/ld+json';
        s.id = 'hwJsonLd';
        s.textContent = JSON.stringify(Array.isArray(o.jsonld) ? o.jsonld : [o.jsonld]).replace(/</g, '\\u003c');
        document.head.appendChild(s);
      }
    }
  };
})(window.HW = window.HW || {});
