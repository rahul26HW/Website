/* Home Weavers — admin: Orders and Messages. */
(function (HW) {
  'use strict';

  var A = HW.A, u = HW.u, esc = u.esc;
  var STATUSES = [['new', 'New'], ['accepted', 'Accepted'], ['packed', 'Packed'], ['shipped', 'Shipped'], ['delivered', 'Delivered'], ['refunded', 'Refunded'], ['cancelled', 'Cancelled']];
  var PAYMENTS = [['unpaid', 'Unpaid'], ['authorized', 'Card held'], ['paid', 'Paid'], ['refunded', 'Refunded'], ['voided', 'Hold released'], ['failed', 'Charge failed']];
  var os = { filter: 'all', q: '', open: null, list: null };
  var ms = { list: null, open: null };

  function statusTag(s) {
    var cls = { new: 'clay', accepted: '', packed: '', shipped: 'green', delivered: 'green', refunded: '', cancelled: '' }[s] || '';
    var label = (STATUSES.find(function (x) { return x[0] === s; }) || [s, s])[1];
    return A.ui.tag(label, cls);
  }
  function payTag(s) { return A.ui.tag((PAYMENTS.find(function (x) { return x[0] === s; }) || [s, s])[1], s === 'paid' ? 'green' : (/^(unpaid|failed)$/.test(s) ? 'clay' : '')); }

  /* ================================================================ *
   * Orders
   * ================================================================ */
  async function loadOrders() {
    var r = await A.sb.from('orders').select('*, order_items(*)').order('created_at', { ascending: false }).limit(1000);
    if (r.error) { os.error = r.error.message; os.list = []; return; }
    os.error = null; os.list = r.data || [];
    A.newOrders = os.list.filter(function (o) { return o.status === 'new'; }).length;
  }

  function orderList() {
    var asked = (os.list || []).filter(function (o) { return o.cancel_requested_at && !/^(cancelled|refunded|shipped|delivered)$/.test(o.status); });
    if (!os.list) return '<h1>Orders</h1><p class="hint">Loading orders…</p>';
    var q = os.q.toLowerCase();
    var shown = os.list.filter(function (o) {
      if (os.filter !== 'all' && o.status !== os.filter) return false;
      if (q && (o.order_number + ' ' + o.email + ' ' + o.name + ' ' + (o.tracking_number || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var counts = { all: os.list.length };
    STATUSES.forEach(function (s) { counts[s[0]] = os.list.filter(function (o) { return o.status === s[0]; }).length; });
    return '<h1 class="h1row">Orders <span class="btnrow"><button class="btn ghost sm" type="button" data-a="orders-refresh">↻ Refresh</button><button class="btn ghost sm" type="button" data-a="orders-csv">⬇ Export CSV</button></span></h1>' +
      '<p class="sub">Orders from checkout' + (A.draft.snipcart.enabled ? ' and Snipcart' : '') + '. Newest first.' + ((A.draft.payments || {}).stripe ? ' “Unpaid” orders haven’t finished Stripe payment — don’t ship them.' : '') + '</p>' +
      (os.error ? '<p class="badmsg">Couldn’t load orders: ' + esc(os.error) + '</p>' : '') +
      (asked.length ? '<div class="adwarn"><b>' + asked.length + ' cancellation request' + (asked.length > 1 ? 's' : '') + ':</b> ' +
        asked.map(function (o) { return esc(o.order_number); }).join(', ') + ' — open the order to see why.</div>' : '') +
      '<section class="panel"><div class="toolbar"><div class="subnav">' +
      [['all', 'All']].concat(STATUSES).map(function (s) {
        return '<button type="button" class="chip' + (os.filter === s[0] ? ' active' : '') + '" data-a="orders-filter" data-f="' + s[0] + '" aria-pressed="' + (os.filter === s[0]) + '">' + s[1] + ' (' + counts[s[0]] + ')</button>';
      }).join('') + '</div><span class="spacer"></span><label class="sr-only" for="oSearch">Search orders</label><input id="oSearch" type="search" placeholder="Order #, email, name" value="' + esc(os.q) + '"></div>' +
      '<div class="tablewrap"><table class="adt"><thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th></tr></thead><tbody>' +
      (shown.length ? shown.map(function (o) {
        var n = (o.order_items || []).reduce(function (s, i) { return s + i.qty; }, 0);
        return '<tr class="clickrow"><td><button class="txtbtn" type="button" data-a="order-open" data-id="' + o.id + '"><b>' + esc(o.order_number) + '</b></button></td>' +
          '<td class="hint">' + esc(new Date(o.created_at).toLocaleString()) + '</td><td>' + esc(o.name) + '<div class="hint">' + esc(o.email) + '</div></td>' +
          '<td>' + n + '</td><td>' + u.money(o.total) + '</td><td>' + payTag(o.payment_status) + '</td><td>' + statusTag(o.status) + '</td></tr>';
      }).join('') : '<tr><td colspan="7" class="muted" style="padding:16px">' + (os.list.length ? 'No orders match.' : 'No orders yet.') + '</td></tr>') +
      '</tbody></table></div></section>';
  }

  function orderDetail(o) {
    var ui = A.ui, a = o.shipping_address || {};
    var draft = A.edit;
    var mail = 'mailto:' + encodeURIComponent(o.email) + '?subject=' + encodeURIComponent('Your ' + (A.draft.brand.name || 'Home Weavers') + ' order ' + o.order_number) +
      '&body=' + encodeURIComponent('Hi ' + (o.name || '').split(' ')[0] + ',\n\nThank you for your order ' + o.order_number + ' (' + u.money(o.total) + ').\n\n' +
        (o.tracking_number ? 'It has shipped' + (o.carrier ? ' with ' + o.carrier : '') + '. Tracking number: ' + o.tracking_number + '\n\n' : '') + 'Best,\n' + (A.draft.brand.name || 'Home Weavers'));
    return '<p><button class="txtbtn" type="button" data-a="order-back">← All orders</button></p>' +
      '<h1 class="h1row">Order ' + esc(o.order_number) + ' <span>' + payTag(o.payment_status) + ' ' + statusTag(o.status) + '</span></h1>' +
      '<p class="sub">Placed ' + esc(new Date(o.created_at).toLocaleString()) + ' · ' + esc(o.source === 'snipcart' ? 'Snipcart' : 'Site checkout') + (o.external_id ? ' · ' + esc(o.external_id) : '') + '</p>' +
      '<div class="grid2 alignstart">' +
      ui.panel('Items', '<table class="adt"><tbody>' + (o.order_items || []).map(function (i) {
        return '<tr><td>' + (i.image ? '<img class="thumbsm" src="' + esc(HW.asset(i.image)) + '" alt="" loading="lazy">' : '') + '</td>' +
          '<td>' + esc(HW.seo.clip(i.name, 70)) + '<div class="hint">' + esc(i.variant || '') + ' · SKU <code>' + esc(i.sku || '—') + '</code></div></td>' +
          '<td style="white-space:nowrap">' + i.qty + ' × ' + u.money(i.unit_price) + '</td><td style="text-align:right">' + u.money(i.line_total) + '</td></tr>';
      }).join('') + '</tbody></table>' +
        '<div class="sumbox"><div class="sumrow"><span>Subtotal</span><span>' + u.money(o.subtotal) + '</span></div>' +
        (Number(o.discount) ? '<div class="sumrow"><span>Discount' + (o.promo_code ? ' (' + esc(o.promo_code) + ')' : '') + '</span><span>−' + u.money(o.discount) + '</span></div>' : '') +
        '<div class="sumrow"><span>Shipping</span><span>' + (Number(o.shipping) ? u.money(o.shipping) : 'Free') + '</span></div>' +
        (Number(o.tax) ? '<div class="sumrow"><span>Tax</span><span>' + u.money(o.tax) + '</span></div>' : '') +
        '<div class="sumrow total"><span>Total</span><span>' + u.money(o.total) + '</span></div></div>' +
        (!o.stock_deducted ? '<div class="btnrow"><button class="btn ghost sm" type="button" data-a="order-deduct">Deduct items from inventory</button></div><p class="hint">Do this once when you pack the order.</p>' : '<p class="hint">✓ Items were deducted from inventory.</p>')) +
      ui.panel('Customer',
        '<p style="margin:0 0 4px"><b>' + esc(o.name) + '</b></p><p style="margin:0 0 4px"><a href="mailto:' + esc(o.email) + '">' + esc(o.email) + '</a></p>' +
        (o.phone ? '<p style="margin:0 0 10px"><a href="tel:' + esc(o.phone) + '">' + esc(o.phone) + '</a></p>' : '') +
        '<p style="margin:10px 0 0;line-height:1.6">' + esc(a.line1 || '') + (a.line2 ? '<br>' + esc(a.line2) : '') + '<br>' + esc([a.city, a.state, a.zip].filter(Boolean).join(', ')) + '<br>' + esc(a.country || '') + '</p>' +
        (o.customer_note ? '<div class="adwarn" style="margin-top:12px"><b>Customer note:</b> ' + esc(o.customer_note) + '</div>' : '') +
        '<div class="btnrow" style="margin-top:12px"><a class="btn ghost sm" href="' + mail + '" data-native>Email customer</a></div>') +
      '</div>' +
      ui.panel('Payment &amp; ShipStation', paymentShipHTML(o)) +
      ui.panel('Fulfilment',
        '<div class="grid2">' + ui.field('Status', '@status', draft.status, { options: STATUSES }) + ui.field('Payment', '@payment_status', draft.payment_status, { options: PAYMENTS }) + '</div>' +
        '<div class="grid2">' + ui.field('Carrier', '@carrier', draft.carrier || '', { placeholder: 'USPS, UPS, FedEx…', type: 'trim' }) +
        ui.field('Tracking number', '@tracking_number', draft.tracking_number || '', { type: 'trim' }) + '</div>' +
        ui.field('Private note', '@admin_note', draft.admin_note || '', { textarea: true, rows: 2, hint: 'Only visible here.' }) +
        '<p class="hint">Customers see status, carrier and tracking number on Track your order.</p>' +
        '<div class="btnrow"><button class="btn loom save-btn" type="button" data-a="order-save">Save order</button></div>');
  }

  function paymentShipHTML(o) {
    var ref = o.payment_ref || '';
    var stripeLink = /^pi_/.test(ref) ? 'https://dashboard.stripe.com/' + (o.payment_livemode === false ? 'test/' : '') + 'payments/' + ref : '';
    var refLink = ref ? ' · ' + (stripeLink ? '<a href="' + esc(stripeLink) + '" target="_blank" rel="noopener">View in Stripe</a>' : '<code>' + esc(ref) + '</code>') : '';
    var pay = o.payment_status === 'paid'
      ? '<p style="margin:0 0 6px">✓ Paid' + (o.paid_at ? ' ' + esc(new Date(o.paid_at).toLocaleString()) : '') + refLink + '</p>'
      : o.payment_status === 'authorized'
        ? '<p style="margin:0 0 6px">Card approved, not charged yet — it’s charged when the order is accepted' + refLink + '</p>'
      : o.payment_status === 'voided'
        ? '<p class="hint" style="margin:0 0 6px">Card hold released — the customer wasn’t charged' + refLink + '</p>'
      : o.payment_status === 'failed'
        ? '<p class="badmsg" style="margin:0 0 6px">Charging the card failed — don’t ship. Contact the customer' + refLink + '</p>'
      : o.status === 'cancelled'
        ? '<p class="hint" style="margin:0 0 6px">Cancelled: the Stripe payment page expired without payment.</p>'
        : '<p class="hint" style="margin:0 0 6px">' + (/^cs_/.test(ref) ? 'The customer opened the Stripe payment page but hasn’t paid yet.' : 'No online payment.') + '</p>';
    var ship = o.shipstation_order_id
      ? '<p style="margin:0 0 6px">✓ In ShipStation (order ' + esc(o.shipstation_order_id) + (o.shipstation_synced_at ? ', sent ' + esc(new Date(o.shipstation_synced_at).toLocaleString()) : '') + ')</p>'
      : '<p class="hint" style="margin:0 0 6px">Not in ShipStation yet.' + (/^(paid|authorized)$/.test(o.payment_status) ? '' : ' Paid orders are sent automatically.') + '</p>';
    var err = o.shipstation_error ? '<p class="badmsg" style="margin:0 0 6px">ShipStation said: ' + esc(o.shipstation_error) + '</p>' : '';
    var mins = Number((A.draft.settings || {}).cancelMinutes);
    mins = mins >= 0 && mins <= 1440 ? mins : 30;
    var until = o.paid_at ? new Date(new Date(o.paid_at).getTime() + mins * 60000) : null;
    var waiting = o.status === 'new' && /^(paid|authorized)$/.test(o.payment_status);
    var accept = waiting
      ? '<div class="adwarn" style="margin:0 0 10px">' +
        (until && until > new Date()
          ? 'The customer can still cancel this order themselves until <b>' + esc(until.toLocaleTimeString()) + '</b>. It goes to ShipStation by itself after that.'
          : 'Waiting to be accepted — it goes to ShipStation by itself within a few minutes.') + '</div>' +
        '<div class="btnrow"><button class="btn loom sm" type="button" data-a="order-accept">' + (o.payment_status === 'authorized' ? 'Accept, charge card &amp; send to ShipStation' : 'Accept order &amp; send to ShipStation') + '</button></div>'
      : '';
    var asked = o.cancel_requested_at
      ? '<div class="adwarn" style="margin:10px 0 0"><b>Customer asked to cancel</b> on ' + esc(new Date(o.cancel_requested_at).toLocaleString()) +
        (o.cancel_reason ? ': “' + esc(o.cancel_reason) + '”' : '') +
        (/^(shipped|delivered|cancelled|refunded)$/.test(o.status) ? '' : ' — if you agree, refund it in Stripe and set the status to Cancelled.') + '</div>'
      : '';
    // Once shipped (or refunded) the order is final in ShipStation; sending it again would reset it to "awaiting shipment".
    var btn = /^(shipped|delivered|refunded)$/.test(o.status) ? ''
      : o.status === 'cancelled'
      ? (o.shipstation_order_id ? '<div class="btnrow"><button class="btn ghost sm" type="button" data-a="order-shipstation">Cancel in ShipStation</button></div>' : '')
      : '<div class="btnrow"><button class="btn ghost sm" type="button" data-a="order-shipstation">' + (o.shipstation_order_id ? 'Send to ShipStation again' : 'Send to ShipStation') + '</button>' +
        (o.shipstation_order_id && /^(new|accepted|packed)$/.test(o.status) ? '<button class="btn ghost sm" type="button" data-a="order-sync">Get tracking from ShipStation</button>' : '') + '</div>';
    // ShipStation sends a ship date without a time (stored as midnight UTC), so show just the date then.
    var sd = o.shipped_at ? new Date(o.shipped_at) : null;
    var shippedText = sd ? (/T00:00:00(\.0+)?(Z|\+00:00)$/.test(o.shipped_at) ? sd.toLocaleDateString(undefined, { timeZone: 'UTC' }) : sd.toLocaleString()) : '';
    return accept + pay + ship + err + btn + (sd ? '<p class="hint">Shipped ' + esc(shippedText) + '</p>' : '') + asked;
  }

  A.tabs.orders = {
    render: function () {
      if (os.open && A.editKey !== 'order:' + os.open) os.open = null;
      if (os.open) { var o = (os.list || []).find(function (x) { return x.id === os.open; }); if (o) return orderDetail(o); closeOrder(); }
      return orderList();
    },
    after: function () {
      if (!os.list) { loadOrders().then(function () { if (A.tab === 'orders') A.render(); }); return; }
      var s = document.getElementById('oSearch');
      if (s) s.addEventListener('input', u.debounce(function () { os.q = s.value; var pos = s.selectionStart; A.render(); var n = document.getElementById('oSearch'); n.focus(); n.setSelectionRange(pos, pos); }, 250));
    }
  };

  function closeOrder() { os.open = null; A.edit = null; A.editKey = null; A.editDirty = null; A.commitEdit = null; }

  A.actions['orders-refresh'] = async function () { await loadOrders(); A.render(); u.toast('Orders refreshed'); };
  A.actions['orders-filter'] = function (el) { os.filter = el.dataset.f; A.render(); };
  A.actions['order-open'] = function (el) {
    var o = os.list.find(function (x) { return x.id === el.dataset.id; });
    os.open = o.id;
    A.edit = { status: o.status, payment_status: o.payment_status, carrier: o.carrier || '', tracking_number: o.tracking_number || '', admin_note: o.admin_note || '' };
    A.editKey = 'order:' + o.id;
    // Order edits save with their own "Save order" button, so they don't count toward the store's unsaved bar.
    os.start = JSON.stringify(A.edit);
    A.editDirty = null; A.commitEdit = null;
    A.render(); window.scrollTo(0, 0);
  };
  A.actions['order-back'] = function () {
    if (A.edit && JSON.stringify(A.edit) !== os.start && !confirm('Discard changes to this order?')) return;
    closeOrder(); A.render();
  };
  A.actions['order-save'] = async function () {
    var o = os.list.find(function (x) { return x.id === os.open; });
    var patch = A.clone(A.edit);
    if (patch.status === 'shipped' && !patch.tracking_number && !confirm('Mark as shipped without a tracking number?')) return;
    var r = await A.sb.from('orders').update(patch).eq('id', o.id).select('*, order_items(*)');
    if (r.error || !r.data || !r.data.length) { u.toast('Save failed: ' + (r.error ? r.error.message : 'not allowed')); return; }
    Object.assign(o, r.data[0]);
    A.actions['order-open']({ dataset: { id: o.id } });
    A.newOrders = os.list.filter(function (x) { return x.status === 'new'; }).length;
    u.toast('Order ' + o.order_number + ' saved');
  };
  A.actions['order-shipstation'] = async function (btn) {
    var o = os.list.find(function (x) { return x.id === os.open; });
    if (o.status === 'cancelled') { if (!confirm('Mark this order as cancelled in ShipStation?')) return; }
    else if (o.payment_status !== 'paid' && !confirm('This order isn’t paid. Send it to ShipStation as “awaiting payment”?')) return;
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      await A.workerCall('/shipstation/push', { order_id: o.id });
      u.toast('Sent to ShipStation');
    } catch (e) { u.toast('ShipStation: ' + e.message); }
    var r = await A.sb.from('orders').select('*, order_items(*)').eq('id', o.id);
    if (!r.error && r.data && r.data[0]) Object.assign(o, r.data[0]);
    A.render();
  };
  A.actions['order-accept'] = async function (btn) {
    var o = os.list.find(function (x) { return x.id === os.open; });
    if (!confirm('Accept order ' + o.order_number + ' and send it to ShipStation now? The customer can no longer cancel it themselves.')) return;
    btn.disabled = true; btn.textContent = 'Accepting…';
    try {
      var r = await A.workerCall('/orders/accept', { order_id: o.id });
      u.toast(/^error/.test(String(r.shipstation)) ? 'Accepted, but ShipStation said: ' + r.shipstation : 'Accepted and sent to ShipStation');
    } catch (e) { u.toast(e.message); }
    var res = await A.sb.from('orders').select('*, order_items(*)').eq('id', o.id);
    if (!res.error && res.data && res.data[0]) Object.assign(o, res.data[0]);
    A.actions['order-open']({ dataset: { id: o.id } });
  };
  A.actions['order-sync'] = async function (btn) {
    var o = os.list.find(function (x) { return x.id === os.open; });
    btn.disabled = true; btn.textContent = 'Checking…';
    try {
      var r = await A.workerCall('/shipstation/sync', { order_id: o.id });
      u.toast(r.shipped ? 'Shipped — ' + (r.carrier ? r.carrier + ' ' : '') + r.tracking_number : 'Not shipped in ShipStation yet');
    } catch (e) { u.toast('ShipStation: ' + e.message); }
    var res = await A.sb.from('orders').select('*, order_items(*)').eq('id', o.id);
    if (!res.error && res.data && res.data[0]) Object.assign(o, res.data[0]);
    A.actions['order-open']({ dataset: { id: o.id } });
  };
  A.actions['order-deduct'] = async function () {
    var o = os.list.find(function (x) { return x.id === os.open; });
    if (A.dirtyStore() && !confirm('You have unsaved store changes. They will be saved together with the new stock. Continue?')) return;
    var lines = (o.order_items || []).filter(function (i) { return i.sku; });
    var untracked = lines.filter(function (i) { return A.draft.inventory[i.sku] == null; }).map(function (i) { return i.sku; });
    if (!confirm('Subtract these items from inventory?\n\n' + lines.map(function (i) { return i.sku + ': −' + i.qty; }).join('\n') + (untracked.length ? '\n\nNot tracked (skipped): ' + untracked.join(', ') : ''))) return;
    lines.forEach(function (i) { if (A.draft.inventory[i.sku] != null) A.draft.inventory[i.sku] = Math.max(0, (parseInt(A.draft.inventory[i.sku], 10) || 0) - i.qty); });
    if (!(await A.saveStore('Inventory updated'))) return;
    var r = await A.sb.from('orders').update({ stock_deducted: true }).eq('id', o.id).select('id');
    if (r.error || !r.data.length) { u.toast('Stock was updated, but the order couldn’t be marked. Don’t deduct again.'); return; }
    o.stock_deducted = true; A.render();
  };
  A.actions['orders-csv'] = function () {
    var data = [['order_number', 'created_at', 'status', 'payment_status', 'source', 'name', 'email', 'phone', 'address_line1', 'address_line2', 'city', 'state', 'zip', 'country',
      'sku', 'item', 'variant', 'qty', 'unit_price', 'line_total', 'subtotal', 'discount', 'promo_code', 'shipping', 'tax', 'total', 'carrier', 'tracking_number', 'customer_note', 'paid_at', 'accepted_at', 'cancelled_at', 'cancel_requested_at', 'cancel_reason', 'payment_ref', 'shipstation_order_id']];
    (os.list || []).forEach(function (o) {
      var a = o.shipping_address || {};
      (o.order_items && o.order_items.length ? o.order_items : [{}]).forEach(function (i) {
        data.push([o.order_number, o.created_at, o.status, o.payment_status, o.source, o.name, o.email, o.phone, a.line1, a.line2, a.city, a.state, a.zip, a.country,
          i.sku, i.name, i.variant, i.qty, i.unit_price, i.line_total, o.subtotal, o.discount, o.promo_code, o.shipping, o.tax, o.total, o.carrier, o.tracking_number, o.customer_note, o.paid_at, o.accepted_at, o.cancelled_at, o.cancel_requested_at, o.cancel_reason, o.payment_ref, o.shipstation_order_id]);
      });
    });
    A.download('home-weavers-orders-' + A.today() + '.csv', A.toCsv(data), 'text/csv');
  };

  /* ================================================================ *
   * Messages
   * ================================================================ */
  async function loadMessages() {
    var r = await A.sb.from('contact_messages').select('*').order('created_at', { ascending: false }).limit(1000);
    ms.error = r.error ? r.error.message : null;
    ms.list = r.error ? [] : r.data;
    A.unread = ms.list.filter(function (x) { return !x.is_read; }).length;
  }

  A.tabs.messages = {
    render: function () {
      if (!ms.list) return '<h1>Messages</h1><p class="hint">Loading messages…</p>';
      var unread = ms.list.filter(function (x) { return !x.is_read; }).length;
      return '<h1 class="h1row">Messages <span class="btnrow"><button class="btn ghost sm" type="button" data-a="msgs-refresh">↻ Refresh</button><button class="btn ghost sm" type="button" data-a="msgs-csv">⬇ Export CSV</button></span></h1>' +
        '<p class="sub">Contact form submissions. ' + unread + ' unread.</p>' +
        (ms.error ? '<p class="badmsg">Couldn’t load messages: ' + esc(ms.error) + '</p>' : '') +
        (ms.list.length ? ms.list.map(function (x) {
          var open = ms.open === x.id;
          var reply = 'mailto:' + encodeURIComponent(x.email) + '?subject=' + encodeURIComponent('Re: ' + (x.subject || 'Your message to ' + (A.draft.brand.name || 'Home Weavers'))) +
            '&body=' + encodeURIComponent('\n\n---\nOn ' + new Date(x.created_at).toLocaleString() + ', ' + x.name + ' wrote:\n' + x.message);
          return '<section class="panel msg' + (x.is_read ? '' : ' unread') + '">' +
            '<button class="msghead" type="button" data-a="msg-open" data-id="' + x.id + '" aria-expanded="' + open + '">' +
            '<span>' + (x.is_read ? '' : '<span class="dot" aria-label="Unread"></span>') + '<b>' + esc(x.name) + '</b> <span class="hint">&lt;' + esc(x.email) + '&gt;</span></span>' +
            '<span class="hint">' + esc(x.subject || '(no subject)') + ' · ' + esc(new Date(x.created_at).toLocaleString()) + '</span></button>' +
            (open ? '<div class="msgbody"><p style="white-space:pre-wrap;margin:12px 0">' + esc(x.message) + '</p>' +
              (x.phone ? '<p class="hint">Phone: <a href="tel:' + esc(x.phone) + '">' + esc(x.phone) + '</a></p>' : '') +
              '<div class="btnrow"><a class="btn loom sm" href="' + reply + '" data-native>Reply by email</a>' +
              '<button class="btn ghost sm" type="button" data-a="msg-unread" data-id="' + x.id + '">Mark unread</button>' +
              '<button class="btn ghost sm dangerbtn" type="button" data-a="msg-delete" data-id="' + x.id + '">Delete</button></div></div>' : '') +
            '</section>';
        }).join('') : '<section class="panel"><p class="muted" style="margin:0">No messages yet.</p></section>');
    },
    after: function () { if (!ms.list) loadMessages().then(function () { if (A.tab === 'messages') A.render(); }); }
  };

  async function setRead(id, read) {
    var r = await A.sb.from('contact_messages').update({ is_read: read }).eq('id', id).select('id');
    if (r.error || !r.data.length) { u.toast('Update failed: ' + (r.error ? r.error.message : 'not allowed')); return false; }
    var x = ms.list.find(function (m) { return m.id === id; }); if (x) x.is_read = read;
    A.unread = ms.list.filter(function (m) { return !m.is_read; }).length;
    return true;
  }
  A.actions['msgs-refresh'] = async function () { await loadMessages(); A.render(); u.toast('Messages refreshed'); };
  A.actions['msg-open'] = async function (el) {
    var id = el.dataset.id;
    ms.open = ms.open === id ? null : id;
    var x = ms.list.find(function (m) { return m.id === id; });
    if (ms.open && x && !x.is_read) await setRead(id, true);
    A.render();
  };
  A.actions['msg-unread'] = async function (el) { if (await setRead(el.dataset.id, false)) { ms.open = null; A.render(); } };
  A.actions['msg-delete'] = async function (el) {
    if (!confirm('Delete this message? This can’t be undone.')) return;
    var r = await A.sb.from('contact_messages').delete().eq('id', el.dataset.id).select('id');
    if (r.error || !r.data.length) { u.toast('Delete failed: ' + (r.error ? r.error.message : 'not allowed')); return; }
    ms.list = ms.list.filter(function (m) { return m.id !== el.dataset.id; });
    A.unread = ms.list.filter(function (m) { return !m.is_read; }).length;
    A.render(); u.toast('Message deleted');
  };
  A.actions['msgs-csv'] = function () {
    var data = [['created_at', 'name', 'email', 'phone', 'subject', 'message', 'read']];
    (ms.list || []).forEach(function (x) { data.push([x.created_at, x.name, x.email, x.phone, x.subject, x.message, x.is_read ? 'yes' : 'no']); });
    A.download('home-weavers-messages-' + A.today() + '.csv', A.toCsv(data), 'text/csv');
  };
})(window.HW = window.HW || {});
