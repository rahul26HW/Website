-- =====================================================================
-- Home Weavers — live activity: who is looking, what just sold
-- ---------------------------------------------------------------------
-- Where:  Supabase dashboard → SQL Editor → paste → Run
-- Safe to run again: create-or-replace throughout.
--
-- Two reads for the product page, both from data the shop already has.
--
--   product_live_viewers  how many different visits are on this product
--                         right now. Counts visits, not people, because a
--                         visit is all the site knows.
--
--   recent_purchases      the last few real purchases, shop-wide, for the
--                         card that slides in from the corner.
--
-- Neither returns a name, an email, a city, an order number or an exact
-- time. A state and a coarse "how long ago" is the whole of it, which is
-- the same thing product_social_proof already says out loud.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. how many visits are on this product in the last few minutes
-- ---------------------------------------------------------------------
-- Five minutes is the window. Shorter and a page that is genuinely being
-- read stops counting; longer and "right now" stops being true.
create or replace function public.product_live_viewers(p_product_id text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct visit_id)::integer
  from public.events
  where kind = 'view'
    and product_id = p_product_id
    and at > now() - interval '5 minutes';
$$;

revoke all on function public.product_live_viewers(text) from public;
grant execute on function public.product_live_viewers(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. the last few purchases, shop-wide
-- ---------------------------------------------------------------------
-- Shop-wide on purpose: the card appears on every product page, and what
-- it reports is usually some other product. That is the point of it — a
-- quiet product still shows that the shop is alive.
create or replace function public.recent_purchases(p_limit integer default 8)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  -- One row per product, its most recent sale. Four orders of the same rug would
  -- otherwise fill the whole rotation with that rug, and the card is meant to show
  -- the shop, not one shelf of it.
  with latest as (
    select distinct on (i.product_id)
           i.product_id,
           nullif(upper(coalesce(o.shipping_address ->> 'state', '')), '') as state,
           o.created_at
    from public.order_items i
    join public.orders o on o.id = i.order_id
    where o.created_at > now() - interval '7 days'
      and o.status <> 'cancelled'
      and o.payment_status in ('paid', 'refunded')
    order by i.product_id, o.created_at desc
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'product_id', product_id,
             'state', state,
             -- Coarse on purpose. An exact minute plus a state narrows the field.
             'when', case
                       when created_at > now() - interval '1 hour'   then 'just now'
                       when created_at > now() - interval '6 hours'  then 'in the last few hours'
                       when created_at > now() - interval '24 hours' then 'today'
                       when created_at > now() - interval '48 hours' then 'yesterday'
                       else 'earlier this week'
                     end
           ) order by created_at desc
         ), '[]'::jsonb)
  from (
    select * from latest order by created_at desc
    limit least(greatest(coalesce(p_limit, 8), 1), 20)
  ) t;
$$;

revoke all on function public.recent_purchases(integer) from public;
grant execute on function public.recent_purchases(integer) to anon, authenticated, service_role;

-- Check:
--   select public.product_live_viewers('p_fantasia_singles');
--   select public.recent_purchases(8);
