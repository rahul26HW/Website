-- =====================================================================
-- Home Weavers — customer reviews
-- ---------------------------------------------------------------------
-- Where:  Supabase dashboard → SQL Editor → paste → Run (once)
-- Safe to run again: everything is create-if-not-exists or create-or-replace.
--
-- Only someone who bought the item can review it, and the check is made
-- here rather than in the browser: a review is written by a function that
-- first finds the order, confirms it belongs to that email address, and
-- confirms the item was actually in it. Nothing the page sends can talk
-- its way past that.
-- =====================================================================

create table if not exists public.reviews (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid references public.orders(id) on delete set null,
  order_number  text,
  product_id    text not null check (length(product_id) between 1 and 80),
  sku           text check (length(sku) <= 80),
  product_name  text check (length(product_name) <= 300),
  -- Kept so the shop can answer the reviewer. Never returned to the public page.
  email         text not null check (length(email) <= 254),
  -- What the shopper chose to be shown as, e.g. "Norrisa J." — not the full name on the order.
  name          text not null check (length(trim(name)) between 1 and 80),
  rating        smallint not null check (rating between 1 and 5),
  title         text check (length(title) <= 120),
  body          text check (length(body) <= 4000),
  photos        jsonb not null default '[]'::jsonb,
  -- New reviews wait for a person to look at them. See reviews.autoPublish in the admin.
  status        text not null default 'pending' check (status in ('pending','published','rejected')),
  reply         text check (length(reply) <= 2000),
  replied_at    timestamptz,
  admin_note    text check (length(admin_note) <= 2000),
  created_at    timestamptz not null default now(),
  published_at  timestamptz
);

-- One review per item per order: a second submission edits the first rather than adding to it.
create unique index if not exists reviews_one_per_item on public.reviews (order_id, product_id);
create index if not exists reviews_product_idx on public.reviews (product_id) where status = 'published';
create index if not exists reviews_status_idx  on public.reviews (status, created_at desc);
create index if not exists reviews_email_idx   on public.reviews (email);

alter table public.reviews enable row level security;

-- Marked when the "how did it go?" email goes out, so the scheduled job can tell who
-- has already been asked and nobody is asked twice.
alter table public.orders add column if not exists review_invited_at timestamptz;

drop policy if exists "admins read reviews"   on public.reviews;
drop policy if exists "admins update reviews" on public.reviews;
drop policy if exists "admins delete reviews" on public.reviews;
create policy "admins read reviews"   on public.reviews for select to authenticated using ((select public.is_admin()));
create policy "admins update reviews" on public.reviews for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins delete reviews" on public.reviews for delete to authenticated using ((select public.is_admin()));


