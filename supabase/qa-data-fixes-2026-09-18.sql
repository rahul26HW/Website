-- QA audit 2026-09-18: catalog data fixes (BUG-002, 007, 009, 023, 025, 043, 055, 060, 061, 089)
do $$
declare
  d jsonb; p jsonb; o jsonb; val jsonb; k text; i int; j int; n int;
  hex jsonb := '{
    "p_ulevxg": {"Blue":"#7A9CC0","Pink":"#E9B7BD","Linen":"#E7DDCB","Aqua":"#7CC7C0"},
    "p_yp9jnq": {"Blue":"#5E86B5","Coral":"#F08C73","Beige":"#D8C6A6","Gray":"#9EA3A8","Pink":"#E8A9B4","Purple":"#9B86B8","Sage":"#9CAF94","Turquoise":"#3FBDB8"}
  }';
  feat text[] := array['p_a0dfz8','p_ulevxg','p_yp9jnq','p_nyggvz'];
  ws text := ' ' || chr(10) || chr(13) || chr(9);
begin
  select data into d from public.store where id = 'main' for update;
  if d is null then raise exception 'store row main not found'; end if;

  for i in 0 .. jsonb_array_length(d->'products') - 1 loop
    p := d->'products'->i;
    -- 061: one spelling of the origin, no stray quotes, typos
    p := jsonb_set(p, '{origin}', '"India"');
    if p ? 'care' then
      p := jsonb_set(p, '{care}', to_jsonb(btrim(replace(p->>'care', 'Seperately', 'Separately'), ws)));
    end if;
    if p ? 'description' then
      p := jsonb_set(p, '{description}', to_jsonb(regexp_replace(btrim(p->>'description', ws), '^"(.*)"$', '\1')));
    end if;
    if p ? 'features' then
      p := jsonb_set(p, '{features}', replace((p->'features')::text,
        '"Zero twist both side, Super Absorbent, Super Soft"', '"Zero-twist yarn on both sides: super absorbent and super soft"')::jsonb);
    end if;
    -- 025: material says what it is (no unverified "long-staple")
    if p->>'material' ilike '%long-staple cotton%' then p := jsonb_set(p, '{material}', '"100% cotton"'); end if;
    if p->>'material' ilike '100% polyester' then p := jsonb_set(p, '{material}', '"100% polyester microfiber"'); end if;
    -- 028: Impression description was one sentence split into bullets
    if p->>'id' = 'p_a0dfz8' then
      p := jsonb_set(p, '{description}', '"<p>Crafted from high-quality microfiber, the thick high-pile surface is soft and luxurious.</p>"');
    end if;
    -- 055: four featured products
    p := jsonb_set(p, '{featured}', to_jsonb(p->>'id' = any(feat)));
    -- 023: swatch colours that match their names
    if hex ? (p->>'id') and jsonb_typeof(p->'options') = 'array' then
      for j in 0 .. jsonb_array_length(p->'options') - 1 loop
        o := p->'options'->j;
        if o->>'type' = 'color' then
          for n in 0 .. jsonb_array_length(o->'values') - 1 loop
            val := o->'values'->n;
            if (hex->(p->>'id')) ? (val->>'label') then
              p := jsonb_set(p, array['options', j::text, 'values', n::text, 'hex'], hex->(p->>'id')->(val->>'label'));
            end if;
          end loop;
        end if;
      end loop;
    end if;
    -- 002: Blue Gradiation had $10.99 on every size; use the size prices like the other colours
    if p->>'id' = 'p_yp9jnq' then
      for k in select jsonb_object_keys(p->'variants') loop
        if k like 'cl_fcdpsz__%' then p := p #- array['variants', k, 'price']; end if;
      end loop;
    end if;
    d := jsonb_set(d, array['products', i::text], p);
  end loop;

  -- 009 / 025: homepage highlights that match the products and the refund policy
  d := jsonb_set(d, '{features}', '[
    {"title":"Machine washable","body":"Every rug and towel goes in the washing machine. See the Care tab on each product.","image":""},
    {"title":"Made in India","body":"Cotton towels and cotton or microfiber rugs, made in India.","image":""},
    {"title":"30-day returns","body":"Not right? Return it unused within 30 days of delivery. See our refund policy.","image":""}
  ]');
  for i in 0 .. jsonb_array_length(d->'pages') - 1 loop
    if d->'pages'->i->>'slug' = 'sustainability' then
      d := jsonb_set(d, array['pages', i::text, 'body'], to_jsonb(
        'We choose durable materials — cotton for our towels, cotton or microfiber for our rugs — and partner with mills that share our standards for water, energy, and fair labor.' || chr(10) || chr(10) ||
        'Our packaging is recyclable, and machine-washable pieces are made to be used for years.'::text));
    end if;
  end loop;

  -- 060: consistent capitalisation
  d := jsonb_set(d, '{categories}', replace((d->'categories')::text, '"Bath rugs"', '"Bath Rugs"')::jsonb);

  -- 007: the newsletter code is once per customer
  for i in 0 .. jsonb_array_length(d->'promos') - 1 loop
    if upper(d->'promos'->i->>'code') = 'WELCOME15' then
      d := jsonb_set(d, array['promos', i::text, 'oncePerCustomer'], 'true');
    end if;
  end loop;

  -- 043: stock row of the deleted test product
  d := d #- '{inventory,QA-TEST-001}';

  -- 089: the bar follows the threshold set in Promotions
  d := jsonb_set(d, '{announcement}', '"Free shipping on orders of {{free_shipping}} or more"');

  update public.store set data = d where id = 'main';
end $$;

select jsonb_array_length(data->'products') as products,
       (select count(*) from jsonb_array_elements(data->'products') x where (x->>'featured')::boolean) as featured,
       (select count(*) from jsonb_array_elements(data->'products') x where x->>'description' like '"%') as quoted_left,
       data->>'announcement' as announcement,
       (select x->>'oncePerCustomer' from jsonb_array_elements(data->'promos') x where x->>'code' = 'WELCOME15') as welcome_once,
       data->'inventory' ? 'QA-TEST-001' as orphan_left,
       updated_at
  from public.store where id = 'main';
