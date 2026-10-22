-- =====================================================================
-- V2 features: customers, default expenses, shop settings, low stock
-- Safe for existing data — only ADD columns/tables, no destructive updates
-- =====================================================================

-- 1) Ensure expenses.spread_days exists (fixes schema cache error)
alter table expenses
  add column if not exists spread_days int not null default 1
  check (spread_days between 1 and 366);

-- 2) Customers
create table if not exists customers (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references shops(id) on delete cascade,
  name       text not null,
  mobile     text not null,
  notes      text,
  created_at timestamptz not null default now(),
  unique (shop_id, mobile)
);
create index if not exists customers_shop_mobile on customers(shop_id, mobile);
alter table customers enable row level security;
drop policy if exists customers_shop on customers;
create policy customers_shop on customers for all
  using (shop_id = my_shop_id() and can_use())
  with check (shop_id = my_shop_id() and can_use());

-- Link orders → customer (nullable so old orders unchanged)
alter table orders add column if not exists customer_id uuid references customers(id) on delete set null;
alter table orders add column if not exists customer_name text;
alter table orders add column if not exists customer_mobile text;
create index if not exists orders_customer on orders(shop_id, customer_id);

-- 3) Shop settings (theme, notify, default rent/electricity, low stock)
create table if not exists shop_settings (
  shop_id              uuid primary key references shops(id) on delete cascade,
  theme                text not null default 'sunset_orange',
  notify_new_order     boolean not null default true,
  rent_monthly         numeric(12,2) not null default 25000,
  electricity_monthly  numeric(12,2) not null default 5000,
  low_stock_threshold  numeric(12,2) not null default 2,
  updated_at           timestamptz not null default now()
);
alter table shop_settings enable row level security;
drop policy if exists shop_settings_owner on shop_settings;
create policy shop_settings_owner on shop_settings for all
  using (shop_id = my_shop_id() and my_role() in ('owner','staff') and can_use())
  with check (shop_id = my_shop_id() and my_role() in ('owner','staff') and can_use());

