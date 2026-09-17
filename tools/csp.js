#!/usr/bin/env node
/* Writes the Content Security Policy <meta> into index.html and 404.html.
   The policy lists what the browser may load; everything else is blocked. Inline <script> blocks are allowed
   by their SHA-256 hash, so run this after editing any inline script (build-pages.js runs it for you).

   Run:  node tools/csp.js */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function supabaseUrl() {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8'), ctx);
  const u = String((ctx.window.HW_CONFIG || {}).supabaseUrl || '');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(u)) throw new Error('js/config.js has no valid supabaseUrl');
  return u;
}

function policy(html) {
  const hashes = [];
  html.replace(/<script>([\s\S]*?)<\/script>/g, (all, body) => {
    hashes.push("'sha256-" + crypto.createHash('sha256').update(body, 'utf8').digest('base64') + "'");
    return all;
  });
  const sb = supabaseUrl();
  return [
    "default-src 'self'",
    // Snipcart (only loads when switched on in the admin).
    "script-src 'self' " + hashes.join(' ') + ' https://cdn.snipcart.com',
    "style-src 'self' 'unsafe-inline' https://cdn.snipcart.com",
    "font-src 'self' https://cdn.snipcart.com",
    // Product photos live in Supabase Storage; admins may also paste image links from other https sites.
    "img-src 'self' data: blob: https:",
    "media-src 'self' https:",
    // Database, the Cloudflare worker (Stripe, ShipStation, AI) and Snipcart. A worker on a custom domain must be added here.
    "connect-src 'self' " + sb + ' https://*.workers.dev https://app.snipcart.com https://payment.snipcart.com data: blob:',
    'frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://*.snipcart.com',
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ');
}

function write(file) {
  const full = path.join(ROOT, file);
  let html = fs.readFileSync(full, 'utf8');
  html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\n?/, '').replace(/<meta name="referrer"[^>]*>\n?/, '');
  const tags = '<meta http-equiv="Content-Security-Policy" content="' + policy(html) + '">\n' +
    '<meta name="referrer" content="strict-origin-when-cross-origin">\n';
  // Must come before the first inline script.
  html = html.replace(/(<meta charset="utf-8">\n)/, '$1' + tags);
  if (html.indexOf('Content-Security-Policy') < 0) throw new Error(file + ': <meta charset="utf-8"> not found');
  fs.writeFileSync(full, html);
}

if (require.main === module) {
  ['index.html', '404.html'].forEach(write);
  console.log('Content Security Policy updated in index.html and 404.html.');
}
module.exports = { write };
