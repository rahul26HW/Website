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

function policy(html, opts) {
  const snip = !!(opts && opts.snipcart);
  const hashes = [];
  html.replace(/<script>([\s\S]*?)<\/script>/g, (all, body) => {
    hashes.push("'sha256-" + crypto.createHash('sha256').update(body, 'utf8').digest('base64') + "'");
    return all;
  });
  const sb = supabaseUrl();
  return [
    "default-src 'self'",
    // Snipcart hosts are listed only while Snipcart is switched on in the admin (node tools/csp.js --snipcart).
    // Google's sign-in button (loaded on the sign-in page only).
    "script-src 'self' " + hashes.join(' ') + ' https://accounts.google.com/gsi/client' + (snip ? ' https://cdn.snipcart.com' : ''),
    "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style" + (snip ? ' https://cdn.snipcart.com' : ''),
    "font-src 'self'" + (snip ? ' https://cdn.snipcart.com' : ''),
    // Product photos live in Supabase Storage; admins may also paste image links from other https sites.
    "img-src 'self' data: blob: https:",
    "media-src 'self' https:",
    // Database and the Edge Function (Stripe, ShipStation, email, AI) both live on the Supabase project.
    "connect-src 'self' " + sb + ' https://accounts.google.com/gsi/' + (snip ? ' https://app.snipcart.com https://payment.snipcart.com' : '') + ' data: blob:',
    'frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://accounts.google.com/gsi/' + (snip ? ' https://*.snipcart.com' : ''),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ');
}

function write(file, opts) {
  const full = path.join(ROOT, file);
  let html = fs.readFileSync(full, 'utf8');
  html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\n?/, '').replace(/<meta name="referrer"[^>]*>\n?/, '');
  const tags = '<meta http-equiv="Content-Security-Policy" content="' + policy(html, opts) + '">\n' +
    '<meta name="referrer" content="strict-origin-when-cross-origin">\n';
  // Must come before the first inline script.
  // \r?\n: a Windows checkout can give the file CRLF endings, and the tags still have to go in.
  html = html.replace(/(<meta charset="utf-8">\r?\n)/, '$1' + tags);
  if (html.indexOf('Content-Security-Policy') < 0) throw new Error(file + ': <meta charset="utf-8"> not found, so the policy could not be written');
  fs.writeFileSync(full, html);
}

if (require.main === module) {
  const opts = { snipcart: process.argv.includes('--snipcart') };
  ['index.html', '404.html'].forEach(function (f) { write(f, opts); });
  console.log('Content Security Policy updated in index.html and 404.html.');
}
module.exports = { write };