-- Auto-create settings row for each shop
create or replace function ensure_shop_settings() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into shop_settings(shop_id) values (new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists shops_settings on shops;
create trigger shops_settings after insert on shops
  for each row execute function ensure_shop_settings();

-- Backfill settings for existing shops
insert into shop_settings(shop_id)
select id from shops
on conflict do nothing;

-- 4) Upsert customer by mobile and return id
create or replace function upsert_customer(
  p_name text,
  p_mobile text,
  p_notes text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_shop uuid := my_shop_id();
  v_id uuid;
  v_name text := nullif(trim(p_name), '');
  v_mobile text := nullif(regexp_replace(coalesce(p_mobile,''), '[^0-9+]', '', 'g'), '');
begin
  if v_shop is null or not can_use() then raise exception 'Access disabled'; end if;
  if v_mobile is null or length(v_mobile) < 8 then
    return null; -- optional customer
  end if;
  if v_name is null then v_name := v_mobile; end if;

  insert into customers(shop_id, name, mobile, notes)
  values (v_shop, v_name, v_mobile, nullif(trim(p_notes), ''))
  on conflict (shop_id, mobile) do update
    set name = excluded.name,
        notes = coalesce(excluded.notes, customers.notes)
  returning id into v_id;
  return v_id;
end $$;
grant execute on function upsert_customer(text, text, text) to authenticated;

-- 5) Extend place_order with optional customer (keeps old signature working via defaults)
create or replace function place_order(
  p_items jsonb,
  p_payment text default null,
  p_is_parcel boolean default false,
  p_is_jain boolean default false,
  p_customer_name text default null,
  p_customer_mobile text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_shop uuid := my_shop_id(); v_fee numeric; v_no int; v_id uuid; v_total numeric := 0;
  it jsonb; v_item uuid; v_qty int; v_price numeric;
  v_day date;
  v_cust uuid;
  v_cname text := nullif(trim(coalesce(p_customer_name,'')), '');
  v_cmobile text := nullif(regexp_replace(coalesce(p_customer_mobile,''), '[^0-9+]', '', 'g'), '');
begin
  if v_shop is null or not can_use() then raise exception 'Access disabled'; end if;
  if p_payment is not null and p_payment not in ('cash','upi') then raise exception 'Bad payment method'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Empty order'; end if;

  -- business day if function exists, else calendar IST
  begin
    v_day := today_business_ist();
  exception when others then
    v_day := (now() at time zone 'Asia/Kolkata')::date;
  end;

  if v_cmobile is not null then
    v_cust := upsert_customer(coalesce(v_cname, v_cmobile), v_cmobile, null);
  end if;

  update shops set next_order_no = next_order_no + 1 where id = v_shop
    returning next_order_no - 1, fee_per_item into v_no, v_fee;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::int; v_price := (it->>'price')::numeric;
    if v_qty <= 0 or v_price < 0 then raise exception 'Bad item'; end if;
    v_total := v_total + v_qty * v_price;
  end loop;

  insert into orders(
    shop_id, order_no, order_date, created_by, total,
    payment_status, payment_method, paid_at,
    is_parcel, is_jain, customer_id, customer_name, customer_mobile
  )
  values (
    v_shop, v_no, v_day, auth.uid(), v_total,
    case when p_payment is null then 'unpaid' else 'paid' end, p_payment,
    case when p_payment is null then null else now() end,
    coalesce(p_is_parcel, false), coalesce(p_is_jain, false),
    v_cust, v_cname, v_cmobile
  )
  returning id into v_id;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::int; v_price := (it->>'price')::numeric;
    insert into order_items(order_id, shop_id, product_id, name_en, name_gu, category, price, qty)
    values (v_id, v_shop, it->>'product_id', it->>'name_en', it->>'name_gu', it->>'category', v_price, v_qty)
    returning id into v_item;
    insert into usage_fees(shop_id, order_id, order_item_id, order_no, fee_date, product_name, qty, rate, amount)
    values (v_shop, v_id, v_item, v_no, v_day, it->>'name_en', v_qty, v_fee, round(v_qty * v_fee, 2));
  end loop;

  return jsonb_build_object(
    'order_id', v_id, 'order_no', v_no, 'total', v_total, 'order_date', v_day,
    'customer_id', v_cust
  );
end $$;

-- 6) Apply default daily rent + electricity for a day (idempotent)
create or replace function apply_default_daily_expenses(p_day date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_shop uuid := my_shop_id();
  v_day date := coalesce(p_day, (
    select case when to_regprocedure('today_business_ist()') is not null
      then today_business_ist() else (now() at time zone 'Asia/Kolkata')::date end
  ));
  v_rent numeric; v_elec numeric;
  v_days int;
  v_rent_day numeric; v_elec_day numeric;
  v_note text;
begin
  if v_shop is null or not can_use() then raise exception 'Access disabled'; end if;
  select rent_monthly, electricity_monthly into v_rent, v_elec
    from shop_settings where shop_id = v_shop;
  if v_rent is null then
    insert into shop_settings(shop_id) values (v_shop) on conflict do nothing;
    select rent_monthly, electricity_monthly into v_rent, v_elec
      from shop_settings where shop_id = v_shop;
  end if;

  v_days := extract(day from (date_trunc('month', v_day) + interval '1 month - 1 day'))::int;
  if v_days < 1 then v_days := 30; end if;
  v_rent_day := round(coalesce(v_rent,0) / v_days, 2);
  v_elec_day := round(coalesce(v_elec,0) / v_days, 2);
  v_note := 'Auto daily share (' || to_char(v_day, 'Mon YYYY') || ', ' || v_days || ' days)';

  -- Only insert if not already present for this day (idempotent)
  if v_rent_day > 0 and not exists (
    select 1 from expenses where shop_id = v_shop and expense_date = v_day
      and category = 'Rent' and source = 'manual' and note like 'Auto daily share%'
  ) then
    insert into expenses(shop_id, expense_date, category, note, amount, spread_days, source, created_by)
    values (v_shop, v_day, 'Rent', v_note, v_rent_day, 1, 'manual', auth.uid());
  end if;

  if v_elec_day > 0 and not exists (
    select 1 from expenses where shop_id = v_shop and expense_date = v_day
      and category = 'Electricity' and source = 'manual' and note like 'Auto daily share%'
  ) then
    insert into expenses(shop_id, expense_date, category, note, amount, spread_days, source, created_by)
    values (v_shop, v_day, 'Electricity', v_note, v_elec_day, 1, 'manual', auth.uid());
  end if;

  return jsonb_build_object(
    'day', v_day, 'days_in_month', v_days,
    'rent_daily', v_rent_day, 'electricity_daily', v_elec_day
  );
end $$;
grant execute on function apply_default_daily_expenses(date) to authenticated;

-- 7) Low stock check
create or replace function low_stock_items()
returns table(item_id uuid, name text, unit text, remaining numeric, threshold numeric)
language sql stable security definer set search_path = public as $$
  with s as (
    select shop_id, coalesce(low_stock_threshold, 2) as thr
    from shop_settings where shop_id = my_shop_id()
  ),
  latest as (
    select distinct on (c.item_id) c.item_id, c.closing_qty, c.count_date
    from stock_counts c
    where c.shop_id = my_shop_id()
    order by c.item_id, c.count_date desc
  )
  select i.id, i.name, i.unit,
         coalesce(l.closing_qty, 0)::numeric as remaining,
         s.thr
  from inventory_items i
  cross join s
  left join latest l on l.item_id = i.id
  where i.shop_id = my_shop_id() and i.active
    and coalesce(l.closing_qty, 0) <= s.thr
  order by remaining, i.name;
$$;
grant execute on function low_stock_items() to authenticated;

-- 8) Customer report helpers
create or replace function report_customers(p_from date default null, p_to date default null)
returns table(
  customer_id uuid, name text, mobile text,
  orders bigint, total numeric, last_order date
)
language sql stable security definer set search_path = public as $$
  select
    c.id,
    c.name,
    c.mobile,
    count(o.id)::bigint,
    coalesce(sum(o.total) filter (where o.status = 'active'), 0),
    max(o.order_date) filter (where o.status = 'active')
  from customers c
  left join orders o on o.customer_id = c.id
    and (p_from is null or o.order_date >= p_from)
    and (p_to is null or o.order_date <= p_to)
  where c.shop_id = my_shop_id()
  group by c.id, c.name, c.mobile
  order by coalesce(sum(o.total) filter (where o.status = 'active'), 0) desc nulls last,
           c.name;
$$;
grant execute on function report_customers(date, date) to authenticated;
