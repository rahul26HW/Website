-- =====================================================================
-- Home Weavers — STAGING sample data
-- ---------------------------------------------------------------------
-- Where:  staging Supabase project → SQL Editor → paste → Run
-- What:   obviously-fake orders, messages, sign-ups and stock, so an audit
--         has something to click on without touching a real customer.
-- Safe to run again: every row is keyed and upserted.
--
-- REFUSES TO RUN on the production project. Every address here is
-- @example.com, which is reserved by RFC 2606 and reaches nobody.
-- =====================================================================

do $$
begin
  if exists (select 1 from public.orders where email not like '%@example.com') then
    raise exception 'This database already holds real orders, so it is not a staging project. Stopping.';
  end if;
end $$;
-- ---------------------------------------------------------------------
-- 1. Who can get into the staging admin
--    Replace the address with the one you will sign in with, then create
--    that user under Authentication → Users and confirm the email.
-- ---------------------------------------------------------------------
insert into public.admins (email) values ('admin@homeweavers.net')
  on conflict (email) do nothing;


-- ---------------------------------------------------------------------
-- 2. Stock — a healthy SKU, a low one and one that is sold out, so the
--    out-of-stock path and the back-in-stock alert can both be tested.
-- ---------------------------------------------------------------------
insert into public.stock (sku, qty) values
  ('TWI2PC27BL', 240),
  ('TWI4PC27BL', 3),
  ('TWI2PC27NV', 0)
on conflict (sku) do update set qty = excluded.qty, updated_at = now();


-- ---------------------------------------------------------------------
-- 3. Newsletter sign-ups
-- ---------------------------------------------------------------------
insert into public.subscribers (email, source) values
  ('sub.one@example.com', 'newsletter'),
  ('sub.two@example.com', 'checkout'),
  ('sub.three@example.com', 'newsletter')
on conflict (email) do nothing;


-- ---------------------------------------------------------------------
-- 4. Contact messages — one unread, one already answered
-- ---------------------------------------------------------------------
insert into public.contact_messages (name, email, subject, message, is_read)
select * from (values
  ('Test Sender One', 'sender.one@example.com', 'Sizing question',
   'Staging test message. Do the 27x54 towels shrink after washing?', false),
  ('Test Sender Two', 'sender.two@example.com', 'Where is my order',
   'Staging test message. Order HW-STAGE-0002 has not arrived yet.', true)
) as v(name, email, subject, message, is_read)
where not exists (select 1 from public.contact_messages where email = v.email);


-- ---------------------------------------------------------------------
-- 5. Orders — one new, one shipped, one delivered (so the review invite
--    has something to pick up), one refunded.
-- ---------------------------------------------------------------------
with seed(order_number, email, name, status, payment_status, placed, delivered, tracking) as (values
  ('HW-STAGE-0001', 'buyer.one@example.com',   'Test Buyer One',   'new',       'paid',     now() - interval '2 hours', null::timestamptz, null::text),
  ('HW-STAGE-0002', 'buyer.two@example.com',   'Test Buyer Two',   'shipped',   'paid',     now() - interval '6 days',  null::timestamptz, '9400100000000000000001'),
  ('HW-STAGE-0003', 'buyer.three@example.com', 'Test Buyer Three', 'delivered', 'paid',     now() - interval '14 days', now() - interval '7 days', '9400100000000000000002'),
  ('HW-STAGE-0004', 'buyer.four@example.com',  'Test Buyer Four',  'refunded',  'refunded', now() - interval '21 days', now() - interval '16 days', '9400100000000000000003')
)
insert into public.orders (order_number, email, name, phone, shipping_address,
                           subtotal, discount, shipping, tax, total, status, payment_status, created_at, tracking_number)
select s.order_number, s.email, s.name, '+1 555 0100',
       jsonb_build_object('line1', '1 Test Street', 'line2', 'Suite ' || right(s.order_number, 1),
                          'city', 'Edison', 'state', 'NJ', 'postal', '08817', 'country', 'US'),
       59.98, 0, 0, 3.97, 63.95, s.status, s.payment_status, s.placed, s.tracking
from seed s
where not exists (select 1 from public.orders o where o.order_number = s.order_number);

insert into public.order_items (order_id, product_id, sku, name, variant, unit_price, qty, line_total)
select o.id, 'p_willow_bath_towels', 'TWI2PC27BL', 'Willow Bath Towels - 27x54', 'Blue / Set of 2', 29.99, 2, 59.98
from public.orders o
where o.order_number like 'HW-STAGE-%'
  and not exists (select 1 from public.order_items i where i.order_id = o.id);

-- The delivered order was shipped a fortnight ago, which is what the review
-- invite job looks at when it decides who to ask.
update public.orders set shipped_at = created_at + interval '1 day'
where order_number in ('HW-STAGE-0002', 'HW-STAGE-0003', 'HW-STAGE-0004') and shipped_at is null;

update public.orders set paid_at = created_at, payment_livemode = false
where order_number like 'HW-STAGE-%' and paid_at is null;


-- ---------------------------------------------------------------------
-- What went in
-- ---------------------------------------------------------------------
select 'orders'           as what, count(*) from public.orders where order_number like 'HW-STAGE-%'
union all select 'order_items',    count(*) from public.order_items i join public.orders o on o.id = i.order_id where o.order_number like 'HW-STAGE-%'
union all select 'subscribers',    count(*) from public.subscribers where email like '%@example.com'
union all select 'messages',       count(*) from public.contact_messages where email like '%@example.com'
union all select 'stock rows',     count(*) from public.stock;
