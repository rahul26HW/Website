-- Home Weavers — 2026-09-22
--   1. Stock moves out of the store JSON into its own table, so an order can take stock off safely
--      while an admin has the store open. Orders deduct when they are placed and put it back when cancelled.
--   2. First-party analytics: visits, product views, card impressions and clicks, carts, checkouts.
--      No names, no emails, no addresses, no advertising cookies, no third-party scripts.
-- Safe to run more than once.

-- =====================================================================
-- 1. stock
-- =====================================================================
create table if not exists public.stock (
  sku        text primary key,
  qty        integer not null default 0 check (qty >= 0),
  updated_at timestamptz not null default now()
);

alter table public.stock enable row level security;
revoke all on public.stock from public, anon;
grant select, insert, update, delete on public.stock to authenticated;

drop policy if exists "admins read stock"   on public.stock;
drop policy if exists "admins insert stock" on public.stock;
drop policy if exists "admins update stock" on public.stock;
drop policy if exists "admins delete stock" on public.stock;
create policy "admins read stock"   on public.stock for select to authenticated using ((select public.is_admin()));
create policy "admins insert stock" on public.stock for insert to authenticated with check ((select public.is_admin()));
create policy "admins update stock" on public.stock for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins delete stock" on public.stock for delete to authenticated using ((select public.is_admin()));

