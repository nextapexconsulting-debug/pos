-- =====================================================================
-- Migration: Parcel (P), Jain (J) flags + editable orders
-- Run once in Supabase → SQL Editor after the base schema.
-- =====================================================================

-- 1. Add flags to orders
alter table orders add column if not exists is_parcel boolean not null default false;
alter table orders add column if not exists is_jain   boolean not null default false;

-- 2. Updated place_order (accepts optional parcel/jain)
create or replace function place_order(
  p_items jsonb,
  p_payment text default null,
  p_is_parcel boolean default false,
  p_is_jain boolean default false
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_shop uuid := my_shop_id(); v_fee numeric; v_no int; v_id uuid; v_total numeric := 0;
  it jsonb; v_item uuid; v_qty int; v_price numeric;
begin
  if v_shop is null or not can_use() then raise exception 'Access disabled'; end if;
  if p_payment is not null and p_payment not in ('cash','upi') then raise exception 'Bad payment method'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Empty order'; end if;

  update shops set next_order_no = next_order_no + 1 where id = v_shop
    returning next_order_no - 1, fee_per_item into v_no, v_fee;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::int; v_price := (it->>'price')::numeric;
    if v_qty <= 0 or v_price < 0 then raise exception 'Bad item'; end if;
    v_total := v_total + v_qty * v_price;
  end loop;

  insert into orders(shop_id, order_no, created_by, total, payment_status, payment_method, paid_at, is_parcel, is_jain)
  values (v_shop, v_no, auth.uid(), v_total,
          case when p_payment is null then 'unpaid' else 'paid' end, p_payment,
          case when p_payment is null then null else now() end,
          coalesce(p_is_parcel, false), coalesce(p_is_jain, false))
  returning id into v_id;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::int; v_price := (it->>'price')::numeric;
    insert into order_items(order_id, shop_id, product_id, name_en, name_gu, category, price, qty)
    values (v_id, v_shop, it->>'product_id', it->>'name_en', it->>'name_gu', it->>'category', v_price, v_qty)
    returning id into v_item;
    insert into usage_fees(shop_id, order_id, order_item_id, order_no, fee_date, product_name, qty, rate, amount)
    values (v_shop, v_id, v_item, v_no, today_ist(), it->>'name_en', v_qty, v_fee, round(v_qty * v_fee, 2));
  end loop;

  return jsonb_build_object('order_id', v_id, 'order_no', v_no, 'total', v_total);
end $$;

-- 3. update_order – replace items + flags on an existing active order
create or replace function update_order(
  p_order uuid,
  p_items jsonb,
  p_is_parcel boolean default false,
  p_is_jain boolean default false
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_shop uuid := my_shop_id(); v_fee numeric; v_total numeric := 0;
  it jsonb; v_item uuid; v_qty int; v_price numeric; v_no int;
begin
  if v_shop is null or not can_use() then raise exception 'Access disabled'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Empty order'; end if;

  select order_no into v_no from orders
   where id = p_order and shop_id = v_shop and status = 'active'
     and (my_role() = 'owner' or order_date = today_ist());
  if not found then raise exception 'Order not found or not editable'; end if;

  select fee_per_item into v_fee from shops where id = v_shop;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::int; v_price := (it->>'price')::numeric;
    if v_qty <= 0 or v_price < 0 then raise exception 'Bad item'; end if;
    v_total := v_total + v_qty * v_price;
  end loop;

  -- void old usage fees that are not yet invoiced
  update usage_fees set voided = true
   where order_id = p_order and invoice_id is null;

  delete from order_items where order_id = p_order;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::int; v_price := (it->>'price')::numeric;
    insert into order_items(order_id, shop_id, product_id, name_en, name_gu, category, price, qty)
    values (p_order, v_shop, it->>'product_id', it->>'name_en', it->>'name_gu', it->>'category', v_price, v_qty)
    returning id into v_item;
    insert into usage_fees(shop_id, order_id, order_item_id, order_no, fee_date, product_name, qty, rate, amount)
    values (v_shop, p_order, v_item, v_no, today_ist(), it->>'name_en', v_qty, v_fee, round(v_qty * v_fee, 2));
  end loop;

  update orders set
    total = v_total,
    is_parcel = coalesce(p_is_parcel, false),
    is_jain = coalesce(p_is_jain, false)
  where id = p_order;

  return jsonb_build_object('order_id', p_order, 'order_no', v_no, 'total', v_total);
end $$;

-- 4. Helper for daily summary (used by cron)
create or replace function daily_summary_for_shop(p_shop uuid, p_day date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_day date := coalesce(p_day, today_ist());
  v_sales numeric; v_orders bigint; v_cash numeric; v_upi numeric; v_unpaid numeric;
  v_expenses numeric; v_name text;
begin
  select name into v_name from shops where id = p_shop;
  select
    coalesce(sum(total) filter (where status = 'active'), 0),
    count(*) filter (where status = 'active'),
    coalesce(sum(total) filter (where status = 'active' and payment_method = 'cash'), 0),
    coalesce(sum(total) filter (where status = 'active' and payment_method = 'upi'), 0),
    coalesce(sum(total) filter (where status = 'active' and payment_status = 'unpaid'), 0)
  into v_sales, v_orders, v_cash, v_upi, v_unpaid
  from orders where shop_id = p_shop and order_date = v_day;

  select coalesce(sum(amount), 0) into v_expenses
  from expenses where shop_id = p_shop and expense_date = v_day;

  return jsonb_build_object(
    'shop_name', v_name,
    'day', v_day,
    'orders', v_orders,
    'sales', v_sales,
    'cash', v_cash,
    'upi', v_upi,
    'unpaid', v_unpaid,
    'expenses', v_expenses,
    'profit', v_sales - v_expenses
  );
end $$;
