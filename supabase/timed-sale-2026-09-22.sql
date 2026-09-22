-- Home Weavers — 2026-09-22b
-- Timed sale: an extra percentage off while the sale window is open, charged by the database as well as
-- shown in the shop, so a sale that has ended can't be bought at the old price.

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
  v_timed     jsonb;
  v_salecut   numeric := 0;
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

  -- A timed sale takes an extra percentage off while its window is open. The shop shows the same figure;
  -- this is what actually gets charged, so a sale that has ended can never be bought at the old price.
  v_timed := v_store->'sale';
  if coalesce(v_timed->>'enabled', 'false') = 'true'
     and coalesce(public._num(v_timed->>'percent'), 0) between 1 and 70
     and nullif(v_timed->>'startsAt', '') is not null and nullif(v_timed->>'endsAt', '') is not null then
    begin
      if now() >= (v_timed->>'startsAt')::timestamptz and now() < (v_timed->>'endsAt')::timestamptz then
        v_salecut := public._num(v_timed->>'percent');
      end if;
    exception when others then
      v_salecut := 0;   -- an unreadable date is simply no sale
    end;
  end if;

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
    -- The timed sale, if this product is in it.
    if v_salecut > 0 and (
         coalesce(v_timed->>'scope', 'all') = 'all'
         or (v_timed->>'scope' = 'categories' and coalesce(v_timed->'categoryIds', '[]'::jsonb) ? coalesce(v_prod->>'categoryId', ''))
         or (v_timed->>'scope' = 'products' and (coalesce(v_timed->'productIds', '[]'::jsonb) ? coalesce(v_prod->>'id', '')
                                                 or coalesce(v_timed->'productIds', '[]'::jsonb) ? coalesce(v_prod->>'slug', '')))) then
      v_unit := round(v_unit * (100 - v_salecut) / 100, 2);
    end if;
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
