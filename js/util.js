/* Home Weavers — shared helpers. Everything hangs off window.HW. */
(function (HW) {
  'use strict';

  var u = HW.u = {};

  u.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  u.escAttr = u.esc;

  var USD = window.Intl && Intl.NumberFormat ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null;
  u.money = function (n) {
    var v = Number(n);
    if (!isFinite(v)) v = 0;
    return USD ? USD.format(v) : '$' + v.toFixed(2);
  };
  u.round2 = function (n) { return Math.round((Number(n) || 0) * 100) / 100; };

  u.plural = function (n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); };

  u.slugify = function (s) {
    return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  };
  u.uid = function (p) { return (p || 'id') + '_' + Math.random().toString(36).slice(2, 8); };

  // Plain ASCII addresses with a real domain — the same rule as the server and the database.
  u.isEmail = function (s) { return /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,24}$/.test(String(s || '').trim()) && String(s).trim().length <= 254; };

  u.debounce = function (fn, ms) {
    var t;
    return function () { var a = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms); };
  };

  u.qs = function (sel, root) { return (root || document).querySelector(sel); };
  u.qsa = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  u.fmtDate = function (iso) {
    try { return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch (e) { return ''; }
  };

  /* localStorage that never throws (private mode, blocked storage, previews). */
  u.store = {
    get: function (k, fallback) {
      try { var v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  u.session = {
    get: function (k, fallback) {
      try { var v = sessionStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set: function (k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  u.toast = function (msg) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(function () { t.classList.remove('show'); }, 2600);
  };

  /* Keyboard focus trap for drawers and dialogs. Returns a release function. */
  u.trapFocus = function (container, onEscape) {
    var prev = document.activeElement;
    function focusables() {
      return u.qsa('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])', container)
        .filter(function (el) { return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'; });
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onEscape && onEscape(); return; }
      if (e.key !== 'Tab') return;
      var f = focusables();
      if (!f.length) { e.preventDefault(); return; }
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey);
    setTimeout(function () { var f = focusables(); (f[0] || container).focus(); }, 30);
    return function release(restore) {
      document.removeEventListener('keydown', onKey);
      if (restore !== false && prev && prev.focus) { try { prev.focus(); } catch (e) {} }
    };
  };

  u.reducedMotion = function () {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  };
})(window.HW = window.HW || {});
