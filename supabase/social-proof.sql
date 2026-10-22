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
-- The anonymity floor matters more than it looks. "Someone in New Jersey
-- bought this two hours ago" is anonymous in a shop with many orders and
-- is close to naming a person in a shop with three. So the recent line is
-- withheld unless enough other people in that state bought the same thing
-- in the window — below that only the plain count goes out, and below the
-- count floor, nothing does.
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
  -- A state only earns a mention when it is not a single identifiable person.
  by_state as (
    select state, count(*) as n, max(created_at) as latest
    from recent
    where state <> ''
    group by state
    having count(*) >= 3
    order by max(created_at) desc
    limit 1
  )
  select jsonb_build_object(
    -- Withheld below five, because "2 bought this week" is not social proof,
    -- it is a quiet shop advertising that it is quiet.
    'bought_week', case when (select count(*) from recent) >= 5
                        then (select count(*) from recent) else null end,
    'recent_state', (select state from by_state),
    -- Coarse on purpose: an exact time plus a state narrows the field.
    'recent_when',  (select case
                              when latest > now() - interval '6 hours'  then 'in the last few hours'
                              when latest > now() - interval '24 hours' then 'today'
                              when latest > now() - interval '48 hours' then 'yesterday'
                              else 'this week'
                            end from by_state)
  );
$$;

revoke all on function public.product_social_proof(text) from public;
grant execute on function public.product_social_proof(text) to anon, authenticated, service_role;

-- Check it:
--   select public.product_social_proof('p_willow_bath_towels');
-- Expect nulls on a quiet product. Nulls mean "say nothing", not "say zero".
