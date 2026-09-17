/* Home Weavers — sample catalog for "Reset to sample data" (same content as the original demo). */
(function (HW) {
  'use strict';

  var uid = HW.u.uid, slugify = HW.u.slugify;
  var SWATCH = ['#9FB3A6', '#C9BBA6', '#B7C2C9', '#A88C6E', '#8A9B8E', '#D8CDBA', '#CBC0AC', '#B59F84', '#C7C6BE'];
  var CARE = 'Machine wash cold on gentle cycle\nTumble dry low, remove promptly\nDo not bleach\nWarm iron if needed';

  HW.A.sampleData = function () {
    function cat(name, slug, subs) {
      return { id: uid('c'), name: name, slug: slug, image: '', hidden: false, seoTitle: '', seoDescription: '',
        subcategories: subs.map(function (s) { return { id: uid('s'), name: s, slug: slugify(s) }; }),
        filters: { type: true, color: true, material: true, price: true } };
    }
    var cats = [cat('Bath', 'bath', ['Bath Rugs', 'Towels', 'Bath Accessories']), cat('Rugs', 'rugs', ['Accent Rugs', 'Area Rugs']),
      cat('Bedding', 'bedding', ['Comforters', 'Sheet Sets', 'Duvet Covers']), cat('Decor', 'decor', ['Pillows', 'Throws'])];
    function find(cs, ss) { var c = cats.find(function (x) { return x.slug === cs; }); return [c.id, c.subcategories.find(function (x) { return x.name === ss; }).id]; }
    var n = 0;
    function P(name, cs, ss, price, sale, desc, o) {
      o = o || {}; var ids = find(cs, ss); n++;
      return { id: uid('p'), name: name, slug: slugify(name), sku: 'HW-' + String(1000 + n), categoryId: ids[0], subcategoryId: ids[1],
        price: price, salePrice: sale, description: desc, image: '', images: ['', '', '', '', '', '', '', ''], primary: 0, video: '',
        swatch: o.swatch || SWATCH[n % SWATCH.length], badge: o.badge || '', featured: !!o.featured, inStock: true, hidden: false,
        material: '100% long-staple cotton', care: CARE, origin: 'Woven in Portugal', seoTitle: '', seoDescription: '', imageAlt: '',
        features: ['Woven from 100% long-staple cotton', 'OEKO-TEX® certified — free of harmful chemicals', 'Pre-washed for lasting softness', 'Gets better with every wash'] };
    }
    function waterford() {
      var ids = find('bedding', 'Duvet Covers');
      function mkC(label, hex) { return { id: uid('cl'), label: label, hex: hex, images: ['', '', '', '', '', '', '', ''], video: '', primary: 0 }; }
      function mkS(label, price) { return { id: uid('sz'), label: label, price: price, salePrice: null }; }
      var colors = [mkC('Ivory', '#EFE9DC'), mkC('Flax', '#CBC0AC'), mkC('Spruce', '#3A5A52'), mkC('Mist', '#B7C2C9'), mkC('Sage', '#9FB3A6'), mkC('Clay', '#B5754F'), mkC('Charcoal', '#46423D'), mkC('Blush', '#D8C3B6')];
      var sizes = [mkS('Twin', 228), mkS('Twin XL', 238), mkS('Full', 258), mkS('Queen', 268), mkS('King', 318), mkS('Cal King', 328)];
      var variants = {};
      variants[colors[2].id + '__' + sizes[4].id] = { inStock: false };
      return { id: uid('p'), name: 'Waterford', slug: 'waterford', categoryId: ids[0], subcategoryId: ids[1],
        description: 'Our signature woven duvet collection. Yarn-dyed long-staple cotton with a soft matelassé texture and a quiet tonal border — offered across a full range of colors and bed sizes.',
        options: [{ id: uid('o'), name: 'Color', type: 'color', values: colors }, { id: uid('o'), name: 'Size', type: 'size', values: sizes }],
        variants: variants, basePrice: 268, baseSalePrice: null, skuPrefix: 'WAT', badge: 'Signature', featured: true, inStock: true, hidden: false,
        material: '100% long-staple cotton', care: CARE, origin: 'Woven in Portugal', seoTitle: '', seoDescription: '', imageAlt: '',
        features: ['Yarn-dyed long-staple cotton', 'Soft matelassé woven texture', 'Quiet tonal border detail', 'Hidden button closure', 'Interior corner ties hold the insert in place'] };
    }
    var products = [
      waterford(),
      P('Cloudloft Bath Rug', 'bath', 'Bath Rugs', 58, 48, 'A dense, quick-drying pile that cushions every step out of the shower. Memory-soft and slip-resistant.', { featured: true, badge: 'Bestseller' }),
      P('Pillowed Memory Bath Mat', 'bath', 'Bath Rugs', 64, null, 'Layered memory foam core wrapped in plush microfiber for a spa-underfoot feeling.'),
      P('Heirloom Turkish Bath Towel', 'bath', 'Towels', 38, null, 'Long-staple Turkish cotton that grows softer and more absorbent with every wash.', { featured: true, badge: 'New' }),
      P('Ribbed Spa Hand Towel', 'bath', 'Towels', 22, 18, 'Textured rib weave with a tailored border. Sold as a set of two.'),
      P('Marble Tumbler', 'bath', 'Bath Accessories', 26, null, 'Honed resin tumbler with a soft marbled finish to anchor your vanity.'),
      P('Hand-Knotted Accent Rug', 'rugs', 'Accent Rugs', 128, null, 'A small-scale hand-knotted wool rug with a low, even pile and fringed ends.', { featured: true }),
      P('Loomweave Area Rug 5x8', 'rugs', 'Area Rugs', 398, 329, 'Flatwoven from recycled cotton in a quiet tonal stripe. Reversible and durable.', { badge: 'Sale' }),
      P('Heritage Down Comforter', 'bedding', 'Comforters', 289, null, 'Baffle-box construction filled with responsibly sourced down for even, lofty warmth.', { featured: true }),
      P('Washed Percale Sheet Set', 'bedding', 'Sheet Sets', 168, 138, 'Crisp, breathable percale given a garment wash for that perfectly lived-in hand.', { badge: 'Sale' }),
      P('Boucle Lumbar Pillow', 'decor', 'Pillows', 72, null, 'A nubby boucle face with a linen back and feather-down insert included.', { featured: true }),
      P('Handloom Throw Blanket', 'decor', 'Throws', 98, 78, 'Reversible handloom throw with brushed cotton softness and tasseled ends.', { badge: 'Sale' })
    ];
    return {
      categories: cats,
      products: products,
      inventory: {},
      promos: [
        { id: uid('promo'), code: 'WELCOME15', type: 'percent', value: 15, minOrder: 0, active: true, startsAt: '', endsAt: '', usageLimit: 0, oncePerCustomer: true },
        { id: uid('promo'), code: 'SPRING15', type: 'percent', value: 15, minOrder: 100, active: true, startsAt: '', endsAt: '', usageLimit: 0, oncePerCustomer: false },
        { id: uid('promo'), code: 'TAKE20', type: 'fixed', value: 20, minOrder: 150, active: false, startsAt: '', endsAt: '', usageLimit: 0, oncePerCustomer: false }
      ],
      newsletter: { couponCode: 'WELCOME15' },
      hero: { autoplay: true, interval: 5000, slides: [
        { eyebrow: 'New · The Spring Bath Edit', title: 'Softness, woven in.', subtitle: 'Plush bath rugs, Turkish towels, and bedding crafted from long-staple cotton — built to feel better with every wash.', ctaText: 'Shop the bath', ctaLink: '/category/bath', image: '', mobileImage: '', alt: '' },
        { eyebrow: 'Signature collection', title: 'Meet Waterford.', subtitle: 'Our yarn-dyed woven duvet, offered across a full range of colors and bed sizes.', ctaText: 'Shop Waterford', ctaLink: '/product/waterford', image: '', mobileImage: '', alt: '' },
        { eyebrow: 'Layer the bed', title: 'Bedding, built to last.', subtitle: 'Down comforters, washed percale, and pre-washed linen with a relaxed, lived-in drape.', ctaText: 'Shop bedding', ctaLink: '/category/bedding', image: '', mobileImage: '', alt: '' },
        { eyebrow: 'Underfoot & beyond', title: 'Texture for every room.', subtitle: 'Hand-knotted accent rugs and flatwoven area rugs in quiet, tonal palettes.', ctaText: 'Shop rugs', ctaLink: '/category/rugs', image: '', mobileImage: '', alt: '' }
      ] }
    };
  };
})(window.HW = window.HW || {});
