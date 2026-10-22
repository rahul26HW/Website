#!/usr/bin/env node
/* Builds a staging copy of the site into its own folder, pointed at a staging Supabase project.

   The staging tree is the same code as production — only js/config.js differs — so keeping the two
   in step is a re-run of this script, never a hand-merge. The staging flag in that config turns on
   the red STAGING band and forces noindex everywhere.

   Set it up once:  copy staging.config.example.json to staging.config.json and fill it in.
                    That file holds no secrets (a publishable key is public), but it is git-ignored
                    anyway so a staging project can never be published by accident.

   Run:  node tools/build-staging.js            (seeds the page build from the live catalog snapshot)
         node tools/build-staging.js store.json (seeds it from a local export instead)            */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CFG = path.join(ROOT, 'staging.config.json');

/* Everything the site needs at runtime. tools/ comes too: the page build runs inside the copy. */
const COPY = ['index.html', '404.html', 'admin.html', 'account.html', 'checkout.html', 'favicon.png', '_config.yml',
  'apple-touch-icon.png', 'site.webmanifest', 'css', 'js', 'assets', 'tools'];
const SKIP = new Set(['.git', '.claude', 'node_modules', 'staging.config.json']);

function die(msg) { console.error('\n' + msg + '\n'); process.exit(1); }

function readConfig() {
  if (!fs.existsSync(CFG)) die('No staging.config.json. Copy staging.config.example.json to staging.config.json and fill in the staging project details.');
  let c;
  try { c = JSON.parse(fs.readFileSync(CFG, 'utf8')); } catch (e) { die('staging.config.json is not valid JSON: ' + e.message); }
  const url = String(c.supabaseUrl || '').replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) die('staging.config.json: supabaseUrl must look like https://abcdefgh.supabase.co');
  if (url.indexOf('soydgxrrwozmiqzutypr') >= 0) die('staging.config.json points at the PRODUCTION project. Staging must have its own Supabase project, or the audit will write to live orders.');
  if (!/^sb_publishable_/.test(String(c.supabasePublishableKey || ''))) die('staging.config.json: supabasePublishableKey must be the sb_publishable_… key (never a secret or service_role key).');
  if (/service_role|^sb_secret_|^eyJ/.test(String(c.supabasePublishableKey))) die('That looks like a secret key. Only the publishable key belongs in a file the browser downloads.');
  if (!c.out) die('staging.config.json: set "out" to the folder the staging repo lives in.');
  return { url: url, key: c.supabasePublishableKey, out: path.resolve(c.out), siteUrl: String(c.siteUrl || '').replace(/\/?$/, '/') };
}

function copyInto(src, dest) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      if (SKIP.has(name)) continue;
      copyInto(path.join(src, name), path.join(dest, name));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function main() {
  const cfg = readConfig();
  fs.mkdirSync(cfg.out, { recursive: true });

  for (const name of COPY) {
    const src = path.join(ROOT, name);
    if (fs.existsSync(src)) copyInto(src, path.join(cfg.out, name));
  }

  // The one file that differs from production.
  fs.writeFileSync(path.join(cfg.out, 'js', 'config.js'),
    '/* Home Weavers — STAGING configuration. Written by tools/build-staging.js; do not edit by hand.\n' +
    '   Only PUBLIC values belong here. Never put a secret or service_role key in this file. */\n' +
    'window.HW_CONFIG = {\n' +
    "  supabaseUrl: '" + cfg.url + "',\n" +
    "  supabasePublishableKey: '" + cfg.key + "',\n" +
    '  staging: true\n' +
    '};\n');

  // The preconnect hint names the production project in the shipped HTML; point it at staging.
  for (const f of ['index.html', 'admin.html', '404.html']) {
    const full = path.join(cfg.out, f);
    if (!fs.existsSync(full)) continue;
    const before = fs.readFileSync(full, 'utf8');
    const after = before.replace(/https:\/\/soydgxrrwozmiqzutypr\.supabase\.co/g, cfg.url);
    if (after !== before) fs.writeFileSync(full, after);
  }

  // Nothing on a staging shop should ever reach a search index.
  fs.writeFileSync(path.join(cfg.out, 'robots.txt'), 'User-agent: *\nDisallow: /\n');

  // Build the per-page HTML inside the copy, so ROOT — and the Supabase URL in the policy — are staging's.
  const seed = process.argv[2] ? path.resolve(process.argv[2]) : null;
  const env = Object.assign({}, process.env);
  if (cfg.siteUrl) env.SITE_URL = cfg.siteUrl;
  const run = (script, args) => execFileSync(process.execPath, [path.join(cfg.out, 'tools', script)].concat(args || []),
    { cwd: cfg.out, env: env, stdio: 'inherit' });
  run('build-pages.js', seed ? [seed] : []);

  fs.rmSync(path.join(cfg.out, 'tools'), { recursive: true, force: true });
  fs.rmSync(path.join(cfg.out, 'sitemap.xml'), { force: true });  // a noindex site publishes no sitemap

  console.log('\nStaging tree written to ' + cfg.out);
  console.log('Supabase: ' + cfg.url);
  console.log('Next: commit and push that folder to the staging repo.');
}

main();
