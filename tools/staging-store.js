#!/usr/bin/env node
/* Turns the live catalog snapshot into a store file safe to import into staging.

   The catalog itself is public already (the shop downloads it on every visit), so copying it
   carries nothing private. What this changes is everything that could reach a real person or a
   real card: the site address, the payment settings, and any email endpoint.

   Run:  node tools/staging-store.js                       (downloads the live snapshot)
         node tools/staging-store.js store.json            (uses a local export)
   Then: staging admin -> Settings -> Import, and pick the file it writes.                      */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'staging-store.json');
const LIVE = 'https://soydgxrrwozmiqzutypr.supabase.co/storage/v1/object/public/media/public/store.json';

function cfg() {
  const f = path.join(ROOT, 'staging.config.json');
  if (!fs.existsSync(f)) { console.error('\nNo staging.config.json — copy staging.config.example.json first.\n'); process.exit(1); }
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

async function load(file) {
  if (file) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const res = await fetch(LIVE, { cache: 'no-store' });
  if (!res.ok) throw new Error('Could not download the live snapshot (HTTP ' + res.status + ')');
  return res.json();
}

async function main() {
  const c = cfg();
  const raw = await load(process.argv[2]);
  const s = raw.data || raw.store || raw;

  s.settings = s.settings || {};
  s.settings.siteUrl = String(c.siteUrl || '').replace(/\/?$/, '/');

  // Both pay methods on, so card and cash on delivery can each be walked through.
  s.payments = Object.assign({}, s.payments, { stripe: true, cod: true, workerUrl: String(c.workerUrl || '') });

  // Nothing on staging should be able to email a real person.
  s.newsletter = Object.assign({}, s.newsletter, { emailEndpoint: '' });

  // Two codes to test with: one percentage, one that is already expired.
  const keep = (s.promos || []).filter(function (p) { return !/^STAGE/.test(String(p.code || '')); });
  const day = 86400000;
  s.promos = keep.concat([
    { id: 'promo_stage10', code: 'STAGE10', type: 'percent', value: 10, active: true, minOrder: 0,
      startsAt: '', endsAt: new Date(Date.now() + 90 * day).toISOString().slice(0, 10) },
    { id: 'promo_stageold', code: 'STAGEOLD', type: 'percent', value: 50, active: true, minOrder: 0,
      startsAt: '', endsAt: new Date(Date.now() - 2 * day).toISOString().slice(0, 10) }
  ]);

  fs.writeFileSync(OUT, JSON.stringify({ store: s }, null, 0));
  const kb = Math.round(fs.statSync(OUT).size / 1024);
  console.log('Wrote ' + OUT + ' (' + kb + ' KB)');
  console.log('  site      ' + s.settings.siteUrl);
  console.log('  worker    ' + (s.payments.workerUrl || '(not set — Stripe checkout will not start)'));
  console.log('  products  ' + (s.products || []).length + ', promos ' + s.promos.length);
  console.log('\nImport it from the staging admin, not from production.');
}

main().catch(function (e) { console.error('\n' + e.message + '\n'); process.exit(1); });
