-- Platform billing every 7 days (instead of monthly)
-- Run once in Supabase SQL Editor.

create or replace function generate_invoices() returns int
language plpgsql security definer set search_path = public as $$
declare r record; v_id uuid; n int := 0; v_end date; v_start date;
begin
  if auth.uid() is not null and not is_super_admin() then raise exception 'Not allowed'; end if;

  -- Group uninvoiced fees into 7-day buckets by shop
  for r in
    select f.shop_id,
           (date_trunc('week', f.fee_date::timestamp)::date) as week_start,
           s.grace_days,
           sum(f.qty)::int as qty,
           sum(f.amount) as amt
      from usage_fees f
      join shops s on s.id = f.shop_id
     where f.invoice_id is null and not f.voided
       and f.fee_date < today_ist()   -- completed days only
     group by f.shop_id, date_trunc('week', f.fee_date::timestamp), s.grace_days
     having sum(f.amount) > 0
  loop
    v_start := r.week_start;
    v_end := r.week_start + 6;

    -- only close a week after it has fully ended
    if v_end >= today_ist() then
      continue;
    end if;

    -- skip if invoice already exists for this week
    if exists (
      select 1 from invoices
       where shop_id = r.shop_id and period_start = v_start and period_end = v_end
    ) then
      continue;
    end if;

    insert into invoices(shop_id, period_start, period_end, items_count, rate, amount, due_date)
    values (
      r.shop_id, v_start, v_end, r.qty,
      case when r.qty > 0 then round(r.amt / r.qty, 2) else 0 end,
      r.amt,
      today_ist() + greatest(r.grace_days, 2)
    )
    returning id into v_id;

    update usage_fees f
       set invoice_id = v_id
     where f.shop_id = r.shop_id
       and f.invoice_id is null and not f.voided
       and f.fee_date between v_start and v_end;

    n := n + 1;
  end loop;
  return n;
end $$;
