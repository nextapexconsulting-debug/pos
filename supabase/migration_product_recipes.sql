-- =====================================================================
-- Product recipes (BOM): e.g. Veg Sandwich = 2 bread slices
-- Reverse-check day usage vs sales. Safe: additive only.
-- =====================================================================

-- Optional: how many base units in one pack (e.g. bread pack = 16 slices)
alter table inventory_items
  add column if not exists pack_size numeric(12,3);

comment on column inventory_items.pack_size is
  'Optional. e.g. 16 means one commercial pack has 16 of unit (slices). For display only.';

-- Recipe lines: per 1 sale of product_code, consume qty of inventory item
create table if not exists product_recipes (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references shops(id) on delete cascade,
  product_code  text not null,
  item_id       uuid not null references inventory_items(id) on delete cascade,
  qty_per_sale  numeric(12,3) not null check (qty_per_sale > 0),
  created_at    timestamptz not null default now(),
  unique (shop_id, product_code, item_id)
);

create index if not exists product_recipes_shop_product
  on product_recipes(shop_id, product_code);

alter table product_recipes enable row level security;

drop policy if exists product_recipes_all on product_recipes;
create policy product_recipes_all on product_recipes for all
  using (shop_id = my_shop_id() and can_use())
  with check (shop_id = my_shop_id() and can_use());

-- List recipes for a product (or all if p_code null)
create or replace function list_product_recipes(p_code text default null)
returns table(
  id uuid,
  product_code text,
  item_id uuid,
  item_name text,
  item_unit text,
  pack_size numeric,
  qty_per_sale numeric
)
language sql stable security definer set search_path = public as $$
  select r.id, r.product_code, r.item_id, i.name, i.unit, i.pack_size, r.qty_per_sale
  from product_recipes r
  join inventory_items i on i.id = r.item_id
  where r.shop_id = my_shop_id()
    and (p_code is null or r.product_code = p_code)
  order by r.product_code, i.name;
$$;
grant execute on function list_product_recipes(text) to authenticated;

create or replace function upsert_product_recipe(
  p_code text,
  p_item_id uuid,
  p_qty numeric
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_shop uuid := my_shop_id();
  v_id uuid;
begin
  if v_shop is null or not can_use() then raise exception 'Access disabled'; end if;
  if p_code is null or length(trim(p_code)) = 0 then raise exception 'Product required'; end if;
  if p_item_id is null then raise exception 'Stock item required'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Qty must be > 0'; end if;

  insert into product_recipes(shop_id, product_code, item_id, qty_per_sale)
  values (v_shop, trim(p_code), p_item_id, p_qty)
  on conflict (shop_id, product_code, item_id) do update
    set qty_per_sale = excluded.qty_per_sale
  returning id into v_id;
  return v_id;
end $$;
grant execute on function upsert_product_recipe(text, uuid, numeric) to authenticated;

create or replace function delete_product_recipe(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if my_shop_id() is null or not can_use() then raise exception 'Access disabled'; end if;
  delete from product_recipes where id = p_id and shop_id = my_shop_id();
end $$;
grant execute on function delete_product_recipe(uuid) to authenticated;

-- Theoretical ingredient use from sales in a period
create or replace function report_recipe_usage(p_from date, p_to date)
returns table(
  item_id uuid,
  item_name text,
  unit text,
  pack_size numeric,
  theoretical_qty numeric,
  packs_equiv numeric
)
language sql stable security definer set search_path = public as $$
  with sold as (
    select oi.product_id as product_code, sum(oi.qty)::numeric as qty_sold
    from order_items oi
    join orders o on o.id = oi.order_id
    where o.shop_id = my_shop_id()
      and o.status = 'active'
      and o.order_date >= p_from
      and o.order_date <= p_to
    group by oi.product_id
  ),
  usage as (
    select r.item_id,
           sum(s.qty_sold * r.qty_per_sale) as theo
    from sold s
    join product_recipes r
      on r.shop_id = my_shop_id()
     and r.product_code = s.product_code
    group by r.item_id
  )
  select i.id,
         i.name,
         i.unit,
         i.pack_size,
         round(coalesce(u.theo, 0), 3),
         case
           when i.pack_size is not null and i.pack_size > 0
             then round(coalesce(u.theo, 0) / i.pack_size, 2)
           else null
         end
  from inventory_items i
  left join usage u on u.item_id = i.id
  where i.shop_id = my_shop_id() and i.active
    and (u.theo is not null and u.theo > 0)
  order by theo desc nulls last, i.name;
$$;
grant execute on function report_recipe_usage(date, date) to authenticated;

-- Compare theoretical vs stock movement for one day
create or replace function report_usage_check(p_day date)
returns table(
  item_id uuid,
  item_name text,
  unit text,
  pack_size numeric,
  theoretical_qty numeric,
  stock_used numeric,
  difference numeric,
  packs_theo numeric,
  packs_used numeric,
  note text
)
language sql stable security definer set search_path = public as $$
  with theo as (
    select item_id, theoretical_qty
    from report_recipe_usage(p_day, p_day)
  ),
  sheet as (
    select * from stock_sheet(p_day)
  )
  select
    coalesce(s.item_id, t.item_id) as item_id,
    coalesce(s.name, i.name) as item_name,
    coalesce(s.unit, i.unit) as unit,
    i.pack_size,
    round(coalesce(t.theoretical_qty, 0), 3) as theoretical_qty,
    case when s.used is null then null else round(s.used, 3) end as stock_used,
    case
      when s.used is null then null
      else round(s.used - coalesce(t.theoretical_qty, 0), 3)
    end as difference,
    case
      when i.pack_size is not null and i.pack_size > 0
        then round(coalesce(t.theoretical_qty, 0) / i.pack_size, 2)
      else null
    end as packs_theo,
    case
      when i.pack_size is not null and i.pack_size > 0 and s.used is not null
        then round(s.used / i.pack_size, 2)
      else null
    end as packs_used,
    case
      when s.used is null then 'No closing stock entered'
      when abs(s.used - coalesce(t.theoretical_qty, 0)) <= 0.5 then 'OK'
      when s.used > coalesce(t.theoretical_qty, 0) then 'Used more than recipes (waste / extra?)'
      else 'Used less than recipes (check counts or recipes)'
    end as note
  from sheet s
  full outer join theo t on t.item_id = s.item_id
  left join inventory_items i on i.id = coalesce(s.item_id, t.item_id)
  where coalesce(t.theoretical_qty, 0) > 0 or coalesce(s.used, 0) > 0
  order by abs(coalesce(s.used, 0) - coalesce(t.theoretical_qty, 0)) desc;
$$;
grant execute on function report_usage_check(date) to authenticated;

-- Set pack size on an inventory item
create or replace function set_item_pack_size(p_item uuid, p_pack numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if my_shop_id() is null or not can_use() then raise exception 'Access disabled'; end if;
  update inventory_items
     set pack_size = nullif(p_pack, 0)
   where id = p_item and shop_id = my_shop_id();
end $$;
grant execute on function set_item_pack_size(uuid, numeric) to authenticated;