-- Move whatever the store JSON holds today into the table (first run only), then stop keeping it there.
insert into public.stock (sku, qty)
select left(t.key, 120), greatest(0, floor(coalesce(public._num(t.value #>> '{}'), 0))::int)
  from public.store s, jsonb_each(coalesce(s.data->'inventory', '{}'::jsonb)) t
 where s.id = 'main' and t.key <> ''
on conflict (sku) do nothing;

update public.store set data = data - 'inventory' where id = 'main' and data ? 'inventory';

-- The admin saves only what it changed: rows whose value differs from the copy it loaded. A deduction that
-- happened while the admin had the screen open is left alone.
create or replace function public.admin_save_stock(p_base jsonb, p_next jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare k text; v jsonb; n int; v_changed int := 0;
begin
  if not (select public.is_admin()) then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  if jsonb_typeof(p_base) <> 'object' or jsonb_typeof(p_next) <> 'object' then
    raise exception 'BAD_INPUT' using errcode = '22023';
  end if;
  for k, v in select * from jsonb_each(p_next) loop
    if k <> '' and (p_base->k) is distinct from v then
      n := greatest(0, least(9999999, floor(coalesce(public._num(v #>> '{}'), 0))::int));
      insert into public.stock (sku, qty, updated_at) values (left(k, 120), n, now())
        on conflict (sku) do update set qty = excluded.qty, updated_at = now();
      v_changed := v_changed + 1;
    end if;
  end loop;
  for k in select t.key from jsonb_each(p_base) t where not (p_next ? t.key) loop
    delete from public.stock where sku = k;
    v_changed := v_changed + 1;
  end loop;
  return jsonb_build_object('ok', true, 'changed', v_changed,
    'inventory', coalesce((select jsonb_object_agg(s.sku, s.qty) from public.stock s), '{}'::jsonb));
end $$;

create or replace function public.admin_stock()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when (select public.is_admin())
              then coalesce((select jsonb_object_agg(s.sku, s.qty) from public.stock s), '{}'::jsonb)
         end;
$$;

revoke all on function public.admin_save_stock(jsonb, jsonb) from public, anon;
revoke all on function public.admin_stock()                  from public, anon;
grant execute on function public.admin_save_stock(jsonb, jsonb) to authenticated, service_role;
grant execute on function public.admin_stock()                  to authenticated, service_role;

-- A cancelled or refunded order puts its items back on the shelf, whoever cancels it and however.
create or replace function public.restock_cancelled()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('cancelled','refunded')
     and old.status not in ('cancelled','refunded')
     and coalesce(old.stock_deducted, false) then
    update public.stock s
       set qty = s.qty + i.qty, updated_at = now()
      from (select oi.sku, sum(oi.qty)::int as qty from public.order_items oi
             where oi.order_id = new.id and oi.sku is not null group by oi.sku) i
     where s.sku = i.sku;
    new.stock_deducted := false;
  end if;
  return new;
end $$;

drop trigger if exists orders_restock on public.orders;
create trigger orders_restock before update of status on public.orders
  for each row execute function public.restock_cancelled();


-- =====================================================================
-- 2. analytics events (first party, nothing personal)
-- =====================================================================
create table if not exists public.events (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  kind       text not null check (kind in ('visit','view','impression','click','cart','checkout')),
  path       text,
  product_id text,
  sku        text,
  source     text,
  medium     text,
  device     text,
  visit_id   text not null,
  is_new     boolean not null default false
);
create index if not exists events_at_idx       on public.events (at);
create index if not exists events_kind_at_idx  on public.events (kind, at);
create index if not exists events_visit_idx    on public.events (visit_id, at);

alter table public.events enable row level security;
revoke all on public.events from public, anon, authenticated;
grant select on public.events to authenticated;
drop policy if exists "admins read events" on public.events;
create policy "admins read events" on public.events for select to authenticated using ((select public.is_admin()));

-- The only way in: a capped, validated batch from the shop pages. Never returns anything.
create or replace function public.track_events(p_batch jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare e jsonb; n int := 0; v_visit text; v_today int;
begin
  if jsonb_typeof(p_batch) <> 'array' or jsonb_array_length(p_batch) = 0 then return; end if;
  v_visit := left(regexp_replace(coalesce(p_batch->0->>'v', ''), '[^a-zA-Z0-9]', '', 'g'), 32);
  if length(v_visit) < 8 then return; end if;
  -- One visit can only ever write so much.
  select count(*) into v_today from public.events where visit_id = v_visit and at > now() - interval '1 day';
  if v_today > 600 then return; end if;

  for e in select * from jsonb_array_elements(p_batch) loop
    n := n + 1;
    exit when n > 30;
    continue when coalesce(e->>'k', '') not in ('visit','view','impression','click','cart','checkout');
    insert into public.events (kind, path, product_id, sku, source, medium, device, visit_id, is_new)
    values (e->>'k', left(e->>'p', 200), left(e->>'id', 80), left(e->>'sku', 80),
            left(e->>'s', 80), left(e->>'m', 20), left(e->>'d', 10), v_visit,
            coalesce(e->>'n', '') = '1');
  end loop;
end $$;

revoke all on function public.track_events(jsonb) from public;
grant execute on function public.track_events(jsonb) to anon, authenticated, service_role;

-- Where the order came from, so revenue can be put against a source. Written by checkout, capped here.
alter table public.orders add column if not exists visit_source text;
alter table public.orders add column if not exists visit_medium text;

-- Everything the Analytics screen shows, in one admin-only call.
create or replace function public.admin_analytics(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d int := least(greatest(coalesce(p_days, 30), 1), 365); v_from timestamptz; v_out jsonb;
begin
  if not (select public.is_admin()) then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  v_from := now() - (d || ' days')::interval;

  with ev as (select * from public.events where at >= v_from),
       ord as (select * from public.orders where created_at >= v_from and status <> 'cancelled'),
       totals as (
         select (select count(distinct visit_id) from ev)                                as visits,
                (select count(*) from ev where kind = 'view')                            as views,
                (select count(*) from ev where kind = 'impression')                      as impressions,
                (select count(*) from ev where kind = 'click')                           as clicks,
                (select count(*) from ev where kind = 'cart')                            as carts,
                (select count(distinct visit_id) from ev where kind = 'checkout')        as checkouts,
                (select count(*) from ord)                                               as orders,
                (select coalesce(sum(total), 0) from ord)                                as revenue
       ),
       daily as (
         select to_char(g.day, 'YYYY-MM-DD') as day,
                (select count(distinct e.visit_id) from ev e where e.at::date = g.day)      as visits,
                (select count(*) from ord o where o.created_at::date = g.day)               as orders
           from generate_series((now() - (d || ' days')::interval)::date, now()::date, interval '1 day') g(day)
       ),
       sources as (
         select coalesce(nullif(e.source, ''), 'Direct') as source,
                coalesce(nullif(e.medium, ''), 'direct') as medium,
                count(distinct e.visit_id) as visits
           from ev e where e.kind = 'visit' group by 1, 2
       ),
       ordsrc as (
         select coalesce(nullif(o.visit_source, ''), 'Direct') as source,
                count(*) as orders, coalesce(sum(o.total), 0) as revenue
           from ord o group by 1
       ),
       prods as (
         select e.product_id,
                count(*) filter (where e.kind = 'impression') as impressions,
                count(*) filter (where e.kind = 'click')      as clicks,
                count(*) filter (where e.kind = 'cart')       as carts
           from ev e where e.product_id is not null and e.product_id <> '' group by 1
       ),
       prodord as (
         select i.product_id, sum(i.qty)::int as qty, coalesce(sum(i.line_total), 0) as revenue
           from public.order_items i join ord o on o.id = i.order_id group by 1
       ),
       devices as (
         select coalesce(nullif(e.device, ''), 'unknown') as device, count(distinct e.visit_id) as visits
           from ev e where e.kind = 'visit' group by 1
       ),
       firsts as (
         select o.email, min(o.created_at) as first_at from public.orders o
          where o.status <> 'cancelled' group by 1
       ),
       people as (
         select count(*) filter (where f.first_at >= v_from) as new_customers,
                count(*) filter (where f.first_at <  v_from) as returning_customers
           from (select distinct o.email from ord o) x join firsts f on f.email = x.email
       )
  select jsonb_build_object(
    'days', d,
    'totals', (select to_jsonb(t) from totals t),
    'daily', coalesce((select jsonb_agg(to_jsonb(x) order by x.day) from daily x), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(jsonb_build_object(
        'source', s.source, 'medium', s.medium, 'visits', s.visits,
        'orders', coalesce((select os.orders from ordsrc os where os.source = s.source), 0),
        'revenue', coalesce((select os.revenue from ordsrc os where os.source = s.source), 0))
        order by s.visits desc) from sources s), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(jsonb_build_object(
        'product_id', p.product_id, 'impressions', p.impressions, 'clicks', p.clicks, 'carts', p.carts,
        'qty', coalesce((select po.qty from prodord po where po.product_id = p.product_id), 0),
        'revenue', coalesce((select po.revenue from prodord po where po.product_id = p.product_id), 0))
        order by p.impressions desc) from prods p), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(jsonb_build_object('device', v.device, 'visits', v.visits) order by v.visits desc) from devices v), '[]'::jsonb),
    'people', (select to_jsonb(p) from people p)
  ) into v_out;
  return v_out;
end $$;

revoke all on function public.admin_analytics(int) from public, anon;
grant execute on function public.admin_analytics(int) to authenticated, service_role;

-- Keep six months of figures, no more.
create or replace function public.prune_events()
returns void language sql security definer set search_path = '' as $$
  delete from public.events where at < now() - interval '180 days';
$$;
revoke all on function public.prune_events() from public, anon, authenticated;
grant execute on function public.prune_events() to service_role;


-- =====================================================================
-- 3. place_order: counted stock now comes off the shelf as the order is placed,
--    and the order remembers where the visit came from.
-- =====================================================================
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
  v_took      int := 0;
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
  -- Counted stock lives in public.stock (not in the store JSON), so an order can take it off while an admin edits.
  select coalesce(jsonb_object_agg(k.sku, k.qty), '{}'::jsonb) into v_inv from public.stock k;

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

  -- Counted stock: what is on the shelf right now. Every order takes its items off as it is placed and puts
  -- them back if it is cancelled, so nothing else has to be subtracted here. One lock per SKU, in a fixed
  -- order, so two shoppers can't both buy the last one.
  for k in select key from jsonb_each(v_need) order by key loop
    if v_inv ? k then
      perform pg_advisory_xact_lock(hashtext('stock:' || k));
      select st.qty into v_held from public.stock st where st.sku = k for update;
      if coalesce(v_held, 0) < public._num(v_need->>k) then
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
                             payment_method, cod_fee, payment_status, paid_at, visit_source, visit_medium)
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
          case when v_method = 'cod' then now() end,
          -- Where this shopper came from, for the Analytics screen. Just a label, never anything personal.
          left(nullif(trim(coalesce(p_order->>'visitSource','')), ''), 80),
          left(nullif(trim(coalesce(p_order->>'visitMedium','')), ''), 20))
  returning id, pay_token into v_order_id, v_token;

  insert into public.order_items (order_id, product_id, sku, name, variant, unit_price, qty, line_total, image)
  select v_order_id, l->>'product_id', l->>'sku', l->>'name', l->>'variant',
         (l->>'unit_price')::numeric, (l->>'qty')::int, (l->>'line_total')::numeric, l->>'image'
    from jsonb_array_elements(v_lines) l;

  -- Take the items off the shelf now. A cancelled order puts them back (trigger orders_restock).
  update public.stock st
     set qty = greatest(0, st.qty - n.need), updated_at = now()
    from (select t.key as sku, coalesce(public._num(t.value #>> '{}'), 0)::int as need from jsonb_each(v_need) t) n
   where st.sku = n.sku;
  get diagnostics v_took = row_count;
  if v_took > 0 then
    update public.orders set stock_deducted = true where id = v_order_id;
  end if;

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

-- =====================================================================
-- 4. public_store: hands the shop the counted stock from public.stock
-- =====================================================================
create or replace function public.public_store()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_data jsonb; v_at timestamptz; v_code text;
begin
  select s.data, s.updated_at into v_data, v_at from public.store s where s.id = 'main';
  if v_data is null then return null; end if;
  v_code := upper(coalesce(v_data->'newsletter'->>'couponCode', ''));
  v_data := v_data
    || jsonb_build_object('products', coalesce((select jsonb_agg(public._slim_product(p)) from jsonb_array_elements(coalesce(v_data->'products', '[]'::jsonb)) p
                                                 where coalesce(p->>'hidden', 'false') <> 'true'), '[]'::jsonb))
    || jsonb_build_object('promos', coalesce((select jsonb_agg(jsonb_build_object('id', p->'id', 'code', p->'code', 'type', p->'type', 'value', p->'value',
                                                 'minOrder', p->'minOrder', 'active', p->'active', 'startsAt', p->'startsAt', 'endsAt', p->'endsAt'))
                                               from jsonb_array_elements(coalesce(v_data->'promos', '[]'::jsonb)) p
                                              where v_code <> '' and upper(p->>'code') = v_code and coalesce(p->>'active', 'false') = 'true'), '[]'::jsonb));
  -- Small images only for the photos the light catalog still uses (the product page brings its own).
  v_data := jsonb_set(v_data, '{thumbs}', public._thumbs_for(v_data - 'thumbs', v_data->'thumbs'));
  -- Counted stock comes from public.stock, the one place it is kept.
  v_data := jsonb_set(v_data, '{inventory}', coalesce((select jsonb_object_agg(k.sku, k.qty) from public.stock k), '{}'::jsonb));
  return jsonb_build_object('data', v_data, 'updated_at', v_at);
end $$;
