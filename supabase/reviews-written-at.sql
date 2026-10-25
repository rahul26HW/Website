-- =====================================================================
-- Home Weavers — when a review was actually written
-- ---------------------------------------------------------------------
-- Where:  Supabase dashboard → SQL Editor → paste → Run
-- Safe to run again.
--
-- created_at is when the row was made, which for an imported review is the
-- day it was imported. Showing that as the review date told every JCPenney
-- review it was written today, all twelve of them, within a minute of each
-- other. Obviously untrue to anyone reading the page.
--
-- Some portals publish a date and some do not. written_at holds it when we
-- have it and stays NULL when we do not, and the page shows nothing rather
-- than inventing something. created_at keeps doing its own job: ordering.
-- =====================================================================

alter table public.reviews
  add column if not exists written_at timestamptz;

comment on column public.reviews.written_at is
  'When the review was written, where that is known. NULL means the source did not publish a date — show no date rather than guessing.';

-- A review left on this site was written the day it arrived.
update public.reviews
   set written_at = created_at
 where written_at is null and source is null;

create or replace function public.public_reviews(p_product_id text, p_limit int default 100)
returns jsonb language sql security definer stable set search_path = '' as $$
  with mine as (
    select name, rating, title, body, photos, reply, replied_at, created_at, source, written_at
      from public.reviews
     where product_id = trim(coalesce(p_product_id, '')) and status = 'published'
     order by coalesce(written_at, created_at) desc
     limit greatest(1, least(coalesce(p_limit, 100), 200))
  ), stats as (
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
        'createdAt', created_at, 'source', source, 'writtenAt', written_at
      )) from mine), '[]'::jsonb)
  );
$$;

revoke all on function public.public_reviews(text, int) from public;
grant execute on function public.public_reviews(text, int) to anon, authenticated, service_role;

-- The twelve already imported with no date of their own: clear the stamp so
-- the page stops claiming they were written on the day they were loaded.
update public.reviews
   set written_at = null
 where source is not null
   and written_at is null;

-- Check:
--   select source, count(*), count(written_at) as with_a_date
--     from public.reviews group by source;
