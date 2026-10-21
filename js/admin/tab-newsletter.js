/* Home Weavers — admin: writing and sending the newsletter.

   A marketing email in the United States has to carry a real postal address and a
   way out that works without signing in. Both are added by the server to every
   message, so they cannot be forgotten here. */
(function (HW) {
  'use strict';

  var A = HW.A, u = HW.u, esc = u.esc;
  var st = { count: null, subject: '', title: '', body: '', test: '', sending: false, last: null };

  async function loadCount() {
    var r = await A.sb.from('subscribers').select('id', { count: 'exact', head: true });
    st.count = r.error ? 0 : (r.count || 0);
  }

  /* Written as plain paragraphs. Anything fancier belongs in a design tool, and a
     newsletter that is mostly words lands in more inboxes than one that is mostly
     pictures. */
  function toHtml(text) {
    return String(text || '').split(/\n{2,}/).map(function (para) {
      return '<p style="font-size:15px;line-height:1.65;margin:0 0 12px">' +
        esc(para.trim()).replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }

  A.tabs.newsletter = {
    render: function () {
      var contact = A.draft.contact || {};
      var address = String(contact.address || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean).join(', ');
      var n = st.count;

      return '<h1>Newsletter</h1>' +
        '<p class="sub">An email to everyone who asked for news and offers. Every message carries your postal address and an unsubscribe link — both are required by law, and the server adds them, so they can’t be left off.</p>' +

        (st.last ? '<div class="adwarn"><b>' + (st.last.test ? 'Test sent.' : 'Sent to ' + st.last.sent + (st.last.sent === 1 ? ' subscriber.' : ' subscribers.')) + '</b>' +
          (st.last.failed ? ' ' + st.last.failed + ' didn’t go through — check the Edge Function logs.' : '') + '</div>' : '') +

        '<section class="panel">' +
        '<h2 class="ph3">Who it goes to</h2>' +
        '<p style="margin:0 0 4px">' + (n == null ? 'Counting…' : '<b>' + n + '</b> ' + (n === 1 ? 'person has' : 'people have') + ' signed up.') + '</p>' +
        '<p class="hint" style="margin:0">Anyone who unsubscribes is removed from this list straight away.</p>' +
        '</section>' +

        '<section class="panel"><h2 class="ph3">Write it</h2>' +
        '<div class="fld"><label for="nlSubject">Subject line</label>' +
        '<input id="nlSubject" type="text" maxlength="200" placeholder="What they see in the inbox" value="' + esc(st.subject) + '">' +
        '<p class="hint">Keep it short and say what is actually inside.</p></div>' +
        '<div class="fld"><label for="nlTitle">Heading</label>' +
        '<input id="nlTitle" type="text" maxlength="200" placeholder="Shown at the top of the email — defaults to the subject" value="' + esc(st.title) + '">' +
        '</div>' +
        '<div class="fld"><label for="nlBody">Message</label>' +
        '<textarea id="nlBody" rows="12" placeholder="Write it as you would a letter. Leave a blank line between paragraphs.">' + esc(st.body) + '</textarea>' +
        '<p class="hint">Plain paragraphs. A blank line starts a new one.</p></div>' +
        '</section>' +

        '<section class="panel"><h2 class="ph3">Check it first</h2>' +
        '<p style="margin:0 0 10px">Send one to yourself and read it on a phone before it goes to everybody.</p>' +
        '<div class="toolbar"><input id="nlTest" type="email" placeholder="your@email.com" value="' + esc(st.test || (A.user && A.user.email) || '') + '" style="min-width:240px">' +
        '<button class="btn sm" type="button" data-a="nl-test"' + (st.sending ? ' disabled' : '') + '>Send test</button></div>' +
        '</section>' +

        '<section class="panel"><h2 class="ph3">Send it</h2>' +
        '<p style="margin:0 0 10px">This goes to everyone on the list and cannot be taken back.</p>' +
        '<button class="btn loom" type="button" data-a="nl-send"' + (st.sending || !n ? ' disabled' : '') + '>' +
        (st.sending ? 'Sending…' : 'Send to ' + (n || 0) + ' ' + (n === 1 ? 'subscriber' : 'subscribers')) + '</button>' +
        '<p class="hint" style="margin:10px 0 0">Footer on every copy: ' + esc(address || '(set your address in Storefront → Contact)') + ' · Unsubscribe</p>' +
        '</section>';
    },
    after: function () {
      if (st.count == null) loadCount().then(function () { if (A.tab === 'newsletter') A.render(); });
      var body = document.getElementById('nlBody');
      if (body) body.addEventListener('input', function () { st.body = body.value; });
      var subj = document.getElementById('nlSubject');
      if (subj) subj.addEventListener('input', function () { st.subject = subj.value; });
      var ttl = document.getElementById('nlTitle');
      if (ttl) ttl.addEventListener('input', function () { st.title = ttl.value; });
      var test = document.getElementById('nlTest');
      if (test) test.addEventListener('input', function () { st.test = test.value; });
    },
  };


  async function send(testTo) {
    if (!st.body.trim()) { u.toast('Write something first.'); return; }
    if (!st.subject.trim()) { u.toast('Give it a subject line.'); return; }
    st.sending = true; A.render();
    try {
      var out = await A.workerCall('/newsletter/send', {
        subject: st.subject,
        title: st.title,
        html: toHtml(st.body),
        test: testTo || '',
      });
      st.last = out;
      u.toast(testTo ? 'Test sent' : 'Sent to ' + out.sent);
    } catch (e) {
      u.toast('Couldn’t send: ' + e.message);
    } finally {
      st.sending = false;
      A.render();
    }
  }

  A.actions['nl-test'] = function () {
    var el = document.getElementById('nlTest');
    send((el && el.value.trim()) || (A.user && A.user.email) || '');
  };

  A.actions['nl-send'] = function () {
    var n = st.count || 0;
    if (!confirm('Send this to ' + n + ' ' + (n === 1 ? 'subscriber' : 'subscribers') + '?\n\nIt cannot be taken back.')) return;
    send('');
  };
})(window.HW = window.HW || {});
