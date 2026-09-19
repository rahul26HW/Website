/* Home Weavers — admin media: upload to Supabase Storage ("media" bucket) as WebP,
   and move existing external images (Dropbox, postimg…) into Storage. */
(function (HW) {
  'use strict';

  var A = HW.A, u = HW.u;
  var BUCKET = 'media';

  function rand() { return Math.random().toString(36).slice(2, 8); }
  function safeName(s) { return u.slugify(String(s || 'image').replace(/\.[a-z0-9]+$/i, '')).slice(0, 50) || 'image'; }

  /* Resize to fit max × max and encode as WebP. SVG and GIF are uploaded unchanged. */
  async function toWebp(blob, max, quality) {
    if (blob && blob.tagName === 'IMG') return drawWebp(blob, blob.naturalWidth, blob.naturalHeight, max, quality);
    if (/svg|gif/i.test(blob.type)) return { blob: blob, ext: /svg/i.test(blob.type) ? 'svg' : 'gif', type: blob.type };
    var bmp;
    try { bmp = await createImageBitmap(blob); }
    catch (e) {
      bmp = await new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = function () { reject(new Error('That file isn’t a readable image.')); };
        img.src = URL.createObjectURL(blob);
      });
    }
    return drawWebp(bmp, bmp.width, bmp.height, max, quality);
  }
  async function drawWebp(bmp, w, h, max, quality) {
    var scale = Math.min(1, max / Math.max(w, h));
    var cw = Math.round(w * scale), ch = Math.round(h * scale);
    var canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    canvas.getContext('2d').drawImage(bmp, 0, 0, cw, ch);
    var out = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/webp', quality || 0.82); });
    if (!out || out.type !== 'image/webp') {
      out = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/jpeg', 0.85); });
      return { blob: out, ext: 'jpg', type: 'image/jpeg', width: cw, height: ch };
    }
    return { blob: out, ext: 'webp', type: 'image/webp', width: cw, height: ch };
  }

  /* Gets an image as a Blob. The page's security policy only lets scripts download from our own servers,
     so a linked photo (e.g. Dropbox) is loaded like a normal <img> (allowed) and redrawn on a canvas.
     This works when the host allows cross-origin use (Dropbox does). */
  async function imageBlob(url) {
    try {
      var res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.blob();
    } catch (e) {
      if (isOurs(url)) throw e;
      var img = await new Promise(function (resolve, reject) {
        var im = new Image();
        var timer = setTimeout(function () { im.src = ''; reject(new Error('The image took too long to load')); }, 30000);
        im.crossOrigin = 'anonymous';
        im.onload = function () { clearTimeout(timer); resolve(im); };
        im.onerror = function () { clearTimeout(timer); reject(new Error('Could not load the image')); };
        im.src = url;
      });
      return img; // toWebp draws it straight to the target size
    }
  }

  function isOurs(url) {
    var base = (window.HW_CONFIG || {}).supabaseUrl || '';
    return !!base && String(url || '').indexOf(base + '/storage/v1/object/public/' + BUCKET + '/') === 0;
  }

  A.media = {
    isOurs: isOurs,

    /* Count of catalog images (not hero/logo/home band) with no small copy yet. */
    missingThumbs: function (d) {
      var t = d.thumbs || {}, seen = {};
      A.media.collect(d, true).forEach(function (r) { if (!/^(logo|hero|home)$/.test(r.folder) && !t[r.url] && !/\.(svg|gif)(\?|$)/i.test(r.url)) seen[r.url] = 1; });
      return Object.keys(seen).length;
    },

    /* Small copies (700px) of catalog images for cards, cart and gallery thumbnails.
       Map: d.thumbs[fullUrl] = thumbUrl. Hero, logo and home band are shown large, so skipped.
       Entries for images no longer used are dropped. */
    makeThumbs: async function (d, onProgress, shouldStop) {
      d.thumbs = d.thumbs && typeof d.thumbs === 'object' ? d.thumbs : {};
      // Our own photos and linked ones (e.g. Dropbox): the small copy always lives in our Storage.
      var refs = A.media.collect(d, true).concat(A.media.collect(d, false)).filter(function (r) { return !/^(logo|hero|home)$/.test(r.folder); });
      var used = {};
      refs.forEach(function (r) { used[r.url] = r; });
      Object.keys(d.thumbs).forEach(function (k) { if (!used[k]) delete d.thumbs[k]; });
      var queue = Object.keys(used).filter(function (k) { return !d.thumbs[k] && !/\.(svg|gif)(\?|$)/i.test(k); });
      var total = queue.length, done = 0, failures = [];
      async function worker() {
        while (queue.length) {
          if (shouldStop && shouldStop()) return;
          var url = queue.shift(), r = used[url];
          try {
            var conv = await toWebp(await imageBlob(url), 700, 0.78);
            var name = decodeURIComponent(url.split('?')[0].split('/').pop() || 'image');
            var path = 'thumbs/' + r.folder + '/' + safeName(name) + '-' + rand() + '.' + conv.ext;
            var up = await A.sb.storage.from(BUCKET).upload(path, conv.blob, { contentType: conv.type, cacheControl: '31536000', upsert: false });
            if (up.error) throw new Error(up.error.message || 'Upload failed');
            d.thumbs[url] = A.sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
          } catch (e) {
            failures.push({ url: url, label: r.label, error: e.message });
          }
          done++;
          onProgress && onProgress(done, total, failures);
        }
      }
      await Promise.all([worker(), worker(), worker(), worker(), worker(), worker(), worker(), worker()]);
      return { total: total, done: done, failures: failures };
    },

    upload: async function (fileOrBlob, folder, o) {
      o = o || {};
      if (!fileOrBlob) throw new Error('No file chosen');
      if (fileOrBlob.type && !/^image\//.test(fileOrBlob.type)) throw new Error('Please choose an image file (JPG, PNG, WebP, GIF or SVG).');
      if (fileOrBlob.size > 25 * 1024 * 1024) throw new Error('That image is over 25 MB. Please use a smaller file.');
      var conv = await toWebp(fileOrBlob, o.max || 2000, o.quality);
      var d = new Date();
      var path = (folder || 'misc') + '/' + d.getFullYear() + '/' + safeName(o.name || fileOrBlob.name) + '-' + rand() + '.' + conv.ext;
      var r = await A.sb.storage.from(BUCKET).upload(path, conv.blob, { contentType: conv.type, cacheControl: '31536000', upsert: false });
      if (r.error) throw new Error(r.error.message || 'Upload failed');
      return A.sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    },

    /* Every image URL in the store, with a setter to replace it. */
    collect: function (d, ours) {
      var refs = [];
      function add(obj, key, folder, label) {
        var v = obj && obj[key];
        if (typeof v === 'string' && /^https?:\/\//i.test(v.trim()) && (ours ? isOurs(v.trim()) : !isOurs(v))) refs.push({ obj: obj, key: key, url: v.trim(), folder: folder, label: label });
      }
      add(d.brand, 'logoImage', 'logo', 'Logo');
      (d.hero.slides || []).forEach(function (s, i) { add(s, 'image', 'hero', 'Hero slide ' + (i + 1)); add(s, 'mobileImage', 'hero', 'Hero slide ' + (i + 1) + ' (mobile)'); });
      add(d.band, 'image', 'home', 'Editorial band');
      (d.features || []).forEach(function (f, i) { add(f, 'image', 'home', 'Feature ' + (i + 1)); });
      ((d.socialGallery || {}).tiles || []).forEach(function (t, i) { add(t, 'image', 'social', 'Social tile ' + (i + 1)); });
      (d.categories || []).forEach(function (c) { add(c, 'image', 'categories', 'Category ' + c.name); });
      (d.products || []).forEach(function (p) {
        var folder = 'products/' + (p.slug || p.id).slice(0, 40);
        add(p, 'image', folder, p.name);
        (p.images || []).forEach(function (x, i) { add(p.images, i, folder, p.name); });
        (p.options || []).forEach(function (o) {
          (o.values || []).forEach(function (c) {
            (c.images || []).forEach(function (x, i) { add(c.images, i, folder, p.name + ' — ' + c.label); });
            add(c, 'swatchImage', folder, p.name + ' — ' + c.label + ' swatch');
          });
        });
        Object.keys(p.variants || {}).forEach(function (k) {
          var v = p.variants[k];
          (v.images || []).forEach(function (x, i) { add(v.images, i, folder, p.name + ' — ' + (v.sku || k)); });
        });
      });
      return refs;
    },

    /* Downloads each external image, converts to WebP, uploads, and swaps the URL in the draft.
       onProgress(done, total, failures). Same URL is uploaded once. */
    migrate: async function (d, onProgress, shouldStop) {
      var refs = A.media.collect(d);
      var byUrl = {};
      refs.forEach(function (r) { (byUrl[r.url] = byUrl[r.url] || []).push(r); });
      var urls = Object.keys(byUrl);
      var done = 0, failures = [];
      var queue = urls.slice();
      async function worker() {
        while (queue.length) {
          if (shouldStop && shouldStop()) return;
          var url = queue.shift();
          var first = byUrl[url][0];
          try {
            var blob = await imageBlob(url);
            if (blob.tagName === 'IMG') blob = (await toWebp(blob, 2400, 0.9)).blob;
            if (!/^image\//.test(blob.type)) throw new Error('not an image (' + (blob.type || 'unknown type') + ')');
            var name = decodeURIComponent((url.split('?')[0].split('/').pop() || 'image'));
            var isLogo = first.folder === 'logo';
            var newUrl = await A.media.upload(blob, first.folder, { name: name, max: isLogo ? 800 : (first.folder === 'hero' ? 2400 : 1600) });
            byUrl[url].forEach(function (r) { r.obj[r.key] = newUrl; });
          } catch (e) {
            failures.push({ url: url, label: first.label, error: e.message });
          }
          done++;
          onProgress && onProgress(done, urls.length, failures);
        }
      }
      await Promise.all([worker(), worker(), worker()]);
      return { total: urls.length, done: done, failures: failures };
    }
  };
})(window.HW = window.HW || {});
