-- =====================================================================
-- Business day for shop hours 4:00 PM → 4:00 AM (IST)
--
-- Rule: business_day = (IST timestamp − 16 hours)::date
--   Mon 4:00 PM  → Mon
--   Tue 3:00 AM  → Mon   (same night)
--   Tue 4:00 PM  → Tue   (new business day)
--
-- Billing / invoice due dates still use calendar today_ist().
-- Only orders / fees / "today's orders" RLS use business day.
-- =====================================================================

-- Business day for any timestamptz
create or replace function business_day_ist(p_ts timestamptz default now())
returns date
language sql
stable
as $$
  select ((p_ts at time zone 'Asia/Kolkata') - interval '16 hours')::date
$$;

-- "Today" as the shop sees it (current open/closed business day)
create or replace function today_business_ist()
returns date
language sql
stable
as $$
  select business_day_ist(now())
$$;

-- Backfill existing orders so history matches the new rule
update orders
   set order_date = business_day_ist(created_at)
 where order_date is distinct from business_day_ist(created_at);

-- Align usage fee dates with the order's business day where possible
update usage_fees f
   set fee_date = o.order_date
  from orders o
 where f.order_id = o.id
   and f.fee_date is distinct from o.order_date;

-- Default for new rows (table default)
alter table orders
  alter column order_date set default (business_day_ist(now()));

-- place_order: always stamp business day (parcel/jain version if present)
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
  v_day date := today_business_ist();
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

  insert into orders(shop_id, order_no, order_date, created_by, total, payment_status, payment_method, paid_at, is_parcel, is_jain)
  values (v_shop, v_no, v_day, auth.uid(), v_total,
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
    values (v_shop, v_id, v_item, v_no, v_day, it->>'name_en', v_qty, v_fee, round(v_qty * v_fee, 2));
  end loop;

  return jsonb_build_object('order_id', v_id, 'order_no', v_no, 'total', v_total, 'order_date', v_day);
end $$;

-- Staff RLS: "today" = business day
drop policy if exists orders_read on orders;
create policy orders_read on orders for select using (
  shop_id = my_shop_id() and can_use()
  and (my_role() = 'owner' or order_date = today_business_ist())
);

drop policy if exists order_items_read on order_items;
create policy order_items_read on order_items for select using (
  shop_id = my_shop_id() and can_use()
  and (my_role() = 'owner' or exists (
    select 1 from orders o where o.id = order_id and o.order_date = today_business_ist()
  ))
);

-- set_payment / update_order: staff limited to business-day orders
create or replace function set_payment(p_order uuid, p_method text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_shop_id() is null or not can_use() then raise exception 'Access disabled'; end if;
  if p_method is null and my_role() <> 'owner' then raise exception 'Only owner can undo payment'; end if;
  if p_method is not null and p_method not in ('cash','upi') then raise exception 'Bad payment method'; end if;
  update orders set
      payment_method = p_method,
      payment_status = case when p_method is null then 'unpaid' else 'paid' end,
      paid_at = case when p_method is null then null else now() end
   where id = p_order and shop_id = my_shop_id() and status = 'active'
     and (my_role() = 'owner' or order_date = today_business_ist());
  if not found then raise exception 'Order not found'; end if;
end $$;

-- daily_summary uses business day (already filters on order_date which is now business day)
create or replace function daily_summary_for_shop(p_shop uuid, p_day date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_day date := coalesce(p_day, today_business_ist());
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

  -- expenses: calendar date matching the business day label
  -- (expenses logged for "that night" should use the business day date)
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

grant execute on function business_day_ist(timestamptz) to authenticated;
grant execute on function today_business_ist() to authenticated;
