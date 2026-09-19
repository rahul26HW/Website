-- =====================================================================
-- Home Weavers — Supabase database setup
-- ---------------------------------------------------------------------
-- Where:  Supabase dashboard -> SQL Editor -> New query -> paste ALL -> Run
-- Safe to re-run: every step checks before it creates or replaces.
--
-- Security model
--   * Visitors (anon)  : read the public catalog; add newsletter sign-ups,
--                        stock alerts and contact messages; place an order
--                        and look one up by order number + email.
--   * Admins           : Supabase Auth users whose email is in public.admins.
--   * No passwords are stored here. Secret keys never touch this database.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. Helpers
-- ---------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;

-- Safe text -> numeric (returns null for '', null or junk).
create or replace function public._num(t text)
returns numeric language plpgsql immutable set search_path = '' as $$
begin
  return nullif(trim(t), '')::numeric;
exception when others then
  return null;
end $$;

-- Keeps updated_at current on every write.
create or replace function public._touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;


-- ---------------------------------------------------------------------
-- 1. Admins
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  email      text primary key check (email = lower(email) and position('@' in email) > 1),
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

-- True when the signed-in user is a confirmed Auth user listed in admins.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from auth.users u
    join public.admins a on a.email = lower(u.email)
    where u.id = auth.uid()
      and u.email_confirmed_at is not null
  );
$$;

drop policy if exists "admins read admins" on public.admins;
create policy "admins read admins" on public.admins
  for select to authenticated using ((select public.is_admin()));


