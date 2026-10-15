-- =====================================================================
-- Migration: Shop-based menu (products stored in DB, scoped by shop_id)
-- Run once in Supabase → SQL Editor.
-- Safe: does not touch orders or existing data.
-- =====================================================================

create table if not exists menu_products (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references shops(id) on delete cascade,
  product_code  text not null,                          -- stable id used in order_items.product_id
  name_en       text not null,
  name_gu       text not null default '',
  price         numeric(10,2) not null check (price >= 0),
  keywords      text[] not null default '{}',
  sort_order    int not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (shop_id, product_code)
);

create index if not exists menu_products_shop on menu_products(shop_id) where active;

alter table menu_products enable row level security;

drop policy if exists menu_products_read on menu_products;
create policy menu_products_read on menu_products for select
  using (shop_id = my_shop_id() and can_use());

drop policy if exists menu_products_write on menu_products;
create policy menu_products_write on menu_products for all
  using (shop_id = my_shop_id() and can_use() and my_role() in ('owner', 'staff'))
  with check (shop_id = my_shop_id() and can_use() and my_role() in ('owner', 'staff'));

-- List active products for current shop
create or replace function list_menu_products()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_shop uuid := my_shop_id();
begin
  if v_shop is null or not can_use() then raise exception 'Access disabled'; end if;
  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', product_code,
        'nameEn', name_en,
        'nameGu', name_gu,
        'price', price,
        'keywords', keywords
      ) order by sort_order, name_en
    )
    from menu_products
    where shop_id = v_shop and active
  ), '[]'::jsonb);
end $$;

-- Upsert one product (add or edit)
create or replace function upsert_menu_product(
  p_code text,
  p_name_en text,
  p_name_gu text,
  p_price numeric,
  p_keywords text[] default '{}'
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_shop uuid := my_shop_id();
begin
  if v_shop is null or not can_use() then raise exception 'Access disabled'; end if;
  if p_code is null or length(trim(p_code)) = 0 then raise exception 'Missing product code'; end if;
  if p_name_en is null or length(trim(p_name_en)) = 0 then raise exception 'English name required'; end if;
  if p_price is null or p_price < 0 then raise exception 'Invalid price'; end if;

  insert into menu_products (shop_id, product_code, name_en, name_gu, price, keywords, updated_at)
  values (v_shop, trim(p_code), trim(p_name_en), coalesce(trim(p_name_gu), ''), p_price,
          coalesce(p_keywords, '{}'), now())
  on conflict (shop_id, product_code) do update set
    name_en = excluded.name_en,
    name_gu = excluded.name_gu,
    price = excluded.price,
    keywords = excluded.keywords,
    active = true,
    updated_at = now();

  return jsonb_build_object('ok', true, 'id', trim(p_code));
end $$;

-- Soft-delete one product
create or replace function delete_menu_product(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare v_shop uuid := my_shop_id();
begin
  if v_shop is null or not can_use() then raise exception 'Access disabled'; end if;
  update menu_products set active = false, updated_at = now()
   where shop_id = v_shop and product_code = p_code;
end $$;

-- Replace entire menu (import / reset). p_items: [{id, nameEn, nameGu, price, keywords}, ...]
create or replace function replace_menu_products(p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_shop uuid := my_shop_id();
  it jsonb;
  i int := 0;
  v_code text;
begin
  if v_shop is null or not can_use() then raise exception 'Access disabled'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'Expected array'; end if;

  -- deactivate all current
  update menu_products set active = false, updated_at = now() where shop_id = v_shop;

  for it in select * from jsonb_array_elements(p_items) loop
    v_code := coalesce(nullif(trim(it->>'id'), ''), nullif(trim(it->>'product_code'), ''));
    if v_code is null then
      v_code := lower(regexp_replace(coalesce(it->>'nameEn', it->>'name_en', 'item'), '[^a-z0-9]+', '-', 'g'));
      v_code := trim(both '-' from v_code);
      if v_code = '' then v_code := 'item-' || i::text; end if;
    end if;

    insert into menu_products (shop_id, product_code, name_en, name_gu, price, keywords, sort_order, active, updated_at)
    values (
      v_shop,
      v_code,
      coalesce(nullif(trim(it->>'nameEn'), ''), nullif(trim(it->>'name_en'), ''), v_code),
      coalesce(nullif(trim(it->>'nameGu'), ''), nullif(trim(it->>'name_gu'), ''), ''),
      coalesce((it->>'price')::numeric, 0),
      case
        when jsonb_typeof(it->'keywords') = 'array' then
          array(select jsonb_array_elements_text(it->'keywords'))
        else '{}'::text[]
      end,
      i,
      true,
      now()
    )
    on conflict (shop_id, product_code) do update set
      name_en = excluded.name_en,
      name_gu = excluded.name_gu,
      price = excluded.price,
      keywords = excluded.keywords,
      sort_order = excluded.sort_order,
      active = true,
      updated_at = now();

    i := i + 1;
  end loop;

  return jsonb_build_object('ok', true, 'count', i);
end $$;

grant execute on function list_menu_products() to authenticated;
grant execute on function upsert_menu_product(text, text, text, numeric, text[]) to authenticated;
grant execute on function delete_menu_product(text) to authenticated;
grant execute on function replace_menu_products(jsonb) to authenticated;
