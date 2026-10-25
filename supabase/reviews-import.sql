-- =====================================================================
-- Home Weavers — importing reviews written somewhere else
-- ---------------------------------------------------------------------
-- Where:  Supabase dashboard → SQL Editor → paste → Run
-- Safe to run again: every statement is if-not-exists or create-or-replace.
--
-- The reviews table was built for one thing: a customer who bought from
-- this shop reviewing what they bought. Hence email NOT NULL (so the shop
-- can reply), an order_id, and no way at all for an admin to insert a row.
--
-- Reviews collected on a marketplace are a different animal. Nobody here
-- can reply to them, there is no order in this database behind them, and
-- they were not written to this shop. Three changes let them in without
-- pretending they are the same thing:
--
--   source        where it was written. A review shown without that is
--                 passed off as something it is not, which is the whole
--                 difference between quoting and claiming.
--   email         no longer required, because an imported review has no
--                 address to reply to and a made-up one is worse than none.
--   insert policy admins can now add rows. They never could before.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. where the review came from
-- ---------------------------------------------------------------------
alter table public.reviews
  add column if not exists source text check (length(source) <= 60);

comment on column public.reviews.source is
  'Where the review was originally written — e.g. Amazon, Walmart. NULL means it was left on this site.';

-- An imported review has nobody to reply to.
alter table public.reviews alter column email drop not null;

-- ---------------------------------------------------------------------
-- 2. let an admin add one
-- ---------------------------------------------------------------------
drop policy if exists "admins insert reviews" on public.reviews;
create policy "admins insert reviews" on public.reviews for insert to authenticated
  with check ((select public.is_admin()));

grant insert on public.reviews to authenticated;   -- admins only, by policy

-- ---------------------------------------------------------------------
-- 3. say so on the page
-- ---------------------------------------------------------------------
-- The only change is 'source' in each item. Everything else is as it was.
drop function if exists public.public_reviews(text);

create or replace function public.public_reviews(p_product_id text, p_limit int default 100)
returns jsonb language sql security definer stable set search_path = '' as $$
  with mine as (
    select name, rating, title, body, photos, reply, replied_at, created_at, source
      from public.reviews
     where product_id = trim(coalesce(p_product_id, '')) and status = 'published'
     order by created_at desc
     limit greatest(1, least(coalesce(p_limit, 100), 200))
  ),
  stats as (
    select count(*)::int as n, round(avg(rating)::numeric, 2) as avg,
           count(*) filter (where rating = 5)::int as r5,
           count(*) filter (where rating = 4)::int as r4,
           count(*) filter (where rating = 3)::int as r3,
           count(*) filter (where rating = 2)::int as r2,
           count(*) filter (where rating = 1)::int as r1
      from public.reviews
     where product_id = trim(coalesce(p_product_id, '')) and status = 'published'
  )
  select jsonb_build_object(
    'count', (select n from stats),
    'average', (select avg from stats),
    'histogram', jsonb_build_object('5', (select r5 from stats), '4', (select r4 from stats),
                                    '3', (select r3 from stats), '2', (select r2 from stats),
                                    '1', (select r1 from stats)),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'name', name, 'rating', rating, 'title', title, 'body', body,
        'photos', photos, 'reply', reply, 'repliedAt', replied_at,
        'createdAt', created_at, 'source', source
      )) from mine), '[]'::jsonb)
  );
$$;

-- Check:
--   select public.public_reviews('p_willow_bath_towels');