-- ---------------------------------------------------------------------
-- 2. store  (PUBLIC catalog: products, categories, inventory, promos,
--            pages, hero, brand, shipping, social, snipcart public key)
-- ---------------------------------------------------------------------
create table if not exists public.store (
  id         text primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.store enable row level security;

drop trigger if exists store_touch on public.store;
create trigger store_touch before update on public.store
  for each row execute function public._touch_updated_at();

drop policy if exists "public read store"   on public.store;
drop policy if exists "admins insert store" on public.store;
drop policy if exists "admins update store" on public.store;
drop policy if exists "admins delete store" on public.store;
-- Shoppers read the store through public_store() (no promo codes, no draft products); only admins read the row.
create policy "public read store"   on public.store for select to authenticated using ((select public.is_admin()));
create policy "admins insert store" on public.store for insert to authenticated with check ((select public.is_admin()));
create policy "admins update store" on public.store for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins delete store" on public.store for delete to authenticated using ((select public.is_admin()));

insert into public.store (id, data) values ('main', '{}'::jsonb) on conflict (id) do nothing;


-- ---------------------------------------------------------------------
-- 3. store_private  (marketing goal, log, AI settings, operator notes)
-- ---------------------------------------------------------------------
create table if not exists public.store_private (
  id         text primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.store_private enable row level security;

drop trigger if exists store_private_touch on public.store_private;
create trigger store_private_touch before update on public.store_private
  for each row execute function public._touch_updated_at();

drop policy if exists "admins read private"   on public.store_private;
drop policy if exists "admins insert private" on public.store_private;
drop policy if exists "admins update private" on public.store_private;
drop policy if exists "admins delete private" on public.store_private;
create policy "admins read private"   on public.store_private for select to authenticated using ((select public.is_admin()));
create policy "admins insert private" on public.store_private for insert to authenticated with check ((select public.is_admin()));
create policy "admins update private" on public.store_private for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins delete private" on public.store_private for delete to authenticated using ((select public.is_admin()));

insert into public.store_private (id, data) values ('main', '{}'::jsonb) on conflict (id) do nothing;


-- ---------------------------------------------------------------------
-- 4. Versioned saves — no silent overwrites.
--    The admin sends back the updated_at it loaded. If the row changed
--    since then, the save fails with STALE and the admin must reload.
-- ---------------------------------------------------------------------
create or replace function public.save_store(p_data jsonb, p_expected timestamptz)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_at timestamptz;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'BAD_DATA' using errcode = '22023';
  end if;
  if pg_column_size(p_data) > 5 * 1024 * 1024 then
    raise exception 'TOO_LARGE' using errcode = '54000';
  end if;
  -- Passwords never belong in the catalog.
  p_data := p_data - 'password';

  update public.store set data = p_data
   where id = 'main' and updated_at = p_expected
  returning updated_at into v_at;

  if v_at is null then
    raise exception 'STALE' using errcode = 'PT409',
      hint = 'Someone else changed the store — reload first';
  end if;
  return v_at;
end $$;

create or replace function public.save_private(p_data jsonb, p_expected timestamptz)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_at timestamptz;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'BAD_DATA' using errcode = '22023';
  end if;
  p_data := p_data - 'password';

  update public.store_private set data = p_data
   where id = 'main' and updated_at = p_expected
  returning updated_at into v_at;

  if v_at is null then
    raise exception 'STALE' using errcode = 'PT409',
      hint = 'Someone else changed the store — reload first';
  end if;
  return v_at;
end $$;


-- ---------------------------------------------------------------------
-- 5. subscribers  (visitors insert only; admins read/delete)
-- ---------------------------------------------------------------------
create table if not exists public.subscribers (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique
             check (email = lower(email) and length(email) <= 254 and email ~ '^[A-Za-z0-9._%+''-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,24}$'),
  code       text,
  source     text not null default 'newsletter' check (length(source) <= 40),
  created_at timestamptz not null default now()
);
alter table public.subscribers enable row level security;

-- Normalises the email and stamps the current welcome code
-- (visitors cannot choose their own code).
create or replace function public._subscriber_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.email := lower(trim(new.email));
  new.code  := coalesce(
    (select nullif(s.data -> 'newsletter' ->> 'couponCode', '') from public.store s where s.id = 'main'),
    new.code);
  new.created_at := now();
  return new;
end $$;

drop trigger if exists subscribers_before_insert on public.subscribers;
create trigger subscribers_before_insert before insert on public.subscribers
  for each row execute function public._subscriber_before_insert();

drop policy if exists "visitors subscribe"         on public.subscribers;
drop policy if exists "admins read subscribers"    on public.subscribers;
drop policy if exists "admins delete subscribers"  on public.subscribers;
-- (was: public insert policy "visitors subscribe" — sign-ups now arrive through the Edge Function)
create policy "admins read subscribers"   on public.subscribers for select to authenticated using ((select public.is_admin()));
create policy "admins delete subscribers" on public.subscribers for delete to authenticated using ((select public.is_admin()));

-- Sign-up used by the site. Repeat sign-ups are ignored quietly and the
-- same answer is returned, so nobody can test whether an email is listed.
create or replace function public.subscribe(p_email text, p_source text default 'newsletter')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(trim(coalesce(p_email,'')));
begin
  if v_email !~ '^[A-Za-z0-9._%+''-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,24}$' or length(v_email) > 254 then
    raise exception 'INVALID_EMAIL' using errcode = '22023';
  end if;
  insert into public.subscribers (email, source)
  values (v_email, left(coalesce(nullif(trim(p_source),''), 'newsletter'), 40))
  on conflict (email) do nothing;
  return jsonb_build_object('ok', true,
    'code', (select nullif(s.data -> 'newsletter' ->> 'couponCode', '') from public.store s where s.id = 'main'));
end $$;


-- ---------------------------------------------------------------------
-- 6. stock_alerts  ("Notify me" on out-of-stock items)
-- ---------------------------------------------------------------------
create table if not exists public.stock_alerts (
  id           uuid primary key default gen_random_uuid(),
  email        text not null
               check (email = lower(email) and length(email) <= 254 and email ~ '^[A-Za-z0-9._%+''-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,24}$'),
  product_id   text not null check (length(product_id) <= 80),
  product_name text check (length(product_name) <= 300),
  sku          text not null default '' check (length(sku) <= 80),
  created_at   timestamptz not null default now(),
  notified_at  timestamptz,
  unique (email, product_id, sku)
);
alter table public.stock_alerts enable row level security;

create or replace function public._email_lower()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.email := lower(trim(new.email));
  return new;
end $$;

drop trigger if exists stock_alerts_email on public.stock_alerts;
create trigger stock_alerts_email before insert on public.stock_alerts
  for each row execute function public._email_lower();

drop policy if exists "visitors add alerts"   on public.stock_alerts;
drop policy if exists "admins read alerts"    on public.stock_alerts;
drop policy if exists "admins update alerts"  on public.stock_alerts;
drop policy if exists "admins delete alerts"  on public.stock_alerts;
-- (was: public insert policy "visitors add alerts" — sign-ups now arrive through the Edge Function)
create policy "admins read alerts"   on public.stock_alerts for select to authenticated using ((select public.is_admin()));
create policy "admins update alerts" on public.stock_alerts for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins delete alerts" on public.stock_alerts for delete to authenticated using ((select public.is_admin()));

-- "Notify me" used by the site. Repeat requests are ignored quietly.
create or replace function public.request_stock_alert(p_email text, p_product_id text, p_sku text default '', p_product_name text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(trim(coalesce(p_email,'')));
begin
  if v_email !~ '^[A-Za-z0-9._%+''-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,24}$' or length(v_email) > 254 then
    raise exception 'INVALID_EMAIL' using errcode = '22023';
  end if;
  if coalesce(trim(p_product_id),'') = '' or length(p_product_id) > 80 then
    raise exception 'INVALID_PRODUCT' using errcode = '22023';
  end if;
  insert into public.stock_alerts (email, product_id, sku, product_name)
  values (v_email, trim(p_product_id), left(coalesce(trim(p_sku),''), 80), left(p_product_name, 300))
  on conflict (email, product_id, sku) do nothing;
  return jsonb_build_object('ok', true);
end $$;


-- ---------------------------------------------------------------------
-- 7. contact_messages  (visitors insert only; admins read/delete)
-- ---------------------------------------------------------------------
create table if not exists public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) between 1 and 120),
  email      text not null check (length(email) <= 254 and email ~ '^[A-Za-z0-9._%+''-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,24}$'),
  phone      text check (length(phone) <= 40),
  subject    text check (length(subject) <= 200),
  message    text not null check (length(trim(message)) between 1 and 5000),
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.contact_messages enable row level security;

-- Light spam guard: max 3 messages per email per 10 minutes.
create or replace function public._contact_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.email := lower(trim(new.email));
  new.is_read := false;
  new.created_at := now();
  if (select count(*) from public.contact_messages m
       where m.email = new.email and m.created_at > now() - interval '10 minutes') >= 3 then
    raise exception 'RATE_LIMIT' using errcode = '54000';
  end if;
  return new;
end $$;

drop trigger if exists contact_before_insert on public.contact_messages;
create trigger contact_before_insert before insert on public.contact_messages
  for each row execute function public._contact_before_insert();

drop policy if exists "visitors send messages" on public.contact_messages;
drop policy if exists "admins read messages"   on public.contact_messages;
drop policy if exists "admins update messages" on public.contact_messages;
drop policy if exists "admins delete messages" on public.contact_messages;
-- (was: public insert policy "visitors send messages" — sign-ups now arrive through the Edge Function)
create policy "admins read messages"   on public.contact_messages for select to authenticated using ((select public.is_admin()));
create policy "admins update messages" on public.contact_messages for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins delete messages" on public.contact_messages for delete to authenticated using ((select public.is_admin()));


-- ---------------------------------------------------------------------
-- 8. orders + order_items + promo_redemptions
-- ---------------------------------------------------------------------
create sequence if not exists public.order_number_seq start 100001;

create table if not exists public.orders (
  id               uuid primary key default gen_random_uuid(),
  order_number     text not null unique,
  email            text not null,
  name             text not null,
  phone            text,
  shipping_address jsonb not null default '{}'::jsonb,
  subtotal         numeric(10,2) not null default 0,
  discount         numeric(10,2) not null default 0,
  shipping         numeric(10,2) not null default 0,
  tax              numeric(10,2) not null default 0,
  total            numeric(10,2) not null default 0,
  currency         text not null default 'usd',
  promo_code       text,
  status           text not null default 'new'
                   check (status in ('new','packed','shipped','delivered','refunded')),
  payment_status   text not null default 'unpaid',
  source           text not null default 'checkout' check (source in ('checkout','snipcart')),
  external_id      text unique,
  tracking_number  text,
  carrier          text,
  customer_note    text,
  admin_note       text,
  stock_deducted   boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.orders enable row level security;

-- Card payments (Stripe) and ShipStation. Safe to run on an existing database.
alter table public.orders add column if not exists pay_token             uuid not null default gen_random_uuid(); -- lets the shopper who placed the order pay for it
alter table public.orders add column if not exists payment_ref           text;        -- Stripe Checkout session (cs_…) then payment (pi_…)
alter table public.orders add column if not exists paid_at               timestamptz;
alter table public.orders add column if not exists payment_livemode      boolean;     -- false = a Stripe test-mode payment
alter table public.orders add column if not exists shipped_at            timestamptz;
alter table public.orders add column if not exists shipstation_order_id  text;
alter table public.orders add column if not exists shipstation_synced_at timestamptz;
alter table public.orders add column if not exists shipstation_error     text;
-- A paid order waits as "new" while the customer can still cancel it (30 minutes), then becomes "accepted"
-- (sent to ShipStation) either when an admin accepts it or automatically.
alter table public.orders add column if not exists accepted_at           timestamptz;
alter table public.orders add column if not exists cancelled_at          timestamptz;
alter table public.orders add column if not exists cancel_requested_at   timestamptz; -- customer asked to cancel after the window
alter table public.orders add column if not exists cancel_reason         text;
alter table public.orders add column if not exists return_requested_at   timestamptz; -- customer asked to return (from their account)
alter table public.orders add column if not exists return_reason         text;
alter table public.orders add column if not exists payment_method        text not null default 'card'; -- card (Stripe) | cod
alter table public.orders add column if not exists review_reason         text;          -- set when an order needs a person (e.g. Stripe amount mismatch); never auto-released
alter table public.orders add column if not exists cod_fee               numeric(10,2) not null default 0;
alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check check (payment_method in ('card','cod'));
-- authorized = card held, charged when the order is accepted; voided = hold released (never charged); failed = charging failed.
alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders add constraint orders_payment_status_check
  check (payment_status in ('unpaid','authorized','paid','refunded','voided','failed','cod'));
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('new','accepted','packed','shipped','delivered','refunded','cancelled'));
create index if not exists orders_payment_ref_idx on public.orders(payment_ref);

drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders
  for each row execute function public._touch_updated_at();

create table if not exists public.order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  product_id  text,
  sku         text,
  name        text not null,
  variant     text,
  unit_price  numeric(10,2) not null,
  qty         integer not null check (qty > 0),
  line_total  numeric(10,2) not null,
  image       text
);
create index if not exists order_items_order_id_idx on public.order_items(order_id);
alter table public.order_items enable row level security;

