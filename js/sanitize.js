/* Home Weavers — safe rich text.
   sanitizeHtml(): keeps only ul, ol, li, p, br, b, strong, em (no attributes).
   htmlToText():   plain text for cart lines, Snipcart and the product feed. */
(function (HW) {
  'use strict';

  var ALLOWED = { UL: 1, OL: 1, LI: 1, P: 1, BR: 1, B: 1, STRONG: 1, EM: 1 };
  var DROP_WITH_CONTENT = { SCRIPT: 1, STYLE: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, TEMPLATE: 1, NOSCRIPT: 1, SVG: 1, MATH: 1 };

  function looksLikeHtml(s) { return /<\/?[a-z][\s\S]*?>/i.test(s); }

  function textToHtml(s) {
    var esc = HW.u.esc;
    return String(s).split(/\n\s*\n|\r\n\s*\r\n/)
      .map(function (block) { return block.trim(); })
      .filter(Boolean)
      .map(function (block) { return '<p>' + esc(block).replace(/\n/g, '<br>') + '</p>'; })
      .join('');
  }

  function clean(node, out) {
    node.childNodes.forEach(function (child) {
      if (child.nodeType === 3) { out.push(HW.u.esc(child.nodeValue)); return; }
      if (child.nodeType !== 1) return;
      var tag = child.nodeName.toUpperCase();
      if (DROP_WITH_CONTENT[tag]) return;
      if (ALLOWED[tag]) {
        var t = tag.toLowerCase();
        if (t === 'br') { out.push('<br>'); return; }
        out.push('<' + t + '>');
        clean(child, out);
        out.push('</' + t + '>');
      } else {
        // Unknown tag (div, span, a, h1…): keep its text, drop the tag.
        var block = /^(DIV|H[1-6]|SECTION|ARTICLE|TR|BLOCKQUOTE)$/.test(tag);
        clean(child, out);
        if (block) out.push('<br>');
      }
    });
  }

  HW.sanitizeHtml = function (input) {
    var s = String(input == null ? '' : input);
    if (!s.trim()) return '';
    if (!looksLikeHtml(s)) return textToHtml(s);
    var doc = new DOMParser().parseFromString('<body>' + s + '</body>', 'text/html');
    var out = [];
    clean(doc.body, out);
    return out.join('').replace(/(<br>\s*){3,}/g, '<br><br>').replace(/^(\s*<br>)+|(<br>\s*)+$/g, '');
  };

  HW.htmlToText = function (input) {
    var s = String(input == null ? '' : input);
    if (!looksLikeHtml(s)) return s.replace(/\s+/g, ' ').trim();
    s = s.replace(/<\s*(br|\/p|\/li|\/div|\/h[1-6])\s*\/?>/gi, ' ').replace(/<li[^>]*>/gi, '• ');
    var doc = new DOMParser().parseFromString('<body>' + s + '</body>', 'text/html');
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
  };
})(window.HW = window.HW || {});
