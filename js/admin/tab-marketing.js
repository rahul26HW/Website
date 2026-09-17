/* Home Weavers — admin: Marketing studio (AI operator, daily tasks, results log, content generation).
   AI calls go ONLY to your Cloudflare Worker, signed with your admin session. No API keys in the browser. */
(function (HW) {
  'use strict';

  var A = HW.A, u = HW.u, esc = u.esc;
  var out = { content: '', review: '' };

  function mk() { return A.privDraft.marketing; }
  function todayKey() { return A.today(); }

  /* ---------- AI endpoint checks ---------- */
  function endpoint() { return String(mk().endpoint || '').trim().replace(/\/+$/, ''); }
  function endpointProblem(url) {
    url = String(url || '').trim();
    if (!url) return 'not set';
    if (/api\.anthropic\.com|api\.openai\.com/i.test(url)) return 'This is the AI company’s own address. The browser must never call it directly (your secret key would be exposed). Paste your Cloudflare Worker URL instead.';
    if (!/^https:\/\/[^\s/]+/i.test(url)) return 'The worker URL must start with https://';
    return '';
  }
  function aiReady() { return !endpointProblem(mk().endpoint); }
  function imageEndpoint() {
    var ie = String(mk().imageEndpoint || '').trim().replace(/\/+$/, '');
    return ie || (aiReady() ? endpoint() + '/image' : '');
  }

  async function authHeader() {
    var s = await A.sb.auth.getSession();
    var token = s.data && s.data.session && s.data.session.access_token;
    if (!token) throw new Error('Your session expired. Sign in again.');
    return 'Bearer ' + token;
  }

  async function aiCall(prompt, system) {
    if (!aiReady()) throw new Error('Set up the AI worker first (see “AI worker” below).');
    var res = await fetch(endpoint() + '/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: await authHeader() },
      body: JSON.stringify({ system: system || '', prompt: prompt })
    });
    var data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error(data.error || ('AI request failed (' + res.status + ')'));
    if (!data.text) throw new Error(data.error || 'The AI returned an empty reply — try again.');
    return data.text;
  }

  function parseJSON(raw) {
    var t = String(raw || '').replace(/```json|```/g, '').trim();
    try { return JSON.parse(t); } catch (e) {}
    var s = t.indexOf('{'), e2 = t.lastIndexOf('}');
    if (s >= 0 && e2 > s) { try { return JSON.parse(t.slice(s, e2 + 1)); } catch (e) {} }
    throw new Error('The AI reply came back incomplete — click the button once more.');
  }

  function catalogSummary(n) {
    return (A.draft.products || []).filter(function (p) { return !p.hidden; }).slice(0, n || 12).map(function (p) { return HW.seo.clip(p.name, 70); }).join(', ');
  }

  /* ---------- goal ---------- */
  function goal() {
    // Read-only defaults: opening the tab must not create unsaved changes.
    var g = mk().goal || {};
    return { amount: Number(g.amount) || 5000000, weeks: Number(g.weeks) || 156, startISO: g.startISO || todayKey() };
  }
  function goalWeek() {
    var g = goal();
    var diff = Math.floor((new Date() - new Date(g.startISO)) / (7 * 864e5));
    return Math.min(Math.max(1, diff + 1), g.weeks || 156);
  }
  function goalPhase(w) {
    var year = Math.min(3, Math.ceil(w / 52)), q = Math.min(4, Math.ceil((w - (year - 1) * 52) / 13));
    var names = { 1: 'Foundation & First Traction', 2: 'Scale the Engine', 3: 'Compound the Growth' };
    return 'Year ' + year + ' · Q' + q + ' — ' + (names[year] || '');
  }

  /* ---------- output blocks ---------- */
  var blockN = 0;
  function block(label, val) {
    val = String(val || '');
    var id = 'mkb' + (++blockN);
    return '<div class="mktblock"><div class="mkthead"><label for="' + id + '"><b>' + esc(label) + '</b></label>' +
      '<button class="btn ghost sm" type="button" data-a="copy" data-target="' + id + '">Copy</button></div>' +
      '<textarea id="' + id + '" rows="' + Math.min(9, Math.max(2, Math.ceil(val.length / 58))) + '">' + esc(val) + '</textarea></div>';
  }
  function imageBlock(label, val) {
    val = String(val || '');
    var id = 'mkb' + (++blockN);
    return '<div class="mktblock"><div class="mkthead"><label for="' + id + '"><b>' + esc(label) + '</b></label><span class="btnrow">' +
      '<button class="btn ghost sm" type="button" data-a="copy" data-target="' + id + '">Copy</button>' +
      '<button class="btn loom sm" type="button" data-a="mkt-image" data-target="' + id + '"' + (aiReady() ? '' : ' disabled') + '>🎨 Generate image</button></span></div>' +
      '<textarea id="' + id + '" rows="' + Math.min(9, Math.max(2, Math.ceil(val.length / 58))) + '">' + esc(val) + '</textarea><div id="' + id + '_img"></div></div>';
  }
  function errBox(title, e) { return '<div class="panel errpanel"><b>' + esc(title) + '</b><p class="hint" style="margin:6px 0 0">' + esc(e.message || e) + '</p></div>'; }

  /* ---------- render ---------- */
  A.tabs.marketing = {
    render: function () {
      var ui = A.ui, m = mk(), g = goal(), w = goalWeek();
      var ready = aiReady(), prob = endpointProblem(m.endpoint);
      var dis = ready ? '' : ' disabled';
      var tasks = m.tasks[todayKey()] || [];
      var op = m.operator['w' + w];
      var dirs = (op && op.directives) || [];
      var chan = { Instagram: '#B5754F', Pinterest: '#3A5A52', Email: '#6C6359', Ads: '#2C463F', Promo: '#B5754F', Banner: '#3A5A52', Site: '#6C6359' };
      var log = (m.log || []).slice().reverse().slice(0, 12);

      return '<h1>Marketing studio</h1><p class="sub">Your marketing routine, AI content and a results log — all from your real catalog. Plans, checkmarks and logged results save automatically; settings use the Save button.</p>' +
        (!ready ? '<section class="panel setup"><h2 class="ph3">Set up AI worker</h2><p style="margin:0 0 8px">The AI buttons are off until you connect your Cloudflare Worker. ' +
          (prob === 'not set' ? '' : '<span class="bad">' + esc(prob) + '</span>') + '</p>' +
          '<ol class="hint"><li>Create the free worker from <b>ai-proxy.worker.js</b> (steps in README → AI worker).</li><li>Paste its URL in <b>AI worker</b> below and click Save.</li></ol></section>' : '') +

        '<section class="panel operator"><h2 class="ph3">🧭 AI Operator — your marketing manager</h2>' +
        '<p class="hint" style="margin:-6px 0 10px">Goal: <b>$' + Math.round(g.amount).toLocaleString() + '</b> in ' + g.weeks + ' weeks · <b>Week ' + w + '</b> · ' + esc(goalPhase(w)) + '</p>' +
        (op && op.focus ? '<p style="margin:0 0 10px;font-weight:600">This week’s focus: <span style="font-weight:400">' + esc(op.focus) + '</span></p>' : '') +
        (dirs.length ? dirs.map(function (d) {
          return '<div class="taskrow"><label><input type="checkbox" data-a-change="mkt-dir" data-id="' + esc(d.id) + '"' + (d.done ? ' checked' : '') + '>' +
            '<span class="' + (d.done ? 'done' : '') + '"><span class="chan" style="background:' + (chan[d.channel] || '#6C6359') + '">' + esc(d.channel || '') + '</span>' + esc(d.task) +
            '<br><span class="hint">↳ ' + esc(d.why || '') + '</span></span></label>' +
            '<div class="taskmake"><button class="btn loom sm" type="button" data-a="mkt-make" data-text="' + esc(d.task) + '" data-slot="op_' + esc(d.id) + '"' + dis + '>✨ Make this for me</button><div id="op_' + esc(d.id) + '"></div></div></div>';
        }).join('') + '<p class="hint">' + dirs.filter(function (d) { return d.done; }).length + '/' + dirs.length + ' done</p>'
          : '<p class="hint">No briefing yet for this week.</p>') +
        '<div id="opErr"></div><button class="btn ' + (dirs.length ? 'ghost' : 'loom') + ' sm" type="button" data-a="mkt-brief"' + dis + '>' + (dirs.length ? 'Re-brief the team' : '📋 Brief the team for this week') + '</button>' +
        '<details style="margin-top:14px"><summary class="hint">Goal settings</summary><div class="grid2" style="margin-top:8px">' +
        ui.field('Sales goal ($)', 'priv.marketing.goal.amount', g.amount, { type: 'number', min: 1 }) +
        ui.field('Timeframe (weeks)', 'priv.marketing.goal.weeks', g.weeks, { type: 'int', min: 1 }) +
        ui.field('Goal start date', 'priv.marketing.goal.startISO', g.startISO, { inputType: 'date' }) + '</div>' + ui.saveBtn('Save goal') + '</details></section>' +

        '<section class="panel"><h2 class="ph3">Today’s plan</h2>' +
        (tasks.length ? tasks.map(function (t) {
          return '<div class="taskrow"><label><input type="checkbox" data-a-change="mkt-task" data-id="' + esc(t.id) + '"' + (t.done ? ' checked' : '') + '><span class="' + (t.done ? 'done' : '') + '">' + esc(t.text) + '</span></label>' +
            '<div class="taskmake"><button class="btn loom sm" type="button" data-a="mkt-make" data-text="' + esc(t.text) + '" data-slot="mk_' + esc(t.id) + '"' + dis + '>✨ Make this for me</button><div id="mk_' + esc(t.id) + '"></div></div></div>';
        }).join('') : '<p class="hint">No plan yet for today.</p>') +
        '<div id="taskErr"></div><button class="btn ' + (tasks.length ? 'ghost' : 'loom') + ' sm" type="button" data-a="mkt-tasks"' + dis + '>' + (tasks.length ? 'Re-plan today' : '✨ Plan my day') + '</button></section>' +

        '<section class="panel"><h2 class="ph3">Log results &amp; let AI review</h2>' +
        '<p class="hint" style="margin:-6px 0 12px">Enter the numbers you see after posting. Empty entries (all zeros, no note) and exact duplicates are not saved.</p>' +
        '<form data-aform="mktlog" novalidate><div class="grid-auto">' +
        '<div class="field"><label for="lg_date">Date</label><input id="lg_date" name="date" type="date" value="' + todayKey() + '"></div>' +
        '<div class="field"><label for="lg_plat">Platform</label><select id="lg_plat" name="platform"><option>Instagram</option><option>Pinterest</option><option>Facebook</option><option>Email</option><option>Ads</option><option>Other</option></select></div>' +
        '<div class="field"><label for="lg_reach">Reach / views</label><input id="lg_reach" name="reach" type="number" min="0" placeholder="0"></div>' +
        '<div class="field"><label for="lg_clicks">Link clicks</label><input id="lg_clicks" name="clicks" type="number" min="0" placeholder="0"></div>' +
        '<div class="field"><label for="lg_orders">Orders</label><input id="lg_orders" name="orders" type="number" min="0" placeholder="0"></div>' +
        '<div class="field"><label for="lg_rev">Revenue ($)</label><input id="lg_rev" name="revenue" type="number" min="0" step="0.01" placeholder="0"></div></div>' +
        '<div class="field"><label for="lg_note">Note (optional)</label><input id="lg_note" name="note" maxlength="200" placeholder="e.g. Reel of the Gradiation rug"></div>' +
        '<div class="btnrow"><button class="btn loom sm" type="submit">+ Log result</button><button class="btn ghost sm" type="button" data-a="mkt-review"' + dis + '>🔎 Review my results with AI</button></div></form>' +
        (log.length ? '<div class="tablewrap" style="margin-top:14px"><table class="adt"><thead><tr><th>Date</th><th>Platform</th><th>Reach</th><th>Clicks</th><th>Orders</th><th>Revenue</th><th>Note</th><th><span class="sr-only">Delete</span></th></tr></thead><tbody>' +
          log.map(function (l) {
            return '<tr><td>' + esc(l.date) + '</td><td>' + esc(l.platform || '') + '</td><td>' + (l.reach || 0) + '</td><td>' + (l.clicks || 0) + '</td><td>' + (l.orders || 0) + '</td><td>' + u.money(l.revenue || 0) + '</td><td class="hint">' + esc(l.note || '') + '</td>' +
              '<td><button class="txtbtn danger" type="button" data-a="mkt-log-delete" data-id="' + esc(l.id) + '" aria-label="Delete result from ' + esc(l.date) + '">✕</button></td></tr>';
          }).join('') + '</tbody></table></div>' : '<p class="hint" style="margin-top:12px">No results logged yet.</p>') +
        '<div id="mktReview">' + out.review + '</div></section>' +

        '<section class="panel"><h2 class="ph3">Generate content</h2>' +
        ui.field('Product', 'priv.mktProduct', A.mktProduct || '', { id: 'mkt_prod', options: (A.draft.products || []).map(function (p) { return [p.id, HW.seo.clip(p.name, 80)]; }), live: 'mktProduct' }) +
        '<div class="btnrow"><button class="btn loom sm" type="button" data-a="mkt-gen" data-kind="post"' + dis + '>✨ Instagram + Pinterest post</button>' +
        '<button class="btn ghost sm" type="button" data-a="mkt-gen" data-kind="image"' + dis + '>📸 Image prompts</button>' +
        '<button class="btn ghost sm" type="button" data-a="mkt-gen" data-kind="plan"' + dis + '>🗓 7-day content plan</button>' +
        '<button class="btn ghost sm" type="button" data-a="mkt-gen" data-kind="campaign"' + dis + '>💡 Campaign ideas</button></div>' +
        '<div id="mktOut" style="margin-top:14px" aria-live="polite">' + (out.content || '<p class="hint">Pick a product and click a button.</p>') + '</div></section>' +

        ui.panel('Brand voice &amp; AI worker',
          ui.field('Brand voice', 'priv.marketing.voice', m.voice, { textarea: true, rows: 3, hint: 'How your brand should sound, e.g. “warm, understated, slow-living; celebrates natural fibers and craftsmanship.”' }) +
          ui.field('AI worker URL', 'priv.marketing.endpoint', m.endpoint, { type: 'trim', live: 'endpointCheck', placeholder: 'https://home-weavers-ai.yourname.workers.dev',
            hint: '<span id="epMsg" class="' + (prob && prob !== 'not set' ? 'bad' : '') + '">' + (prob && prob !== 'not set' ? '⚠ ' + esc(prob) : 'Your Cloudflare Worker URL. It holds the API key and only answers signed-in admins.') + '</span>' }) +
          ui.field('Image worker URL (optional)', 'priv.marketing.imageEndpoint', m.imageEndpoint, { type: 'trim', placeholder: 'Blank = the AI worker’s /image route', hint: 'Only if you run image generation on a separate worker.' }) +
          '<div class="btnrow">' + '<button class="btn ghost sm" type="button" data-a="mkt-test"' + dis + '>Test connection</button></div><div id="mktTest" aria-live="polite"></div>' +
          ui.saveBtn());
    },
    after: function () {
      var main = document.getElementById('adminMain');
      main.addEventListener('change', function (e) {
        var el = e.target, a = el.dataset && el.dataset.aChange;
        if (a === 'mkt-task') toggle(mk().tasks[todayKey()] || [], el.dataset.id);
        if (a === 'mkt-dir') { var op = mk().operator['w' + goalWeek()]; toggle((op && op.directives) || [], el.dataset.id); }
      });
      if (!A.mktProduct && A.draft.products[0]) A.mktProduct = A.draft.products[0].id;
    }
  };

  A.live.mktProduct = function (el) { A.mktProduct = el.value; delete A.privDraft.mktProduct; A.refreshDirtyBar(); };
  A.live.endpointCheck = function (el) {
    var msg = document.getElementById('epMsg'); if (!msg) return;
    var p = endpointProblem(el.value);
    msg.className = p && p !== 'not set' ? 'bad' : '';
    msg.textContent = p && p !== 'not set' ? '⚠ ' + p : (p ? 'Your Cloudflare Worker URL.' : 'Looks good — click Save, then Test connection.');
  };

  /* Auto-saved workflow data: saves only the marketing fields that changed, keeps unsaved settings as they are. */
  async function autosave(mutate, msg) {
    // Apply the change to both the saved copy and the draft, so unsaved form edits aren't published by accident.
    var base = A.clone(A.priv);
    mutate(A.normalizePrivate(base).marketing);
    mutate(A.privDraft.marketing);
    var keepDraft = A.clone(A.privDraft);
    A.privDraft = base;
    var ok = await A.savePrivate(msg === undefined ? false : msg);
    A.privDraft = keepDraft;
    A.refreshDirtyBar();
    return ok;
  }

  async function toggle(list, id) {
    var item = list.find(function (x) { return x.id === id; });
    if (!item) return;
    var done = !item.done;
    var ok = await autosave(function (m) {
      var arr = [].concat(m.tasks[todayKey()] || []).concat(((m.operator['w' + goalWeek()] || {}).directives) || []);
      var it = arr.find(function (x) { return x.id === id; });
      if (it) it.done = done;
    });
    if (!ok) u.toast('Couldn’t save that checkmark');
    var y = window.scrollY; A.render(); window.scrollTo(0, y);
  }

  /* ---------- actions ---------- */
  A.actions['mkt-test'] = async function () {
    var box = document.getElementById('mktTest');
    if (A.dirtyPrivate()) { box.innerHTML = '<p class="hint">Save the worker URL first.</p>'; return; }
    box.innerHTML = '<p class="hint">Testing…</p>';
    try { var t = await aiCall('Reply with exactly: OK', 'Reply with exactly the word OK.'); box.innerHTML = '<p class="okmsg">✓ Connected. The AI replied: ' + esc(t.slice(0, 40)) + '</p>'; }
    catch (e) { box.innerHTML = '<p class="badmsg">⚠ ' + esc(e.message) + '</p>'; }
  };

  A.actions['mkt-tasks'] = async function (btn) {
    var box = document.getElementById('taskErr');
    btn.disabled = true; box.innerHTML = '<p class="hint">✨ Planning your day…</p>';
    try {
      var m = mk();
      var recent = (m.log || []).slice(-5).map(function (l) { return l.date + ' ' + l.platform + ' reach ' + l.reach + ' clicks ' + l.clicks + ' orders ' + l.orders; }).join('; ') || 'none yet';
      var raw = await aiCall('Brand: ' + A.draft.brand.name + '\nVoice: ' + (m.voice || 'a premium, warm home-textiles brand') + '\nProducts: ' + catalogSummary(10) + '\nRecent results: ' + recent +
        '\n\nGive a focused to-do list of 4-5 concrete social marketing tasks for TODAY for a small home-textiles shop on Instagram and Pinterest. Each doable in under 30 minutes; reference real products where useful. Return ONLY valid JSON: {"tasks":["task 1","task 2"]}',
        'You are a practical marketing coach. Output only valid JSON, no markdown.');
      var list = (parseJSON(raw).tasks || []).map(function (t) { return { id: u.uid('t'), text: String(t), done: false }; });
      if (!list.length) throw new Error('No tasks came back — try again.');
      if (!(await autosave(function (mm) { mm.tasks[todayKey()] = list; }))) throw new Error('The plan was created but couldn’t be saved.');
      A.render();
    } catch (e) { box.innerHTML = errBox('Couldn’t plan today.', e); btn.disabled = false; }
  };

  A.actions['mkt-brief'] = async function (btn) {
    var box = document.getElementById('opErr');
    btn.disabled = true; btn.textContent = '📋 Briefing…';
    try {
      var m = mk(), g = goal(), w = goalWeek();
      var log = (m.log || []).slice(-6).map(function (l) { return l.date + ' ' + l.platform + ': reach ' + l.reach + ', clicks ' + l.clicks + ', orders ' + l.orders + ', $' + l.revenue; }).join(' | ') || 'no results logged yet';
      var promos = (A.draft.promos || []).filter(function (p) { return p.active; }).map(function (p) { return p.code + ' (' + (p.type === 'percent' ? p.value + '% off' : '$' + p.value + ' off') + ')'; }).join(', ') || 'none active';
      var today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      var raw = await aiCall('You are the AI Marketing Operator for ' + A.draft.brand.name + ', a premium home-textiles store selling in the USA. Brand voice: ' + (m.voice || '') + '. Products: ' + catalogSummary(12) + '.\n\n' +
        'BIG GOAL: $' + Math.round(g.amount).toLocaleString() + ' in sales within ' + g.weeks + ' weeks.\nToday is ' + today + '. We are in WEEK ' + w + ' of ' + g.weeks + ' — phase: ' + goalPhase(w) + '.\n' +
        'Active discount codes: ' + promos + '.\nRecent results: ' + log + '.\n\n' +
        'Brief the team on THIS WEEK. If a seasonal or retail moment is coming up (Valentine’s, Mother’s Day, summer refresh, back-to-school, Black Friday / Cyber Monday, holidays, New Year), schedule for it ahead of time — a discount code, the announcement bar and the hero banner — as well as Instagram, Pinterest, Email and Ads.\n\n' +
        'Give a one-line focus, then 5-8 concrete directives. For each: task, channel (Instagram|Pinterest|Email|Ads|Promo|Banner|Site) and one line on why it matters for the goal. Return ONLY valid JSON: {"focus":"...","directives":[{"task":"...","channel":"...","why":"..."}]}',
        'You are a sharp, practical head of marketing. Output only valid JSON — no markdown, no preamble.');
      var d = parseJSON(raw);
      var brief = { focus: String(d.focus || ''), phase: goalPhase(w), directives: (d.directives || []).map(function (x) { return { id: u.uid('d'), task: String(x.task || ''), channel: String(x.channel || ''), why: String(x.why || ''), done: false }; }) };
      if (!brief.directives.length) throw new Error('No directives came back — try again.');
      if (!(await autosave(function (mm) { mm.operator['w' + w] = brief; }))) throw new Error('The briefing was created but couldn’t be saved.');
      A.render();
    } catch (e) { box.innerHTML = errBox('Couldn’t get a briefing.', e); btn.disabled = false; btn.textContent = '📋 Brief the team for this week'; }
  };

  A.actions['mkt-make'] = async function (btn) {
    var slot = document.getElementById(btn.dataset.slot); if (!slot) return;
    btn.disabled = true; slot.innerHTML = '<p class="hint">✨ Creating this for you…</p>';
    try {
      var m = mk();
      var raw = await aiCall('Brand: ' + A.draft.brand.name + '\nVoice: ' + (m.voice || '') + '\nProducts: ' + catalogSummary(12) + '\n\nHere is one marketing task:\n"' + btn.dataset.text + '"\n\n' +
        'Produce the FINISHED, ready-to-use deliverable for this exact task. Decide the format:\n- Photo or written post: caption, hashtags and an image_prompt.\n- Video or Reel: caption, hashtags and a "reel" shot-by-shot plan filmed on a phone with the REAL product (no generated video); image_prompt empty.\n- Paid ad: ad copy (primary text, headline, description), target audience and an image_prompt.\n- Promo / banner / seasonal store change: in "store" give discount_code, discount_percent, announcement, hero_headline, hero_subhead, plus an image_prompt for the banner (no text in the image).\n' +
        'Return ONLY valid JSON: {"format":"photo|video|ad|store|other","caption":"","hashtags":[""],"image_prompt":"","reel":{"hook":"","audio":"","shots":[{"time":"0-3s","action":"","onscreen":""}],"cta":""},"ad":{"primary":"","headline":"","description":"","audience":""},"store":{"discount_code":"","discount_percent":0,"announcement":"","hero_headline":"","hero_subhead":""}}',
        'You are a senior marketing manager for a premium home-textiles brand. Output only valid JSON — no markdown, no preamble.');
      var d = parseJSON(raw), html = '';
      if (d.format === 'store' && d.store) {
        var s = d.store;
        if (s.discount_code) html += block('🏷️ Discount code (create it in Promotions)', s.discount_code + (s.discount_percent ? '  —  ' + s.discount_percent + '% off' : ''));
        if (s.announcement) html += block('📢 Announcement bar (Storefront)', s.announcement);
        if (s.hero_headline) html += block('Hero headline (Hero banner)', s.hero_headline);
        if (s.hero_subhead) html += block('Hero subhead (Hero banner)', s.hero_subhead);
        if (d.image_prompt) html += imageBlock('📸 Banner image', d.image_prompt);
      } else if (d.format === 'ad' && d.ad) {
        if (d.ad.primary) html += block('📣 Ad — primary text', d.ad.primary);
        if (d.ad.headline) html += block('Headline', d.ad.headline);
        if (d.ad.description) html += block('Description', d.ad.description);
        if (d.ad.audience) html += block('Suggested audience', d.ad.audience);
        if (d.image_prompt) html += imageBlock('📸 Ad image', d.image_prompt);
      } else {
        if (d.caption) html += block('Caption — ready to post', d.caption);
        if (d.hashtags && d.hashtags.length) html += block('Hashtags', d.hashtags.map(function (h) { return '#' + String(h).replace(/^#/, ''); }).join(' '));
        var r = d.reel || {};
        if (d.format === 'video' || (r.shots && r.shots.length)) {
          var lines = [];
          if (r.hook) lines.push('HOOK: ' + r.hook);
          if (r.audio) lines.push('AUDIO: ' + r.audio);
          lines.push('');
          (r.shots || []).forEach(function (sh, i) { lines.push((sh.time || 'Shot ' + (i + 1)) + ' — ' + (sh.action || '') + (sh.onscreen ? '  [on-screen: ' + sh.onscreen + ']' : '')); });
          if (r.cta) { lines.push(''); lines.push('CTA: ' + r.cta); }
          html += block('🎬 Reel script — film this on your phone', lines.join('\n').trim());
        } else if (d.image_prompt) html += imageBlock('📸 Image', d.image_prompt);
      }
      slot.innerHTML = html || '<p class="hint">Nothing came back — click again.</p>';
    } catch (e) { slot.innerHTML = errBox('Couldn’t create that.', e); }
    btn.disabled = false;
  };

  A.actions['form:mktlog'] = async function (f) {
    var v = function (n) { return f.elements[n].value; };
    var entry = { id: u.uid('l'), date: v('date') || todayKey(), platform: v('platform'),
      reach: Math.max(0, +v('reach') || 0), clicks: Math.max(0, +v('clicks') || 0), orders: Math.max(0, +v('orders') || 0),
      revenue: Math.max(0, Math.round((+v('revenue') || 0) * 100) / 100), note: v('note').trim() };
    if (!(entry.reach || entry.clicks || entry.orders || entry.revenue || entry.note)) { u.toast('Enter at least one number or a note — empty results aren’t saved'); return; }
    var dup = (mk().log || []).some(function (l) { return l.date === entry.date && l.platform === entry.platform && l.reach === entry.reach && l.clicks === entry.clicks && l.orders === entry.orders && l.revenue === entry.revenue && (l.note || '') === entry.note; });
    if (dup) { u.toast('That exact result is already logged'); return; }
    if (await autosave(function (m) { m.log.push(A.clone(entry)); }, 'Result logged')) { var y = window.scrollY; A.render(); window.scrollTo(0, y); }
  };

  A.actions['mkt-log-delete'] = async function (el) {
    if (!confirm('Delete this result?')) return;
    if (await autosave(function (m) { m.log = m.log.filter(function (l) { return l.id !== el.dataset.id; }); }, 'Result deleted')) { var y = window.scrollY; A.render(); window.scrollTo(0, y); }
  };

  A.actions['mkt-review'] = async function (btn) {
    var box = document.getElementById('mktReview');
    var log = mk().log || [];
    if (!log.length) { box.innerHTML = '<p class="hint">Log a few days of results first.</p>'; return; }
    btn.disabled = true; box.innerHTML = '<p class="hint">✨ Reviewing your numbers…</p>';
    try {
      var rows = log.slice(-30).map(function (l) { return l.date + ' | ' + l.platform + ' | reach ' + l.reach + ' | clicks ' + l.clicks + ' | orders ' + l.orders + ' | $' + l.revenue + (l.note ? ' | ' + l.note : ''); }).join('\n');
      var d = parseJSON(await aiCall('My recent social marketing results (home-textiles shop):\n' + rows + '\n\nIn plain language: what is working, what to stop or change, and the single most important thing to do tomorrow. Be specific. Return ONLY valid JSON: {"working":"...","change":"...","tomorrow":"..."}',
        'You are a sharp, practical marketing analyst. Output only valid JSON, no markdown.'));
      out.review = '<div class="panel" style="padding:12px 14px;margin-top:12px"><p style="margin:0 0 8px"><b>✅ Working:</b> ' + esc(d.working || '') + '</p><p style="margin:0 0 8px"><b>🔧 Change:</b> ' + esc(d.change || '') + '</p><p style="margin:0"><b>⭐ Tomorrow:</b> ' + esc(d.tomorrow || '') + '</p></div>';
      box.innerHTML = out.review;
    } catch (e) { box.innerHTML = errBox('Couldn’t review.', e); }
    btn.disabled = false;
  };

  A.actions['mkt-gen'] = async function (btn) {
    var box = document.getElementById('mktOut');
    var p = A.draft.products.find(function (x) { return x.id === (document.getElementById('mkt_prod') || {}).value; }) || A.draft.products[0];
    var kind = btn.dataset.kind, m = mk();
    var voice = m.voice || 'a premium, warm, understated home-textiles brand that celebrates natural fibers and craftsmanship';
    var price = p ? (p.price != null ? p.price : p.basePrice) : '';
    var ctx = p ? 'Product: ' + p.name + '\nApprox price: $' + price + '\nDescription: ' + HW.htmlToText(p.description).slice(0, 500) + '\nMaterial: ' + (p.material || 'n/a') : '';
    var prompt;
    if (kind === 'post') prompt = 'Brand: ' + A.draft.brand.name + '\nBrand voice: ' + voice + '\n' + ctx + '\n\nWrite social posts to sell this product. Return ONLY valid JSON: {"instagram":{"caption":"engaging caption, 1-2 emojis, a clear CTA","hashtags":["8-12 tags without #"]},"pinterest":{"title":"keyword-rich title under 100 chars","description":"SEO-friendly description around 200 chars","hashtags":["5-8 tags without #"]},"image_idea":"one-line styling concept"}';
    else if (kind === 'plan') prompt = 'Brand: ' + A.draft.brand.name + '\nBrand voice: ' + voice + '\nCatalog: ' + catalogSummary(8) + '\n\nCreate a 7-day social content plan mixing Instagram and Pinterest. Return ONLY valid JSON: {"week":[{"day":"Monday","platform":"Instagram","idea":"short concept","caption":"ready-to-post caption"}]}';
    else if (kind === 'image') prompt = 'Brand: ' + A.draft.brand.name + '\nBrand voice: ' + voice + '\n' + ctx + '\n\nWrite 3 detailed photorealistic image-generator prompts for marketing images of this product: (1) clean hero/studio shot, (2) styled in-room lifestyle scene, (3) close-up texture detail. Specify composition, lighting, setting, colors and mood; no text in the images. Return ONLY valid JSON: {"prompts":[{"label":"Hero shot","prompt":"..."},{"label":"Lifestyle scene","prompt":"..."},{"label":"Texture detail","prompt":"..."}]}';
    else prompt = 'Brand: ' + A.draft.brand.name + '\nBrand voice: ' + voice + '\nCatalog: ' + catalogSummary(10) + '\n\nPropose 3 distinct marketing campaign ideas for this home-textiles store. Return ONLY valid JSON: {"campaigns":[{"name":"...","hook":"one-line hook","angle":"why it works in 1-2 sentences","channels":["Instagram","Pinterest","Email"]}]}';
    btn.disabled = true; box.innerHTML = '<p class="hint">✨ Generating… this takes a few seconds.</p>';
    try {
      var d = parseJSON(await aiCall(prompt, 'You are a senior e-commerce social media strategist for premium home brands. Output only valid JSON — no markdown fences, no preamble.'));
      var html;
      if (kind === 'post') {
        var ig = d.instagram || {}, pin = d.pinterest || {};
        html = '<h3 class="mkth">📷 Instagram</h3>' + block('Caption', ig.caption) + block('Hashtags', (ig.hashtags || []).map(function (h) { return '#' + String(h).replace(/^#/, ''); }).join(' ')) +
          '<h3 class="mkth">📌 Pinterest</h3>' + block('Pin title', pin.title) + block('Description', pin.description) + block('Hashtags', (pin.hashtags || []).map(function (h) { return '#' + String(h).replace(/^#/, ''); }).join(' ')) +
          (d.image_idea ? '<p class="hint">📸 Photo idea: ' + esc(d.image_idea) + '</p>' : '');
      } else if (kind === 'plan') {
        html = (d.week || []).map(function (x) { return '<div class="panel" style="padding:12px 14px;margin:0 0 10px"><b>' + esc(x.day || '') + ' · ' + esc(x.platform || '') + '</b><p class="hint" style="margin:4px 0">' + esc(x.idea || '') + '</p>' + block('Caption', x.caption) + '</div>'; }).join('') || '<p class="hint">No plan returned — try again.</p>';
      } else if (kind === 'image') {
        html = (d.prompts || []).map(function (x) { return imageBlock('📸 ' + (x.label || 'Image prompt'), x.prompt); }).join('') || '<p class="hint">No prompts returned — try again.</p>';
      } else {
        html = (d.campaigns || []).map(function (c) { return '<div class="panel" style="padding:12px 14px;margin:0 0 10px"><b>' + esc(c.name || '') + '</b><p style="margin:4px 0"><i>' + esc(c.hook || '') + '</i></p><p class="hint" style="margin:4px 0">' + esc(c.angle || '') + '</p><p class="hint">Channels: ' + esc((c.channels || []).join(', ')) + '</p></div>'; }).join('') || '<p class="hint">No ideas returned — try again.</p>';
      }
      box.innerHTML = html; out.content = html;
    } catch (e) { box.innerHTML = errBox('Couldn’t generate that.', e); }
    btn.disabled = false;
  };

  A.actions['mkt-image'] = async function (btn) {
    var ta = document.getElementById(btn.dataset.target), slot = document.getElementById(btn.dataset.target + '_img');
    var prompt = ta.value.trim();
    if (!prompt) { slot.innerHTML = '<p class="hint">Add a prompt first.</p>'; return; }
    var ep = imageEndpoint();
    if (!ep || endpointProblem(ep)) { slot.innerHTML = errBox('No image worker set.', 'Set up the AI worker (with an OPENAI_API_KEY) first.'); return; }
    btn.disabled = true; slot.innerHTML = '<p class="hint">🎨 Generating image… this can take 10–40 seconds.</p>';
    try {
      var res = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: await authHeader() }, body: JSON.stringify({ prompt: prompt, size: '1024x1024' }) });
      var data = {}; try { data = await res.json(); } catch (e) {}
      var src = data.image || data.url;
      if (!res.ok || !src) throw new Error(data.error || ('Request failed (' + res.status + ')'));
      slot.innerHTML = '<img src="' + esc(src) + '" alt="Generated image" class="genimg"><div class="btnrow" style="margin-top:8px">' +
        '<a class="btn ghost sm" href="' + esc(src) + '" download="home-weavers-image.png" data-native>Download</a>' +
        '<button class="btn ghost sm" type="button" data-a="mkt-image-save" data-src="' + esc(src) + '">Save to Storage</button></div><p class="hint" id="' + btn.dataset.target + '_saved"></p>';
    } catch (e) { slot.innerHTML = errBox('Couldn’t generate image.', e); }
    btn.disabled = false;
  };

  A.actions['mkt-image-save'] = async function (btn) {
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      var blob = await (await fetch(btn.dataset.src)).blob();
      var url = await A.media.upload(blob, 'marketing', { name: 'ai-image', max: 1600 });
      var note = btn.parentElement.nextElementSibling;
      note.innerHTML = 'Saved. Image link (paste into a product or banner): <input class="copyurl" readonly value="' + esc(url) + '" aria-label="Uploaded image link">';
      btn.textContent = 'Saved';
    } catch (e) { u.toast('Save failed: ' + e.message); btn.disabled = false; btn.textContent = 'Save to Storage'; }
  };
})(window.HW = window.HW || {});
