-- Online delivery orders (Zomato/Swiggy/…) + configurable commission %
-- Default commission 28%. Safe additive migration.

create table if not exists shop_delivery_platforms (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references shops(id) on delete cascade,
  name            text not null,
  commission_pct  numeric(5,2) not null default 28
                  check (commission_pct >= 0 and commission_pct <= 100),
  active          boolean not null default true,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  unique (shop_id, name)
);

create table if not exists online_orders (
  id                 uuid primary key default gen_random_uuid(),
  shop_id            uuid not null references shops(id) on delete cascade,
  platform_id        uuid references shop_delivery_platforms(id) on delete set null,
  platform_name      text not null,
  commission_pct     numeric(5,2) not null default 28,
  external_order_no  text,
  amount             numeric(12,2) not null check (amount >= 0),
  order_date         date not null,
  notes              text,
  created_by         uuid references auth.users(id),
  created_at         timestamptz not null default now()
);

create index if not exists online_orders_shop_date
  on online_orders(shop_id, order_date desc);
create index if not exists online_orders_shop_platform
  on online_orders(shop_id, platform_name);

alter table shop_delivery_platforms enable row level security;
alter table online_orders enable row level security;

drop policy if exists sdp_all on shop_delivery_platforms;
create policy sdp_all on shop_delivery_platforms for all
  using (shop_id = my_shop_id() and can_use())
  with check (shop_id = my_shop_id() and can_use());

drop policy if exists oo_all on online_orders;
create policy oo_all on online_orders for all
  using (shop_id = my_shop_id() and can_use())
  with check (shop_id = my_shop_id() and can_use());

-- Seed Zomato + Swiggy at 28% for every existing shop
insert into shop_delivery_platforms (shop_id, name, commission_pct, sort_order)
select s.id, p.name, 28, p.ord
from shops s
cross join (values ('Zomato', 1), ('Swiggy', 2)) as p(name, ord)
on conflict (shop_id, name) do nothing;

-- New shops: seed via trigger
create or replace function seed_delivery_platforms()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into shop_delivery_platforms (shop_id, name, commission_pct, sort_order)
  values
    (new.id, 'Zomato', 28, 1),
    (new.id, 'Swiggy', 28, 2)
  on conflict (shop_id, name) do nothing;
  return new;
end $$;

drop trigger if exists seed_delivery_platforms_trg on shops;
create trigger seed_delivery_platforms_trg
  after insert on shops
  for each row execute function seed_delivery_platforms();

-- Insert online order (uses shop business day if p_day null)
create or replace function add_online_order(
  p_platform_id uuid,
  p_amount numeric,
  p_external_no text default null,
  p_day date default null,
  p_notes text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_shop uuid := my_shop_id();
  v_plat shop_delivery_platforms%rowtype;
  v_day date;
  v_id uuid;
  v_net numeric;
begin
  if v_shop is null or not can_use() then raise exception 'Access disabled'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'Invalid amount'; end if;

  select * into v_plat from shop_delivery_platforms
   where id = p_platform_id and shop_id = v_shop and active;
  if not found then raise exception 'Platform not found'; end if;

  v_day := coalesce(p_day, today_business_ist());
  v_net := round(p_amount * (1 - coalesce(v_plat.commission_pct, 28) / 100.0), 2);

  insert into online_orders (
    shop_id, platform_id, platform_name, commission_pct,
    external_order_no, amount, order_date, notes, created_by
  ) values (
    v_shop, v_plat.id, v_plat.name, v_plat.commission_pct,
    nullif(trim(p_external_no), ''), p_amount, v_day, nullif(trim(p_notes), ''), auth.uid()
  ) returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'platform', v_plat.name,
    'amount', p_amount,
    'commission_pct', v_plat.commission_pct,
    'net_after_commission', v_net,
    'order_date', v_day
  );
end $$;
grant execute on function add_online_order(uuid, numeric, text, date, text) to authenticated;

create or replace function delete_online_order(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if my_shop_id() is null or not can_use() then raise exception 'Access disabled'; end if;
  delete from online_orders where id = p_id and shop_id = my_shop_id();
end $$;
grant execute on function delete_online_order(uuid) to authenticated;

-- Report: online by day (gross, commission, net)
create or replace function report_online_daily(p_from date, p_to date)
returns table(
  day date,
  platform text,
  orders bigint,
  gross numeric,
  commission_pct numeric,
  commission_amt numeric,
  net_after_commission numeric
)
language sql stable security definer set search_path = public as $$
  select
    o.order_date,
    o.platform_name,
    count(*)::bigint,
    round(sum(o.amount), 2),
    round(avg(o.commission_pct), 2),
    round(sum(o.amount * o.commission_pct / 100.0), 2),
    round(sum(o.amount * (1 - o.commission_pct / 100.0)), 2)
  from online_orders o
  where o.shop_id = my_shop_id()
    and o.order_date >= p_from
    and o.order_date <= p_to
  group by o.order_date, o.platform_name
  order by o.order_date desc, o.platform_name;
$$;
grant execute on function report_online_daily(date, date) to authenticated;

-- Report: platform summary for range
create or replace function report_online_platforms(p_from date, p_to date)
returns table(
  platform text,
  orders bigint,
  gross numeric,
  commission_amt numeric,
  net_after_commission numeric
)
language sql stable security definer set search_path = public as $$
  select
    o.platform_name,
    count(*)::bigint,
    round(sum(o.amount), 2),
    round(sum(o.amount * o.commission_pct / 100.0), 2),
    round(sum(o.amount * (1 - o.commission_pct / 100.0)), 2)
  from online_orders o
  where o.shop_id = my_shop_id()
    and o.order_date >= p_from
    and o.order_date <= p_to
  group by o.platform_name
  order by net_after_commission desc;
$$;
grant execute on function report_online_platforms(date, date) to authenticated;

-- Detail list
create or replace function report_online_details(p_from date, p_to date)
returns table(
  id uuid,
  order_date date,
  created_at timestamptz,
  platform text,
  external_order_no text,
  amount numeric,
  commission_pct numeric,
  commission_amt numeric,
  net_after_commission numeric
)
language sql stable security definer set search_path = public as $$
  select
    o.id,
    o.order_date,
    o.created_at,
    o.platform_name,
    o.external_order_no,
    o.amount,
    o.commission_pct,
    round(o.amount * o.commission_pct / 100.0, 2),
    round(o.amount * (1 - o.commission_pct / 100.0), 2)
  from online_orders o
  where o.shop_id = my_shop_id()
    and o.order_date >= p_from
    and o.order_date <= p_to
  order by o.created_at desc;
$$;
grant execute on function report_online_details(date, date) to authenticated;
