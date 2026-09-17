/* Home Weavers — admin: Hero banner (slides, editorial band, video banner, features, social gallery). */
(function (HW) {
  'use strict';

  var A = HW.A, u = HW.u, esc = u.esc;
  var PLATFORMS = [['facebook', 'Facebook'], ['instagram', 'Instagram'], ['pinterest', 'Pinterest'], ['houzz', 'Houzz'], ['youtube', 'YouTube'], ['tiktok', 'TikTok']];

  function slidePanel(s, i, n) {
    var ui = A.ui, p = 'hero.slides.' + i + '.';
    return '<section class="panel"><div class="slidehead"><h3 style="margin:0">Slide ' + (i + 1) + '</h3><div class="rowbtns">' +
      '<button class="txtbtn" type="button" data-a="slide-move" data-i="' + i + '" data-d="-1"' + (i === 0 ? ' disabled' : '') + ' aria-label="Move slide ' + (i + 1) + ' up">↑</button>' +
      '<button class="txtbtn" type="button" data-a="slide-move" data-i="' + i + '" data-d="1"' + (i === n - 1 ? ' disabled' : '') + ' aria-label="Move slide ' + (i + 1) + ' down">↓</button>' +
      '<button class="txtbtn danger" type="button" data-a="slide-remove" data-i="' + i + '"' + (n <= 1 ? ' disabled' : '') + '>Remove</button></div></div>' +
      (s.legacyImage && !s.image ? A.ui.warn('The old image for this slide had text baked into it, so it was removed. Upload a clean photo below. <a class="link-u" href="' + esc(s.legacyImage) + '" target="_blank" rel="noopener">See old image</a>') : '') +
      '<div class="grid2">' + ui.field('Eyebrow (small label)', p + 'eyebrow', s.eyebrow, { maxlength: 60 }) + ui.field('Headline', p + 'title', s.title, { maxlength: 80 }) + '</div>' +
      ui.field('Subtext', p + 'subtitle', s.subtitle, { textarea: true, rows: 2, maxlength: 220 }) +
      '<div class="grid2">' + ui.field('Button text', p + 'ctaText', s.ctaText, { hint: 'Blank = no button', maxlength: 40 }) + A.linkField('Button link', p + 'ctaLink', s.ctaLink) + '</div>' +
      '<div class="grid2">' +
      ui.imageInput('Desktop image', p + 'image', s.image, { folder: 'hero', max: 2400, wide: true, hint: 'Landscape, about 2400 × 1200 px. Keep the subject to one side — text sits over the image. Already have a finished banner with words in it? Leave Eyebrow, Headline, Subtext and Button text blank: the picture then shows whole, and the Button link makes the whole banner clickable.' }) +
      ui.imageInput('Mobile image (optional)', p + 'mobileImage', s.mobileImage, { folder: 'hero', max: 1200, hint: 'Portrait, about 1080 × 1350 px. Used on phones.' }) + '</div>' +
      ui.field('Image description (alt text)', p + 'alt', s.alt, { hint: 'Describe the photo for screen readers, e.g. “Striped bath rug beside a white bathtub”.', maxlength: 140 }) +
      '</section>';
  }

  A.tabs.banner = {
    render: function () {
      var ui = A.ui, d = A.draft, h = d.hero, b = d.band, vb = d.videoBanner, g = d.socialGallery;
      if (!h.slides.length) h.slides.push({ eyebrow: '', title: 'New slide', subtitle: '', ctaText: '', ctaLink: '', image: '', mobileImage: '', alt: '' });
      return A.linkDatalist() + '<h1>Hero banner</h1><p class="sub">The rotating slideshow at the top of the homepage, plus the other homepage sections.</p>' +
        ui.panel('Slideshow settings', '<div class="grid2"><div class="field"><span class="flabel">Auto-rotate</span>' + ui.check('Automatically advance slides', 'hero.autoplay', h.autoplay !== false) + '</div>' +
          ui.field('Seconds per slide', 'hero.interval', Math.round((h.interval || 5000) / 1000), { type: 'int', min: 4, live: 'interval', hint: 'Minimum 4 seconds. Shoppers can pause, and it stops for reduced-motion users.' }) + '</div>') +
        '<div class="slidehead" style="margin:4px 0 12px"><h2 style="font-size:20px;margin:0">Slides — ' + h.slides.length + '</h2>' +
        '<button class="btn loom sm" type="button" data-a="slide-add"' + (h.slides.length >= 6 ? ' disabled' : '') + '>+ Add slide</button></div>' +
        h.slides.map(function (s, i) { return slidePanel(s, i, h.slides.length); }).join('') + ui.saveBtn() +

        ui.panel('Editorial band',
          '<p class="hint" style="margin:-6px 0 12px">The split image/text section further down the homepage.</p>' +
          '<div class="grid2">' + ui.field('Eyebrow', 'band.eyebrow', b.eyebrow) + ui.field('Headline', 'band.title', b.title) + '</div>' +
          ui.field('Body', 'band.body', b.body, { textarea: true, rows: 3 }) +
          '<div class="grid2">' + ui.field('Button text', 'band.ctaText', b.ctaText, { hint: 'Blank = no button' }) + A.linkField('Button link', 'band.ctaLink', b.ctaLink) + '</div>' +
          ui.imageInput('Image', 'band.image', b.image, { folder: 'home', max: 2000, wide: true, hint: 'About 2000 × 1200 px. Blank = woven gradient.' }) + ui.saveBtn()) +

        ui.panel('Video banner (after “Featured this season”)',
          ui.check('Show this banner', 'videoBanner.enabled', vb.enabled) +
          '<p class="hint">The banner is hidden on the site while the video URL is empty.</p>' +
          '<div class="grid2">' + ui.field('Eyebrow', 'videoBanner.eyebrow', vb.eyebrow) + ui.field('Heading', 'videoBanner.heading', vb.heading) + '</div>' +
          ui.field('Body', 'videoBanner.body', vb.body, { textarea: true, rows: 2 }) +
          '<div class="grid3">' + ui.field('Button text', 'videoBanner.ctaText', vb.ctaText) + A.linkField('Button link', 'videoBanner.ctaLink', vb.ctaLink) +
          ui.field('Background color', 'videoBanner.bg', vb.bg || '#2A2622', { inputType: 'color' }) + '</div>' +
          ui.field('Video URL', 'videoBanner.videoUrl', vb.videoUrl, { type: 'trim', placeholder: 'https://youtube.com/watch?v=…  •  https://vimeo.com/…  •  https://…/clip.mp4' }) + ui.saveBtn()) +

        '<section class="panel"><div class="slidehead"><h2 class="ph3" style="margin:0">Feature highlights (bottom strip)</h2>' +
        '<button class="btn loom sm" type="button" data-a="feat-add"' + (d.features.length >= 4 ? ' disabled' : '') + '>+ Add</button></div>' +
        d.features.map(function (f, i) {
          return '<div class="colorcard"><div class="slidehead" style="margin-bottom:10px"><strong style="font-size:13px">Highlight ' + (i + 1) + '</strong>' +
            '<button class="txtbtn danger" type="button" data-a="feat-remove" data-i="' + i + '"' + (d.features.length <= 1 ? ' disabled' : '') + '>Remove</button></div>' +
            '<div class="grid2">' + ui.field('Heading', 'features.' + i + '.title', f.title) + ui.field('Text', 'features.' + i + '.body', f.body) + '</div>' +
            ui.imageInput('Picture (optional)', 'features.' + i + '.image', f.image, { folder: 'home', max: 600, hint: 'Square, about 600 × 600 px. Blank = woven icon.' }) + '</div>';
        }).join('') + ui.saveBtn() + '</section>' +

        '<section class="panel"><div class="slidehead"><h2 class="ph3" style="margin:0">Social gallery (follow-us band)</h2>' +
        '<button class="btn loom sm" type="button" data-a="tile-add"' + ((g.tiles || []).length >= 6 ? ' disabled' : '') + '>+ Add tile</button></div>' +
        ui.check('Show this band', 'socialGallery.enabled', g.enabled) +
        ui.field('Heading (optional)', 'socialGallery.heading', g.heading) +
        '<div class="tilegrid">' + (g.tiles || []).map(function (t, i) {
          return '<div class="colorcard"><div class="slidehead" style="margin-bottom:10px"><strong style="font-size:13px">Tile ' + (i + 1) + '</strong>' +
            '<button class="txtbtn danger" type="button" data-a="tile-remove" data-i="' + i + '">Remove</button></div>' +
            ui.field('Platform', 'socialGallery.tiles.' + i + '.platform', t.platform, { options: PLATFORMS }) +
            ui.imageInput('Image', 'socialGallery.tiles.' + i + '.image', t.image, { folder: 'social', max: 1080 }) +
            ui.field('Link URL', 'socialGallery.tiles.' + i + '.url', t.url, { type: 'trim', placeholder: 'https://instagram.com/…', hint: 'Blank = tile is not clickable.' }) + '</div>';
        }).join('') + '</div>' + ui.saveBtn() + '</section>';
    },
    after: function () { A.wireImgChecks(document.getElementById('adminMain')); }
  };

  A.live.interval = function (el) { A.draft.hero.interval = Math.max(4, parseInt(el.value, 10) || 5) * 1000; };

  function rerender() { var y = window.scrollY; A.render(); window.scrollTo(0, y); A.refreshDirtyBar(); }
  A.actions['slide-add'] = function () { A.draft.hero.slides.push({ eyebrow: '', title: 'New slide', subtitle: '', ctaText: '', ctaLink: '', image: '', mobileImage: '', alt: '' }); rerender(); };
  A.actions['slide-remove'] = function (el) { if (!confirm('Remove slide ' + (+el.dataset.i + 1) + '?')) return; A.draft.hero.slides.splice(+el.dataset.i, 1); rerender(); };
  A.actions['slide-move'] = function (el) {
    var a = A.draft.hero.slides, i = +el.dataset.i, j = i + (+el.dataset.d);
    if (j < 0 || j >= a.length) return;
    var t = a[i]; a[i] = a[j]; a[j] = t; rerender();
  };
  A.actions['feat-add'] = function () { A.draft.features.push({ image: '', title: 'New highlight', body: '' }); rerender(); };
  A.actions['feat-remove'] = function (el) { A.draft.features.splice(+el.dataset.i, 1); rerender(); };
  A.actions['tile-add'] = function () { A.draft.socialGallery.tiles.push({ image: '', platform: 'instagram', url: '' }); rerender(); };
  A.actions['tile-remove'] = function (el) { A.draft.socialGallery.tiles.splice(+el.dataset.i, 1); rerender(); };
})(window.HW = window.HW || {});