create table if not exists public.promo_redemptions (
  id         uuid primary key default gen_random_uuid(),
  promo_code text not null,
  email      text not null,
  order_id   uuid references public.orders(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists promo_redemptions_code_idx on public.promo_redemptions(lower(promo_code), email);
alter table public.promo_redemptions enable row level security;

drop policy if exists "admins read orders"        on public.orders;
drop policy if exists "admins update orders"      on public.orders;
drop policy if exists "admins read order items"   on public.order_items;
drop policy if exists "admins read redemptions"   on public.promo_redemptions;
create policy "admins read orders"      on public.orders            for select to authenticated using ((select public.is_admin()));
create policy "admins update orders"    on public.orders            for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins read order items" on public.order_items       for select to authenticated using ((select public.is_admin()));
create policy "admins read redemptions" on public.promo_redemptions for select to authenticated using ((select public.is_admin()));


-- ---------------------------------------------------------------------
-- 9. place_order — checkout when Snipcart is off.
--    Prices, stock, promo and shipping are all re-checked HERE against
--    the published catalog, so a visitor cannot change what they pay.
--
--    p_order = {
--      "email","name","phone","note",
--      "address": {"line1","line2","city","state","zip","country"},
--      "promoCode": "WELCOME15",
--      "items": [{"productId":"p_x","colorId":"cl_x","sizeId":"sz_x","qty":1}, ...]
--    }
-- ---------------------------------------------------------------------
create or replace function public._gen_sku(p jsonb, color jsonb, size jsonb)
returns text language sql immutable set search_path = '' as $$
  select concat_ws('-',
    coalesce(nullif(upper(left(regexp_replace(coalesce(nullif(p->>'skuPrefix',''), nullif(p->>'name',''), 'HW'), '[^A-Za-z0-9]', '', 'g'), 4)), ''), 'HW'),
    nullif(upper(left(regexp_replace(coalesce(color->>'label',''), '[^A-Za-z0-9]', '', 'g'), 3)), ''),
    nullif(upper(left(regexp_replace(coalesce(size->>'label',''),  '[^A-Za-z0-9]', '', 'g'), 6)), '')
  );
$$;

create or replace function public.place_order(p_order jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_store     jsonb;
  v_inv       jsonb;
  v_email     text := lower(trim(coalesce(p_order->>'email','')));
  v_name      text := trim(coalesce(p_order->>'name',''));
  v_addr      jsonb := coalesce(p_order->'address','{}'::jsonb);
  v_item      jsonb;
  v_prod      jsonb;
  v_color     jsonb;
  v_size      jsonb;
  v_ov        jsonb;
  v_qty       int;
  v_sku       text;
  v_price     numeric;
  v_sale      numeric;
  v_unit      numeric;
  v_instock   boolean;
  v_variant   text;
  v_image     text;
  v_lines     jsonb := '[]'::jsonb;
  v_need      jsonb := '{}'::jsonb;
  v_sub       numeric := 0;
  v_discount  numeric := 0;
  v_ship      numeric := 0;
  v_total     numeric;
  v_sh        jsonb;
  v_promo     jsonb;
  v_code      text := nullif(trim(coalesce(p_order->>'promoCode','')), '');
  v_method    text := case when p_order->>'paymentMethod' = 'cod' then 'cod' else 'card' end;
  v_held      numeric;
  v_state     text := upper(trim(coalesce(p_order->'address'->>'state','')));
  v_fee       numeric := 0;
  v_tax       numeric := 0;
  v_rate      jsonb;
  v_order_id  uuid;
  v_token     uuid;
  v_number    text;
  k           text;
begin
  -- Contact + address
  if v_email !~ '^[A-Za-z0-9._%+''-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,24}$' or length(v_email) > 254 then
    raise exception 'INVALID_EMAIL' using errcode = '22023';
  end if;
  if length(v_name) < 1 or length(v_name) > 120 then
    raise exception 'INVALID_NAME' using errcode = '22023';
  end if;
  if coalesce(trim(v_addr->>'line1'),'') = '' or coalesce(trim(v_addr->>'city'),'') = ''
     or coalesce(trim(v_addr->>'state'),'') = '' or coalesce(trim(v_addr->>'zip'),'') = '' then
    raise exception 'INVALID_ADDRESS' using errcode = '22023';
  end if;
  -- We ship within the United States only (states, DC, territories and military addresses).
  if upper(coalesce(nullif(trim(v_addr->>'country'),''), 'US')) <> 'US' then
    raise exception 'SHIPPING_COUNTRY' using errcode = '22023';
  end if;
  if v_state <> all (array['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','PR','GU','VI','AS','MP','AA','AE','AP'])
     or trim(v_addr->>'zip') !~ '^\d{5}(-\d{4})?$' then
    raise exception 'INVALID_ADDRESS' using errcode = '22023';
  end if;
  if coalesce(jsonb_typeof(p_order->'items'), '') <> 'array'
     or jsonb_array_length(p_order->'items') = 0
     or jsonb_array_length(p_order->'items') > 50 then
    raise exception 'EMPTY_CART' using errcode = '22023';
  end if;

  select s.data into v_store from public.store s where s.id = 'main';
  v_inv := coalesce(v_store->'inventory', '{}'::jsonb);

  -- Only the payment methods switched on in Admin › Storefront › Payment methods.
  if v_method = 'card' and coalesce(v_store->'payments'->>'stripe', 'false') <> 'true' then
    raise exception 'CHECKOUT_CLOSED' using errcode = '22023';
  end if;
  if v_method = 'cod' then
    if coalesce(v_store->'payments'->>'cod', 'false') <> 'true' then
      raise exception 'COD_UNAVAILABLE' using errcode = '22023';
    end if;
    -- Cash on delivery can't be checked up front, so keep it small: 3 open COD orders per email per day.
    if (select count(*) from public.orders o
         where o.email = v_email and o.payment_method = 'cod' and o.status <> 'cancelled'
           and o.created_at > now() - interval '1 day') >= 3 then
      raise exception 'TOO_MANY_ORDERS' using errcode = '22023';
    end if;
    v_fee := least(greatest(coalesce(public._num(v_store->'payments'->>'codFee'), 0), 0), 50);
  end if;
  -- Stop one address from piling up unpaid orders.
  if (select count(*) from public.orders o
       where o.email = v_email and o.payment_status = 'unpaid' and o.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'TOO_MANY_ORDERS' using errcode = '22023';
  end if;

  -- Price every line from the published catalog
  for v_item in select * from jsonb_array_elements(p_order->'items') loop
    v_qty := coalesce(public._num(v_item->>'qty'), 0)::int;
    if v_qty < 1 or v_qty > 99 then
      raise exception 'INVALID_QTY' using errcode = '22023';
    end if;

    select e into v_prod from jsonb_array_elements(coalesce(v_store->'products','[]'::jsonb)) e
     where e->>'id' = v_item->>'productId' limit 1;
    if v_prod is null then
      raise exception 'PRODUCT_NOT_FOUND' using errcode = '22023';
    end if;
    if coalesce(v_prod->>'hidden','false') = 'true' then
      raise exception 'PRODUCT_NOT_FOUND' using errcode = '22023';
    end if;

    select o into v_color from jsonb_array_elements(coalesce(v_prod->'options','[]'::jsonb)) o where o->>'type' = 'color' limit 1;
    select o into v_size  from jsonb_array_elements(coalesce(v_prod->'options','[]'::jsonb)) o where o->>'type' = 'size'  limit 1;

    if v_color is not null and v_size is not null then
      -- Collection: color × size
      select c into v_color from jsonb_array_elements(v_color->'values') c where c->>'id' = v_item->>'colorId' limit 1;
      select z into v_size  from jsonb_array_elements(v_size->'values')  z where z->>'id' = v_item->>'sizeId'  limit 1;
      if v_color is null or v_size is null then
        raise exception 'VARIANT_NOT_FOUND' using errcode = '22023';
      end if;
      v_ov    := coalesce(v_prod->'variants'->((v_color->>'id') || '__' || (v_size->>'id')), '{}'::jsonb);
      if coalesce(v_ov->>'off', 'false') = 'true' then
        raise exception 'VARIANT_NOT_FOUND' using errcode = '22023';  -- this color/size isn't sold
      end if;
      v_price := coalesce(public._num(v_ov->>'price'), public._num(v_size->>'price'), public._num(v_prod->>'basePrice'));
      v_sale  := coalesce(public._num(v_ov->>'salePrice'), public._num(v_size->>'salePrice'), public._num(v_prod->>'baseSalePrice'));
      v_sku   := coalesce(nullif(v_ov->>'sku',''), public._gen_sku(v_prod, v_color, v_size));
      v_instock := case when v_ov ? 'inStock' and jsonb_typeof(v_ov->'inStock') = 'boolean'
                        then (v_ov->>'inStock')::boolean
                        else coalesce(v_prod->>'inStock','true') <> 'false' end;
      v_variant := (v_color->>'label') || ' / ' || (v_size->>'label');
      v_image := coalesce(
        (select i from jsonb_array_elements_text(coalesce(v_ov->'images','[]'::jsonb)) i where i <> '' limit 1),
        (select i from jsonb_array_elements_text(coalesce(v_color->'images','[]'::jsonb)) i where i <> '' limit 1));
    else
      -- Simple product
      v_price := public._num(v_prod->>'price');
      v_sale  := public._num(v_prod->>'salePrice');
      v_sku   := coalesce(nullif(v_prod->>'sku',''), v_prod->>'id');
      v_instock := coalesce(v_prod->>'inStock','true') <> 'false';
      v_variant := null;
      v_image := coalesce(nullif(v_prod->>'image',''),
        (select i from jsonb_array_elements_text(coalesce(v_prod->'images','[]'::jsonb)) i where i <> '' limit 1));
    end if;

    v_unit := case when v_sale is not null and v_sale > 0 and v_sale < v_price then v_sale else v_price end;
    -- A missing or $0 price is a catalog mistake, never a free item.
    if v_price is null or v_price <= 0 or v_unit is null or v_unit <= 0 then
      raise exception 'PRICE_MISSING' using errcode = '22023';
    end if;

    -- Stock: a tracked SKU is checked after the loop (with a lock); otherwise the inStock flag.
    v_need := jsonb_set(v_need, array[v_sku], to_jsonb(coalesce(public._num(v_need->>v_sku), 0) + v_qty));
    if not (v_inv ? v_sku) and not v_instock then
      raise exception 'OUT_OF_STOCK:%', v_prod->>'name' using errcode = '22023';
    end if;

    v_sub := v_sub + round(v_unit * v_qty, 2);
    v_lines := v_lines || jsonb_build_object(
      'product_id', v_prod->>'id', 'sku', v_sku, 'name', left(v_prod->>'name', 300),
      'variant', v_variant, 'unit_price', round(v_unit, 2), 'qty', v_qty,
      'line_total', round(v_unit * v_qty, 2), 'image', left(v_image, 1000));

    v_prod := null; v_color := null; v_size := null;
  end loop;

  -- Tracked stock: the count in the admin minus what open orders already hold (paid, card-approved, cash on
  -- delivery, or unpaid for under 35 minutes), until the admin deducts it. One lock per SKU, taken in a fixed
  -- order, so two shoppers can't both buy the last one.
  for k in select key from jsonb_each(v_need) order by key loop
    if v_inv ? k then
      perform pg_advisory_xact_lock(hashtext('stock:' || k));
      select coalesce(sum(i.qty), 0) into v_held
        from public.order_items i join public.orders o on o.id = i.order_id
       where i.sku = k and o.status not in ('cancelled','refunded') and not o.stock_deducted
         and (o.payment_status in ('authorized','paid','cod')
              or (o.payment_status = 'unpaid' and o.created_at > now() - interval '35 minutes'));
      if coalesce(public._num(v_inv->>k), 0) - v_held < public._num(v_need->>k) then
        raise exception 'OUT_OF_STOCK:%', (select l->>'name' from jsonb_array_elements(v_lines) l where l->>'sku' = k limit 1) using errcode = '22023';
      end if;
    end if;
  end loop;

  -- Promo code
  if v_code is not null then
    perform pg_advisory_xact_lock(hashtext('promo:' || lower(v_code)));
    select e into v_promo from jsonb_array_elements(coalesce(v_store->'promos','[]'::jsonb)) e
     where lower(e->>'code') = lower(v_code) and coalesce(e->>'active','false') = 'true' limit 1;
    if v_promo is null then
      raise exception 'PROMO_INVALID' using errcode = '22023';
    end if;
    if nullif(v_promo->>'startsAt','') is not null and current_date < (v_promo->>'startsAt')::date then
      raise exception 'PROMO_NOT_STARTED' using errcode = '22023';
    end if;
    if nullif(v_promo->>'endsAt','') is not null and current_date > (v_promo->>'endsAt')::date then
      raise exception 'PROMO_EXPIRED' using errcode = '22023';
    end if;
    if coalesce(public._num(v_promo->>'minOrder'), 0) > v_sub then
      raise exception 'PROMO_MIN_ORDER' using errcode = '22023';
    end if;
    -- Only real orders use up a code: paid / approved / cash on delivery / refunded, or unpaid for under 35 minutes.
    if coalesce(public._num(v_promo->>'usageLimit'), 0) > 0
       and (select count(*) from public.promo_redemptions r join public.orders o on o.id = r.order_id
             where lower(r.promo_code) = lower(v_code) and o.status <> 'cancelled'
               and (o.payment_status in ('authorized','paid','cod','refunded') or o.created_at > now() - interval '35 minutes'))
           >= public._num(v_promo->>'usageLimit') then
      raise exception 'PROMO_USED_UP' using errcode = '22023';
    end if;
    if coalesce(v_promo->>'oncePerCustomer','false') = 'true'
       and exists (select 1 from public.promo_redemptions r join public.orders o on o.id = r.order_id
                    where lower(r.promo_code) = lower(v_code) and r.email = v_email and o.status <> 'cancelled'
                      and (o.payment_status in ('authorized','paid','cod','refunded') or o.created_at > now() - interval '35 minutes')) then
      raise exception 'PROMO_ALREADY_USED' using errcode = '22023';
    end if;
    v_discount := case when v_promo->>'type' = 'percent'
                       then round(v_sub * coalesce(public._num(v_promo->>'value'),0) / 100, 2)
                       else least(coalesce(public._num(v_promo->>'value'),0), v_sub) end;
    v_discount := greatest(v_discount, 0);
  end if;

  -- Shipping (same rule as the cart: threshold is checked on the subtotal)
  v_sh := coalesce(v_store->'shipping', '{}'::jsonb);
  if coalesce(v_sh->>'enabled','true') <> 'false'
     and v_sub > 0
     and v_sub < coalesce(public._num(v_sh->>'freeThreshold'), 75) then
    v_ship := coalesce(public._num(v_sh->>'flatRate'), 9.95);
  end if;

  -- Sales tax (Admin › Promotions › Sales tax): a rate per state, on the discounted items and, if set, shipping.
  if coalesce(v_store->'tax'->>'enabled', 'false') = 'true' then
    select e into v_rate from jsonb_array_elements(coalesce(v_store->'tax'->'rates', '[]'::jsonb)) e
     where upper(trim(e->>'state')) = v_state limit 1;
    if v_rate is not null and coalesce(public._num(v_rate->>'rate'), 0) > 0 then
      v_tax := round((greatest(v_sub - v_discount, 0)
                      + case when coalesce(v_rate->>'shipping', 'true') <> 'false' then v_ship else 0 end)
                     * least(public._num(v_rate->>'rate'), 20) / 100, 2);
    end if;
  end if;

  v_total  := greatest(v_sub - v_discount, 0) + v_ship + v_fee + v_tax;
  if v_method = 'cod' and v_total > coalesce(nullif(public._num(v_store->'payments'->>'codMax'), 0), 500) then
    raise exception 'COD_LIMIT' using errcode = '22023';
  end if;
  -- Random order numbers: they don't reveal how many orders the store takes, and can't be walked one by one.
  loop
    v_number := 'HW-' || (1000000 + floor(random() * 9000000))::bigint;
    exit when not exists (select 1 from public.orders o where o.order_number = v_number);
  end loop;

  insert into public.orders (order_number, email, name, phone, shipping_address,
                             subtotal, discount, shipping, tax, total, promo_code, customer_note,
                             payment_method, cod_fee, payment_status, paid_at)
  values (v_number, v_email, v_name, left(nullif(trim(p_order->>'phone'),''), 40),
          jsonb_build_object(
            'line1',   left(trim(v_addr->>'line1'), 200),
            'line2',   left(coalesce(trim(v_addr->>'line2'),''), 200),
            'city',    left(trim(v_addr->>'city'), 100),
            'state',   v_state,
            'zip',     left(trim(v_addr->>'zip'), 20),
            'country', 'US'),
          round(v_sub,2), round(v_discount,2), round(v_ship,2), round(v_tax,2), round(v_total,2),
          case when v_code is not null then upper(v_promo->>'code') end,
          left(nullif(trim(p_order->>'note'),''), 1000),
          -- A COD order is confirmed straight away (paid_at starts the free cancellation window); cash is collected on delivery.
          v_method, round(v_fee,2), case when v_method = 'cod' then 'cod' else 'unpaid' end,
          case when v_method = 'cod' then now() end)
  returning id, pay_token into v_order_id, v_token;

  insert into public.order_items (order_id, product_id, sku, name, variant, unit_price, qty, line_total, image)
  select v_order_id, l->>'product_id', l->>'sku', l->>'name', l->>'variant',
         (l->>'unit_price')::numeric, (l->>'qty')::int, (l->>'line_total')::numeric, l->>'image'
    from jsonb_array_elements(v_lines) l;

  if v_code is not null then
    insert into public.promo_redemptions (promo_code, email, order_id)
    values (upper(v_promo->>'code'), v_email, v_order_id);
  end if;

  return jsonb_build_object(
    'order_number', v_number, 'email', v_email, 'pay_token', v_token,
    'subtotal', round(v_sub,2), 'discount', round(v_discount,2),
    'shipping', round(v_ship,2), 'tax', round(v_tax,2), 'total', round(v_total,2),
    'payment_method', v_method, 'cod_fee', round(v_fee,2),
    'paid_at', case when v_method = 'cod' then now() end,
    'items', v_lines);
end $$;


-- ---------------------------------------------------------------------
-- 9b. request_cancel — after the free cancellation window, the customer can only ASK.
--     Needs order number AND email, and never touches the order status.
-- ---------------------------------------------------------------------
create or replace function public.request_cancel(p_number text, p_email text, p_reason text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype;
begin
  select * into v_order from public.orders o
   where upper(o.order_number) = upper(trim(p_number)) and o.email = lower(trim(p_email));
  if v_order.id is null then
    raise exception 'ORDER_NOT_FOUND' using errcode = '22023';
  end if;
  if v_order.status in ('shipped','delivered','cancelled','refunded') then
    return jsonb_build_object('ok', false, 'status', v_order.status);
  end if;
  update public.orders
     set cancel_requested_at = coalesce(cancel_requested_at, now()),
         cancel_reason = left(nullif(trim(p_reason), ''), 500)
   where id = v_order.id;
  return jsonb_build_object('ok', true, 'status', v_order.status);
end $$;

-- ---------------------------------------------------------------------
-- 10. track_order — visitor lookup by order number + email.
--     Returns nothing unless BOTH match. Never returns address or phone.
-- ---------------------------------------------------------------------
create or replace function public.track_order(p_number text, p_email text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'order_number',    o.order_number,
    'created_at',      o.created_at,
    'status',          o.status,
    'payment_status',  o.payment_status,
    'carrier',         o.carrier,
    'tracking_number', o.tracking_number,
    'shipped_at',      o.shipped_at,
    'paid_at',         o.paid_at,
    'cancel_requested_at', o.cancel_requested_at,
    'total',           o.total,
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'variant', i.variant, 'qty', i.qty))
                         from public.order_items i where i.order_id = o.id), '[]'::jsonb))
  from public.orders o
  where upper(o.order_number) = upper(trim(p_number))
    and o.email = lower(trim(p_email))
  limit 1;
$$;


-- ---------------------------------------------------------------------
-- 10b. Customer sign-in codes (the Edge Function's /account routes).
--      Customers sign in with a 6-digit code sent by email — no passwords, no Supabase Auth users.
--      Only a keyed hash of each code is kept, plus a hash of the requester's IP for rate limits.
--      Rows are deleted after a day. Only the service role can touch this table.
-- ---------------------------------------------------------------------
create table if not exists public.customer_login_codes (
  id          uuid primary key default gen_random_uuid(),
  email       text not null check (email = lower(email) and length(email) <= 254),
  code_hash   text not null,
  ip_hash     text,
  attempts    int  not null default 0 check (attempts >= 0),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
alter table public.customer_login_codes add column if not exists new_customer boolean not null default false; -- sign-up (no orders yet): daily cap
create index if not exists customer_login_codes_email_idx on public.customer_login_codes (email, created_at desc);
create index if not exists customer_login_codes_ip_idx    on public.customer_login_codes (ip_hash, created_at desc);
alter table public.customer_login_codes enable row level security;   -- no policies: closed to anon and authenticated

-- Customer profiles (Your account › Settings and Addresses). Keyed by email, like orders.
-- signed_out_at: sessions issued before it are refused ("Sign out on all devices", "Delete account").
create table if not exists public.customer_profiles (
  email          text primary key check (email = lower(email) and length(email) <= 254),
  first_name     text check (length(first_name) <= 60),
  last_name      text check (length(last_name) <= 60),
  phone          text check (length(phone) <= 40),
  addresses      jsonb not null default '[]'::jsonb
                 check (jsonb_typeof(addresses) = 'array' and jsonb_array_length(addresses) <= 10),
  signed_out_at  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
drop trigger if exists customer_profiles_touch on public.customer_profiles;
create trigger customer_profiles_touch before update on public.customer_profiles
  for each row execute function public._touch_updated_at();
alter table public.customer_profiles enable row level security;      -- no policies: closed to anon and authenticated


-- ---------------------------------------------------------------------
-- 10c. Rate limits and signed-out customer sessions (Edge Function only).
-- ---------------------------------------------------------------------
create table if not exists public.rate_hits (
  bucket text not null check (length(bucket) <= 40),
  key    text not null check (length(key) <= 64),   -- a keyed hash of the visitor's IP, never the IP
  at     timestamptz not null default now()
);
create index if not exists rate_hits_idx on public.rate_hits (bucket, key, at desc);
alter table public.rate_hits enable row level security;           -- no policies: service role only

create table if not exists public.customer_revoked (
  n   text primary key check (length(n) <= 64),    -- the session's random id
  exp timestamptz not null
);
alter table public.customer_revoked enable row level security;    -- no policies: service role only

alter table public.subscribers add column if not exists welcome_sent_at timestamptz;

-- ---------------------------------------------------------------------
-- 10d. What shoppers may read: the store without promo codes (except the one advertised to newsletter
--      sign-ups) and without draft products. The site and the published copy (store.json) both use this.
-- ---------------------------------------------------------------------
create or replace function public.public_store()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_data jsonb; v_at timestamptz; v_code text;
begin
  select s.data, s.updated_at into v_data, v_at from public.store s where s.id = 'main';
  if v_data is null then return null; end if;
  v_code := upper(coalesce(v_data->'newsletter'->>'couponCode', ''));
  v_data := v_data
    || jsonb_build_object('products', coalesce((select jsonb_agg(p) from jsonb_array_elements(coalesce(v_data->'products', '[]'::jsonb)) p
                                                 where coalesce(p->>'hidden', 'false') <> 'true'), '[]'::jsonb))
    || jsonb_build_object('promos', coalesce((select jsonb_agg(jsonb_build_object('id', p->'id', 'code', p->'code', 'type', p->'type', 'value', p->'value',
                                                 'minOrder', p->'minOrder', 'active', p->'active', 'startsAt', p->'startsAt', 'endsAt', p->'endsAt'))
                                               from jsonb_array_elements(coalesce(v_data->'promos', '[]'::jsonb)) p
                                              where v_code <> '' and upper(p->>'code') = v_code and coalesce(p->>'active', 'false') = 'true'), '[]'::jsonb));
  return jsonb_build_object('data', v_data, 'updated_at', v_at);
end $$;

create or replace function public.public_store_version()
returns timestamptz language sql stable security definer set search_path = '' as $$
  select s.updated_at from public.store s where s.id = 'main';
$$;

-- One code at a time for the cart (never a list). Usage limits and "once per customer" stay private.
create or replace function public.check_promo(p_code text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('code', p->'code', 'type', p->'type', 'value', p->'value', 'minOrder', p->'minOrder',
                            'active', true, 'startsAt', p->'startsAt', 'endsAt', p->'endsAt')
    from public.store s, jsonb_array_elements(coalesce(s.data->'promos', '[]'::jsonb)) p
   where s.id = 'main' and length(trim(coalesce(p_code, ''))) between 1 and 40
     and lower(p->>'code') = lower(trim(p_code)) and coalesce(p->>'active', 'false') = 'true'
   limit 1;
$$;


-- ---------------------------------------------------------------------
-- 11. Privileges — least privilege for the public API roles.
--     RLS above decides WHICH rows; these grants decide WHICH actions.
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

revoke all on public.admins, public.store, public.store_private, public.subscribers,
              public.stock_alerts, public.contact_messages, public.orders,
              public.order_items, public.promo_redemptions, public.customer_login_codes,
              public.customer_profiles
  from anon, authenticated;
revoke all on sequence public.order_number_seq from anon, authenticated;

grant select on public.store to authenticated;                    -- admins only (policy); writes go through save_store(); shoppers use public_store()
grant select on public.store_private to authenticated;            -- writes go through save_private()
grant select on public.admins to authenticated;

-- Sign-ups, stock alerts and messages arrive through the Edge Function (rate-limited per visitor), not directly.
grant select, delete on public.subscribers to authenticated;
grant select, update, delete on public.stock_alerts to authenticated;
grant select, update, delete on public.contact_messages to authenticated;

grant select, update on public.orders to authenticated;
grant select on public.order_items, public.promo_redemptions to authenticated;

-- service_role (used only by the Cloudflare Worker: Snipcart, Stripe and ShipStation webhooks)
-- The Edge Function reads the catalog (site address, cancellation window) and the subscriber list.
grant select on public.store, public.subscribers to service_role;
grant all on public.orders, public.order_items, public.promo_redemptions to service_role;
grant usage, select on sequence public.order_number_seq to service_role;
grant select, insert, update, delete on public.customer_login_codes to service_role;
grant select, insert, update, delete on public.customer_profiles to service_role;
grant insert, update, delete on public.subscribers to service_role; -- Your account › Notifications; welcome email sent once
grant insert (name, email, phone, subject, message) on public.contact_messages to service_role;
grant select, insert, delete on public.rate_hits, public.customer_revoked to service_role;
revoke all on public.rate_hits, public.customer_revoked from anon, authenticated;

-- Functions: lock everything, then open only what each role needs.
revoke all on function public._num(text)                         from public, anon, authenticated;
revoke all on function public._touch_updated_at()                from public, anon, authenticated;
revoke all on function public._subscriber_before_insert()        from public, anon, authenticated;
revoke all on function public._email_lower()                     from public, anon, authenticated;
revoke all on function public._contact_before_insert()           from public, anon, authenticated;
revoke all on function public._gen_sku(jsonb, jsonb, jsonb)      from public, anon, authenticated;
revoke all on function public.is_admin()                         from public;
revoke all on function public.save_store(jsonb, timestamptz)     from public, anon;
revoke all on function public.save_private(jsonb, timestamptz)   from public, anon;
revoke all on function public.place_order(jsonb)                 from public;
revoke all on function public.track_order(text, text)            from public;
revoke all on function public.subscribe(text, text)              from public;
revoke all on function public.request_stock_alert(text, text, text, text) from public;
revoke all on function public.request_cancel(text, text, text)            from public;
revoke all on function public.public_store()                      from public;
revoke all on function public.public_store_version()              from public;
revoke all on function public.check_promo(text)                   from public;
-- Earlier versions let visitors call these directly; now only the Edge Function may.
revoke execute on function public.track_order(text, text)          from anon, authenticated;
revoke execute on function public.subscribe(text, text)            from anon, authenticated;
revoke execute on function public.request_stock_alert(text, text, text, text) from anon, authenticated;
revoke execute on function public.request_cancel(text, text, text)           from anon, authenticated;

grant execute on function public.is_admin()                       to anon, authenticated;
grant execute on function public.save_store(jsonb, timestamptz)   to authenticated;
grant execute on function public.save_private(jsonb, timestamptz) to authenticated;
grant execute on function public.place_order(jsonb)               to anon, authenticated;
grant execute on function public.public_store()                   to anon, authenticated, service_role;
grant execute on function public.public_store_version()           to anon, authenticated, service_role;
grant execute on function public.check_promo(text)                to anon, authenticated, service_role;
grant execute on function public.place_order(jsonb)               to service_role;
grant execute on function public.track_order(text, text)          to service_role;
grant execute on function public.subscribe(text, text)            to service_role;
grant execute on function public.request_stock_alert(text, text, text, text) to service_role;
grant execute on function public.request_cancel(text, text, text)           to service_role;


-- ---------------------------------------------------------------------
-- 12. Storage bucket "media" — public read, admin upload/change/delete.
--     (Public URLs work without a select policy; only admins can list.)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 52428800,
        array['image/webp','image/jpeg','image/png','image/gif','image/svg+xml','image/avif','video/mp4','video/webm','application/json'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "media admins list"   on storage.objects;
drop policy if exists "media admins upload" on storage.objects;
drop policy if exists "media admins update" on storage.objects;
drop policy if exists "media admins delete" on storage.objects;
create policy "media admins list"   on storage.objects for select to authenticated
  using (bucket_id = 'media' and (select public.is_admin()));
create policy "media admins upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (select public.is_admin()));
create policy "media admins update" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (select public.is_admin()))
  with check (bucket_id = 'media' and (select public.is_admin()));
create policy "media admins delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (select public.is_admin()));


-- ---------------------------------------------------------------------
-- Done. The result grid should show one row: "Home Weavers database is ready".
-- Next: add your admin email (see README, Phase 1 step 5).
-- ---------------------------------------------------------------------
select 'Home Weavers database is ready' as status;
