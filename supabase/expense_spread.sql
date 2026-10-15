-- Run once in Supabase → SQL Editor.
-- Lets an expense be spread over N days in the profit reports
-- (e.g. bread bought for 5 days, or a monthly salary spread over 30 days).

alter table expenses         add column if not exists spread_days int not null default 1 check (spread_days between 1 and 366);
alter table archive_expenses add column if not exists spread_days int not null default 1;

create or replace function daily_live(p_shop uuid, p_from date, p_to date)
returns table(day date, orders bigint, items bigint, sales numeric, cash numeric, upi numeric,
              unpaid numeric, expenses numeric, profit numeric)
language sql stable as $$
  with d as (select g::date as day from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') g),
  o as (select order_date as day, count(*) n, sum(total) sales,
          coalesce(sum(total) filter (where payment_method = 'cash'),0) cash,
          coalesce(sum(total) filter (where payment_method = 'upi'),0) upi,
          coalesce(sum(total) filter (where payment_status = 'unpaid'),0) unpaid
        from orders where shop_id = p_shop and status = 'active' and order_date between p_from and p_to group by 1),
  i as (select o.order_date as day, sum(oi.qty) items
        from order_items oi join orders o on o.id = oi.order_id
        where o.shop_id = p_shop and o.status = 'active' and o.order_date between p_from and p_to group by 1),
  -- each expense is divided equally over its spread_days, starting on its date
  e as (select d.day, round(sum(x.amount / x.spread_days), 2) amt
        from d join expenses x
          on x.shop_id = p_shop and d.day >= x.expense_date and d.day < x.expense_date + x.spread_days
        group by d.day)
  select d.day, coalesce(o.n,0), coalesce(i.items,0)::bigint, coalesce(o.sales,0), coalesce(o.cash,0),
         coalesce(o.upi,0), coalesce(o.unpaid,0), coalesce(e.amt,0), coalesce(o.sales,0) - coalesce(e.amt,0)
    from d left join o on o.day = d.day left join i on i.day = d.day left join e on e.day = d.day
   where o.n > 0 or e.amt > 0
$$;
