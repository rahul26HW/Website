-- =====================================================================
-- Home Weavers — social proof from real orders
-- ---------------------------------------------------------------------
-- Where:  Supabase dashboard → SQL Editor → paste → Run
-- Safe to run again: create-or-replace throughout.
--
-- What a shopper is told comes from orders that actually happened. What
-- they are never told is who placed them. This function returns a count
-- and a state, and nothing else: no name, no city, no email, no order
-- number, no exact timestamp.
--
-- There were floors here: five buyers before a count was shown, three in
-- one state before the state line was. The shop owner removed them on
-- 2026-10-24 so the badges speak from the first sale onward. What is said
-- is still true and still unnamed — no name, city, email, order number or
-- exact time — but a single purchase is now reported as one, and a state
-- with one buyer in it is a smaller crowd to hide in than three. The
-- floors are the two "count(*) >= 1" tests below; raise them to restore.
-- =====================================================================

create or replace function public.product_social_proof(p_product_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with recent as (
    select o.created_at,
           upper(coalesce(o.shipping_address ->> 'state', '')) as state
    from public.order_items i
    join public.orders o on o.id = i.order_id
    where i.product_id = p_product_id
      and o.created_at > now() - interval '7 days'
      and o.status <> 'cancelled'
      and o.payment_status in ('paid', 'refunded')
  ),
  -- The most recent state to have bought this, and roughly when.
  by_state as (
    select state, count(*) as n, max(created_at) as latest
    from recent
    where state <> ''
    group by state
    having count(*) >= 1
    order by max(created_at) desc
    limit 1
  )
  select jsonb_build_object(
    -- Floor of one: every real sale counts, the first one included.
    'bought_week', case when (select count(*) from recent) >= 1
                        then (select count(*) from recent) else null end,
    'recent_state', (select state from by_state),
    -- Coarse on purpose: an exact time plus a state narrows the field.
    'recent_when',  (select case
                              when latest > now() - interval '6 hours'  then 'in the last few hours'
                              when latest > now() - interval '24 hours' then 'today'
                              when latest > now() - interval '48 hours' then 'yesterday'
                              else 'earlier this week'
                            end from by_state)
  );
$$;

revoke all on function public.product_social_proof(text) from public;
grant execute on function public.product_social_proof(text) to anon, authenticated, service_role;

-- Check it:
--   select public.product_social_proof('p_willow_bath_towels');
-- Expect nulls on a quiet product. Nulls mean "say nothing", not "say zero".