-- ---------------------------------------------------------------------
-- Writing a review.
--
-- Called by the Edge Function once it knows which customer is signed in.
-- Every claim the browser makes is re-checked here against the order.
-- ---------------------------------------------------------------------
create or replace function public.file_review(
  p_email        text,
  p_order_number text,
  p_product_id   text,
  p_rating       int,
  p_name         text,
  p_title        text  default '',
  p_body         text  default '',
  p_photos       jsonb default '[]'::jsonb,
  p_auto         boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_email  text := lower(trim(coalesce(p_email, '')));
  v_order  public.orders%rowtype;
  v_item   public.order_items%rowtype;
  v_photos jsonb;
  v_status text;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'INVALID_RATING' using errcode = '22023';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'INVALID_NAME' using errcode = '22023';
  end if;

  select * into v_order from public.orders
   where order_number = trim(coalesce(p_order_number, '')) and lower(email) = v_email
   limit 1;
  if not found then
    raise exception 'NO_ORDER' using errcode = '22023';
  end if;

  -- Only once it has arrived. A carrier that never reports a delivery would otherwise
  -- lock the customer out of reviewing for good, so a week after it shipped also counts.
  if not (v_order.status = 'delivered'
          or (v_order.shipped_at is not null and v_order.shipped_at < now() - interval '7 days')) then
    raise exception 'NOT_DELIVERED' using errcode = '22023';
  end if;

  select * into v_item from public.order_items
   where order_id = v_order.id and product_id = trim(coalesce(p_product_id, ''))
   limit 1;
  if not found then
    raise exception 'NOT_IN_ORDER' using errcode = '22023';
  end if;

  -- Photographs are accepted only as paths inside this order's own folder, so a review
  -- can never be made to point at a file belonging to somebody else's order.
  select coalesce(jsonb_agg(value), '[]'::jsonb) into v_photos
    from (
      select value
        from jsonb_array_elements_text(coalesce(p_photos, '[]'::jsonb))
       where value ~ ('^' || v_order.id::text || '/[A-Za-z0-9._-]{1,80}$')
       limit 4
    ) kept;

  v_status := case when p_auto then 'published' else 'pending' end;

  insert into public.reviews (order_id, order_number, product_id, sku, product_name,
                              email, name, rating, title, body, photos, status, published_at)
  values (v_order.id, v_order.order_number, trim(p_product_id), v_item.sku, v_item.name,
          v_email, left(trim(p_name), 80), p_rating,
          nullif(left(trim(coalesce(p_title, '')), 120), ''),
          nullif(left(trim(coalesce(p_body, '')), 4000), ''),
          v_photos, v_status, case when p_auto then now() end)
  on conflict (order_id, product_id) do update
    set rating       = excluded.rating,
        name         = excluded.name,
        title        = excluded.title,
        body         = excluded.body,
        photos       = excluded.photos,
        -- An edited review goes back in the queue; the shop sees what it is publishing.
        status       = excluded.status,
        published_at = excluded.published_at,
        created_at   = now();

  return jsonb_build_object('ok', true, 'status', v_status);
end $$;


-- ---------------------------------------------------------------------
-- Reading reviews.
--
-- Public, and deliberately narrow: the display name, the stars and the
-- words. Never the email address, the order number or who else bought it.
-- ---------------------------------------------------------------------
create or replace function public.public_reviews(p_product_id text, p_limit int default 100)
returns jsonb language sql security definer stable set search_path = '' as $$
  with mine as (
    select name, rating, title, body, photos, reply, replied_at, created_at
      from public.reviews
     where product_id = trim(coalesce(p_product_id, '')) and status = 'published'
     order by created_at desc
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
        'photos', photos, 'reply', reply, 'repliedAt', replied_at, 'createdAt', created_at
      )) from mine), '[]'::jsonb)
  );
$$;

-- Every product that has a published review, for the stars on listing pages.
-- One small call the catalogue makes once, rather than one call per card.
create or replace function public.public_review_stats()
returns jsonb language sql security definer stable set search_path = '' as $$
  select coalesce(jsonb_object_agg(product_id, jsonb_build_object('n', n, 'avg', avg)), '{}'::jsonb)
    from (
      select product_id, count(*)::int as n, round(avg(rating)::numeric, 1) as avg
        from public.reviews
       where status = 'published'
       group by product_id
    ) s;
$$;


-- ---------------------------------------------------------------------
-- Privileges. Shoppers read through the two public functions and write
-- through file_review, which only the Edge Function may call.
-- ---------------------------------------------------------------------
revoke all on public.reviews from anon, authenticated;
grant select, update, delete on public.reviews to authenticated;   -- admins only, by policy
grant all on public.reviews to service_role;

revoke all on function public.file_review(text, text, text, int, text, text, text, jsonb, boolean) from anon, authenticated;
grant execute on function public.file_review(text, text, text, int, text, text, text, jsonb, boolean) to service_role;
grant execute on function public.public_reviews(text, int) to anon, authenticated, service_role;
grant execute on function public.public_review_stats() to anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- Storage bucket "reviews" — public read, written only through the
-- signed upload links the Edge Function hands out.
--
-- Photographs are re-drawn in the browser before they are sent, which
-- resizes them and drops the EXIF block along the way — so the location
-- a phone records in a photograph never reaches the shop at all.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reviews', 'reviews', true, 5242880, array['image/webp','image/jpeg','image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "reviews admins list"   on storage.objects;
drop policy if exists "reviews admins delete" on storage.objects;
create policy "reviews admins list"   on storage.objects for select to authenticated
  using (bucket_id = 'reviews' and (select public.is_admin()));
create policy "reviews admins delete" on storage.objects for delete to authenticated
  using (bucket_id = 'reviews' and (select public.is_admin()));


select 'Home Weavers reviews are ready' as status;
