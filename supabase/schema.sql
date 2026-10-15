-- =====================================================================
--  Voice POS  –  Supabase schema   (run once in Supabase → SQL Editor)
--  Safe to read top to bottom. Sections:
--   1. Tables            2. Helper functions     3. Triggers
--   4. Row-Level Security (who can see what)     5. POS functions
--   6. Billing / platform fee                    7. Reports
--   8. Archive
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------
create table if not exists shops (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  status        text not null default 'active' check (status in ('active','blocked')),
  blocked_reason text,
  fee_per_item  numeric(6,2) not null default 0.50,   -- platform fee per item sold (hidden from shop users)
  grace_days    int  not null default 5,              -- days after month end to pay before auto-block
  next_order_no int  not null default 1001,
  created_at    timestamptz not null default now()
);

create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  shop_id     uuid references shops(id) on delete set null,
  email       text,
  full_name   text,
  role        text not null default 'owner' check (role in ('super_admin','owner','staff')),
  is_blocked  boolean not null default false,
  blocked_reason text,
  created_at  timestamptz not null default now()
);

create table if not exists orders (
  id             uuid primary key default gen_random_uuid(),
  shop_id        uuid not null references shops(id) on delete cascade,
  order_no       int  not null,
  order_date     date not null default ((now() at time zone 'Asia/Kolkata')::date),
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id),
  total          numeric(10,2) not null check (total >= 0),
  status         text not null default 'active' check (status in ('active','cancelled')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid')),
  payment_method text check (payment_method in ('cash','upi')),
  paid_at        timestamptz,
  unique (shop_id, order_no),
  check ((payment_status = 'paid') = (payment_method is not null))
);
create index if not exists orders_shop_date on orders(shop_id, order_date);

create table if not exists order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references orders(id) on delete cascade,
  shop_id    uuid not null references shops(id) on delete cascade,
  product_id text,
  name_en    text not null,
  name_gu    text,
  category   text,
  price      numeric(10,2) not null check (price >= 0),
  qty        int not null check (qty > 0),
  line_total numeric(10,2) generated always as (price * qty) stored
);
create index if not exists order_items_order on order_items(order_id);

create table if not exists inventory_items (
  id        uuid primary key default gen_random_uuid(),
  shop_id   uuid not null references shops(id) on delete cascade,
  name      text not null,
  unit      text not null default 'pcs',
  category  text not null default 'other',      -- bread / pizza / ingredient / other
  active    boolean not null default true,
  created_at timestamptz not null default now(),
  unique (shop_id, name)
);

create table if not exists stock_in (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references shops(id) on delete cascade,
  item_id    uuid not null references inventory_items(id) on delete cascade,
  entry_date date not null default ((now() at time zone 'Asia/Kolkata')::date),
  qty        numeric(10,2) not null check (qty > 0),
  total_cost numeric(10,2) not null default 0 check (total_cost >= 0),
  note       text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists stock_in_shop_date on stock_in(shop_id, entry_date);

-- end-of-day physical count; tomorrow's opening = latest closing before that day
create table if not exists stock_counts (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references shops(id) on delete cascade,
  item_id     uuid not null references inventory_items(id) on delete cascade,
  count_date  date not null,
  closing_qty numeric(10,2) not null check (closing_qty >= 0),
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  unique (item_id, count_date)
);

create table if not exists expenses (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references shops(id) on delete cascade,
  expense_date date not null default ((now() at time zone 'Asia/Kolkata')::date),
  category     text not null,                  -- free text (Vegetables, Tea, Salary, Misc, anything)
  note         text,
  amount       numeric(10,2) not null check (amount > 0),
  spread_days  int not null default 1 check (spread_days between 1 and 366),  -- charge over N days in profit reports
  source       text not null default 'manual' check (source in ('manual','stock_in')),
  stock_in_id  uuid unique references stock_in(id) on delete cascade,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now()
);
create index if not exists expenses_shop_date on expenses(shop_id, expense_date);

-- Platform fee, one row per order line. NO foreign keys on purpose, so archiving
-- orders never deletes billing history. Only the super admin can read this table.
create table if not exists usage_fees (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references shops(id) on delete cascade,
  order_id     uuid,
  order_item_id uuid,
  order_no     int,
  fee_date     date not null,
  product_name text,
  qty          int  not null,
  rate         numeric(6,2) not null,
  amount       numeric(10,2) not null,
  voided       boolean not null default false,
  invoice_id   uuid,
  created_at   timestamptz not null default now()
);
create index if not exists usage_fees_shop_date on usage_fees(shop_id, fee_date);
create index if not exists usage_fees_order on usage_fees(order_id);

create table if not exists invoices (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references shops(id) on delete cascade,
  period_start date not null,
  period_end   date not null,
  items_count  int  not null,
  rate         numeric(6,2) not null,
  amount       numeric(10,2) not null,
  issued_on    date not null default ((now() at time zone 'Asia/Kolkata')::date),
  due_date     date not null,                  -- period_end + grace_days; unpaid after this = shop blocked
  status       text not null default 'unpaid' check (status in ('unpaid','paid')),
  paid_on      date,
  paid_note    text,
  unique (shop_id, period_start)
);

-- permanent per-day totals, kept after detailed rows are archived
create table if not exists daily_summary (
  shop_id  uuid not null references shops(id) on delete cascade,
  day      date not null,
  orders   int not null, items int not null,
  sales numeric(12,2) not null, cash numeric(12,2) not null, upi numeric(12,2) not null,
  unpaid numeric(12,2) not null, expenses numeric(12,2) not null, profit numeric(12,2) not null,
  primary key (shop_id, day)
);

-- archive copies (same columns, no constraints)
create table if not exists archive_orders      (like orders);
create table if not exists archive_order_items (like order_items);
create table if not exists archive_expenses    (like expenses);

-- ---------------------------------------------------------------------
-- 2. HELPER FUNCTIONS
-- ---------------------------------------------------------------------
create or replace function today_ist() returns date language sql stable as
$$ select (now() at time zone 'Asia/Kolkata')::date $$;

create or replace function is_super_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where id = auth.uid() and role = 'super_admin' and not is_blocked) $$;

create or replace function my_shop_id() returns uuid
language sql stable security definer set search_path = public as
$$ select shop_id from profiles where id = auth.uid() $$;

create or replace function my_role() returns text
language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() $$;

create or replace function shop_overdue(p_shop uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from invoices where shop_id = p_shop and status = 'unpaid' and due_date < today_ist()) $$;

-- true when the logged-in user may use the app right now
create or replace function can_use() returns boolean
language sql stable security definer set search_path = public as $$
  select is_super_admin() or exists (
    select 1 from profiles p join shops s on s.id = p.shop_id
    where p.id = auth.uid() and not p.is_blocked and s.status = 'active' and not shop_overdue(s.id)
  )
$$;

-- Used by the app on every page load: why is (or isn't) this user allowed in?
create or replace function my_access() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p profiles; s shops; inv invoices;
begin
  select * into p from profiles where id = auth.uid();
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_profile'); end if;
  if p.role = 'super_admin' and not p.is_blocked then
    return jsonb_build_object('ok', true, 'role', p.role, 'email', p.email, 'full_name', p.full_name);
  end if;
  if p.is_blocked then
    return jsonb_build_object('ok', false, 'reason', 'user_blocked', 'message', p.blocked_reason);
  end if;
  select * into s from shops where id = p.shop_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_shop'); end if;
  if s.status = 'blocked' then
    return jsonb_build_object('ok', false, 'reason', 'shop_blocked', 'message', s.blocked_reason, 'shop_name', s.name);
  end if;
  select * into inv from invoices
   where shop_id = s.id and status = 'unpaid' order by due_date limit 1;
  if found and inv.due_date < today_ist() then
    return jsonb_build_object('ok', false, 'reason', 'bill_overdue', 'shop_name', s.name,
      'amount', inv.amount, 'due_date', inv.due_date, 'period_start', inv.period_start);
  end if;
  return jsonb_build_object('ok', true, 'role', p.role, 'shop_id', s.id, 'shop_name', s.name,
    'email', p.email, 'full_name', p.full_name,
    'warning', case when inv.id is not null then
        jsonb_build_object('amount', inv.amount, 'due_date', inv.due_date, 'period_start', inv.period_start)
      else null end);
end $$;

-- default stock items for a new shop
create or replace function seed_shop(p_shop uuid) returns void
language sql security definer set search_path = public as $$
  insert into inventory_items (shop_id, name, unit, category) values
    (p_shop, 'Bread',      'packet', 'bread'),
    (p_shop, 'Pizza Base', 'pcs',    'pizza'),
    (p_shop, 'Butter',     'kg',     'ingredient'),
    (p_shop, 'Cheese',     'kg',     'ingredient')
  on conflict do nothing
$$;
revoke execute on function seed_shop(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. TRIGGERS
-- ---------------------------------------------------------------------
-- New auth user → profile (+ new shop when self-signing-up).
-- app_metadata (server-only) decides shop/role for users created by admin.
-- user_metadata (client-controlled) can ONLY name a brand-new shop.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_shop uuid; v_role text; v_name text;
begin
  v_shop := nullif(new.raw_app_meta_data->>'shop_id','')::uuid;
  if v_shop is not null then
    v_role := case when new.raw_app_meta_data->>'role' = 'staff' then 'staff' else 'owner' end;
  else
    v_name := coalesce(nullif(trim(new.raw_user_meta_data->>'shop_name'),''), 'My Shop');
    insert into shops(name) values (v_name) returning id into v_shop;
    perform seed_shop(v_shop);
    v_role := 'owner';
  end if;
  insert into profiles(id, shop_id, email, full_name, role)
  values (new.id, v_shop, new.email, new.raw_user_meta_data->>'full_name', v_role);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- shop_id / created_by are always filled by the server, never trusted from the browser
create or replace function fill_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.shop_id := coalesce(new.shop_id, my_shop_id());   -- RLS "with check" rejects any other shop's id
  new.created_by := coalesce(auth.uid(), new.created_by);
  return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['stock_in','stock_counts','expenses'] loop
    execute format('drop trigger if exists fill_defaults on %I', t);
    execute format('create trigger fill_defaults before insert on %I for each row execute function fill_defaults()', t);
  end loop;
end $$;
-- inventory_items has no created_by column → shop-only variant
create or replace function fill_defaults_shop_only() returns trigger
language plpgsql security definer set search_path = public as $$
begin new.shop_id := coalesce(new.shop_id, my_shop_id()); return new; end $$;
drop trigger if exists fill_defaults on inventory_items;
create trigger fill_defaults before insert on inventory_items
  for each row execute function fill_defaults_shop_only();

-- stock purchase automatically becomes an expense
create or replace function stock_in_to_expense() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if new.total_cost > 0 then
    select name into v_name from inventory_items where id = new.item_id;
    insert into expenses(shop_id, expense_date, category, note, amount, source, stock_in_id, created_by)
    values (new.shop_id, new.entry_date, 'Stock: ' || coalesce(v_name,'item'),
            trim(both ' -' from format('%s x %s %s', v_name, new.qty, coalesce('- ' || new.note, ''))),
            new.total_cost, 'stock_in', new.id, new.created_by);
  end if;
  return new;
end $$;
drop trigger if exists stock_in_expense on stock_in;
create trigger stock_in_expense after insert on stock_in
  for each row execute function stock_in_to_expense();

-- only the super admin may change role / shop / email on a profile
create or replace function guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null for SQL editor / service role → allowed (used to create the first super admin)
  if auth.uid() is not null and not is_super_admin() then
    new.role := old.role; new.shop_id := old.shop_id; new.email := old.email; new.id := old.id;
  end if;
  return new;
end $$;
drop trigger if exists guard_profile on profiles;
create trigger guard_profile before update on profiles
  for each row execute function guard_profile_update();

-- ---------------------------------------------------------------------
-- 4. ROW-LEVEL SECURITY
--    Blocked users / blocked shops / overdue shops fail can_use() → they
--    can't read or write anything, even with a valid login token.
-- ---------------------------------------------------------------------
alter table shops           enable row level security;
alter table profiles        enable row level security;
alter table orders          enable row level security;
alter table order_items     enable row level security;
alter table inventory_items enable row level security;
alter table stock_in        enable row level security;
alter table stock_counts    enable row level security;
alter table expenses        enable row level security;
alter table usage_fees      enable row level security;
alter table invoices        enable row level security;
alter table daily_summary   enable row level security;
alter table archive_orders      enable row level security;
alter table archive_order_items enable row level security;
alter table archive_expenses    enable row level security;

-- shops
drop policy if exists shops_admin on shops;
create policy shops_admin on shops for all using (is_super_admin()) with check (is_super_admin());
drop policy if exists shops_own on shops;
create policy shops_own on shops for select using (id = my_shop_id());

-- profiles
drop policy if exists profiles_admin on profiles;
create policy profiles_admin on profiles for all using (is_super_admin()) with check (is_super_admin());
drop policy if exists profiles_self on profiles;
create policy profiles_self on profiles for select using (id = auth.uid());
drop policy if exists profiles_owner_read on profiles;
create policy profiles_owner_read on profiles for select
  using (shop_id = my_shop_id() and my_role() = 'owner' and can_use());
drop policy if exists profiles_owner_block_staff on profiles;
create policy profiles_owner_block_staff on profiles for update
  using (shop_id = my_shop_id() and role = 'staff' and my_role() = 'owner' and can_use())
  with check (shop_id = my_shop_id() and role = 'staff');

-- orders & items: owner sees all; staff sees today's only. Writes go through functions.
drop policy if exists orders_read on orders;
create policy orders_read on orders for select using (
  shop_id = my_shop_id() and can_use()
  and (my_role() = 'owner' or order_date = today_ist()));
drop policy if exists order_items_read on order_items;
create policy order_items_read on order_items for select using (
  shop_id = my_shop_id() and can_use()
  and (my_role() = 'owner' or exists (select 1 from orders o where o.id = order_id and o.order_date = today_ist())));

-- owner-only tables
do $$ declare t text; begin
  foreach t in array array['inventory_items','stock_in','stock_counts','expenses'] loop
    execute format('drop policy if exists owner_all on %I', t);
    execute format($p$create policy owner_all on %I for all
      using (shop_id = my_shop_id() and my_role() = 'owner' and can_use())
      with check (shop_id = my_shop_id() and my_role() = 'owner' and can_use())$p$, t);
  end loop;
  foreach t in array array['daily_summary','archive_orders','archive_order_items','archive_expenses'] loop
    execute format('drop policy if exists owner_read on %I', t);
    execute format($p$create policy owner_read on %I for select
      using (shop_id = my_shop_id() and my_role() = 'owner' and can_use())$p$, t);
  end loop;
end $$;
-- staff can read inventory names (for dropdowns) but not change them
drop policy if exists staff_read_inventory on inventory_items;
create policy staff_read_inventory on inventory_items for select using (shop_id = my_shop_id() and can_use());

-- platform fees: super admin ONLY (shop users have no policy → they see nothing)
drop policy if exists fees_admin on usage_fees;
create policy fees_admin on usage_fees for all using (is_super_admin()) with check (is_super_admin());

-- invoices: shop owner can read their own (even when blocked, so they can see what to pay)
drop policy if exists invoices_admin on invoices;
create policy invoices_admin on invoices for all using (is_super_admin()) with check (is_super_admin());
drop policy if exists invoices_owner on invoices;
create policy invoices_owner on invoices for select using (shop_id = my_shop_id() and my_role() = 'owner');

-- ---------------------------------------------------------------------
-- 5. POS FUNCTIONS (orders are written only through these)
-- ---------------------------------------------------------------------
-- p_items: [{"product_id":"..","name_en":"..","name_gu":"..","category":"..","price":50,"qty":2}, ...]
create or replace function place_order(p_items jsonb, p_payment text default null)
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

  insert into orders(shop_id, order_no, created_by, total, payment_status, payment_method, paid_at)
  values (v_shop, v_no, auth.uid(), v_total,
          case when p_payment is null then 'unpaid' else 'paid' end, p_payment,
          case when p_payment is null then null else now() end)
  returning id into v_id;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::int; v_price := (it->>'price')::numeric;
    insert into order_items(order_id, shop_id, product_id, name_en, name_gu, category, price, qty)
    values (v_id, v_shop, it->>'product_id', it->>'name_en', it->>'name_gu', it->>'category', v_price, v_qty)
    returning id into v_item;
    -- hidden platform fee, one line per order line
    insert into usage_fees(shop_id, order_id, order_item_id, order_no, fee_date, product_name, qty, rate, amount)
    values (v_shop, v_id, v_item, v_no, today_ist(), it->>'name_en', v_qty, v_fee, round(v_qty * v_fee, 2));
  end loop;

  return jsonb_build_object('order_id', v_id, 'order_no', v_no, 'total', v_total);
end $$;

-- p_method: 'cash' | 'upi' | null (null = undo payment, owner only)
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
     and (my_role() = 'owner' or order_date = today_ist());
  if not found then raise exception 'Order not found'; end if;
end $$;

create or replace function cancel_order(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_role() <> 'owner' or not can_use() then raise exception 'Only owner can cancel'; end if;
  update orders set status = 'cancelled' where id = p_order and shop_id = my_shop_id();
  if not found then raise exception 'Order not found'; end if;
  update usage_fees set voided = true where order_id = p_order and invoice_id is null;
end $$;

-- ---------------------------------------------------------------------
-- 6. BILLING (platform fee → monthly invoice → auto-block if unpaid)
--    Month ends → invoice issued → shop has grace_days (5) to pay →
--    after due_date, can_use() turns false → shop is locked out.
-- ---------------------------------------------------------------------
create or replace function generate_invoices() returns int
language plpgsql security definer set search_path = public as $$
declare r record; v_id uuid; n int := 0; v_end date;
begin
  if auth.uid() is not null and not is_super_admin() then raise exception 'Not allowed'; end if;
  for r in
    select f.shop_id, date_trunc('month', f.fee_date)::date as m, s.grace_days,
           sum(f.qty)::int as qty, sum(f.amount) as amt
      from usage_fees f join shops s on s.id = f.shop_id
     where f.invoice_id is null and not f.voided
       and f.fee_date < date_trunc('month', today_ist())::date       -- only completed months
     group by f.shop_id, date_trunc('month', f.fee_date), s.grace_days
    having sum(f.amount) > 0
  loop
    v_end := (r.m + interval '1 month - 1 day')::date;
    v_id := null;
    insert into invoices(shop_id, period_start, period_end, items_count, rate, amount, due_date)
    values (r.shop_id, r.m, v_end, r.qty, round(r.amt / r.qty, 2), r.amt, v_end + r.grace_days)
    on conflict (shop_id, period_start) do nothing
    returning id into v_id;
    if v_id is not null then
      update usage_fees set invoice_id = v_id
       where shop_id = r.shop_id and invoice_id is null and not voided
         and fee_date >= r.m and fee_date <= v_end;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- per-shop usage totals for the admin dashboard
create or replace function admin_usage_summary(p_from date, p_to date)
returns table(shop_id uuid, shop_name text, orders bigint, items bigint, amount numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_super_admin() then raise exception 'Not allowed'; end if;
  return query
    select s.id, s.name, count(distinct f.order_id), coalesce(sum(f.qty),0)::bigint, coalesce(sum(f.amount),0)
      from shops s left join usage_fees f
        on f.shop_id = s.id and not f.voided and f.fee_date between p_from and p_to
     group by s.id, s.name order by s.name;
end $$;

-- ---------------------------------------------------------------------
-- 7. REPORTS  (security invoker → RLS still applies)
-- ---------------------------------------------------------------------
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

create or replace function report_daily(p_from date, p_to date)
returns table(day date, orders bigint, items bigint, sales numeric, cash numeric, upi numeric,
              unpaid numeric, expenses numeric, profit numeric)
language sql stable as $$
  with live as (select * from daily_live(my_shop_id(), p_from, p_to))
  select * from live
  union all
  select s.day, s.orders, s.items, s.sales, s.cash, s.upi, s.unpaid, s.expenses, s.profit
    from daily_summary s
   where s.shop_id = my_shop_id() and s.day between p_from and p_to
     and not exists (select 1 from live l where l.day = s.day)
  order by 1
$$;

create or replace function report_items(p_from date, p_to date)
returns table(item text, qty bigint, revenue numeric, orders bigint)
language sql stable as $$
  select oi.name_en, sum(oi.qty)::bigint, sum(oi.line_total), count(distinct oi.order_id)
    from order_items oi join orders o on o.id = oi.order_id
   where o.shop_id = my_shop_id() and o.status = 'active' and o.order_date between p_from and p_to
   group by oi.name_en order by sum(oi.line_total) desc
$$;

create or replace function report_expenses(p_from date, p_to date)
returns table(category text, entries bigint, total numeric)
language sql stable as $$
  select category, count(*), sum(amount) from expenses
   where shop_id = my_shop_id() and expense_date between p_from and p_to
   group by category order by sum(amount) desc
$$;

create or replace function report_hourly(p_from date, p_to date)
returns table(hour int, orders bigint, sales numeric)
language sql stable as $$
  select extract(hour from created_at at time zone 'Asia/Kolkata')::int, count(*), sum(total)
    from orders where shop_id = my_shop_id() and status = 'active' and order_date between p_from and p_to
   group by 1 order by 1
$$;

-- stock movement per item per day (days with a purchase or a count)
create or replace function report_stock(p_from date, p_to date)
returns table(day date, item text, unit text, opening numeric, stock_in numeric, closing numeric, used numeric)
language sql stable as $$
  with ev as (
    select item_id, count_date as day from stock_counts where shop_id = my_shop_id() and count_date between p_from and p_to
    union
    select item_id, entry_date from stock_in where shop_id = my_shop_id() and entry_date between p_from and p_to),
  x as (
    select ev.day, i.name, i.unit,
      coalesce((select c.closing_qty from stock_counts c where c.item_id = ev.item_id and c.count_date < ev.day
                order by c.count_date desc limit 1), 0) as opening,
      coalesce((select sum(s.qty) from stock_in s where s.item_id = ev.item_id and s.entry_date = ev.day), 0) as sin,
      (select c.closing_qty from stock_counts c where c.item_id = ev.item_id and c.count_date = ev.day) as closing
    from ev join inventory_items i on i.id = ev.item_id)
  select day, name, unit, opening, sin, closing,
         case when closing is null then null else opening + sin - closing end
    from x order by day, name
$$;

-- today's sheet for the Stock page: opening carried forward, stock in, closing (if counted)
create or replace function stock_sheet(p_date date)
returns table(item_id uuid, name text, unit text, category text, opening numeric, stock_in numeric, closing numeric, used numeric)
language sql stable as $$
  with x as (
    select i.id, i.name, i.unit, i.category,
      coalesce((select c.closing_qty from stock_counts c where c.item_id = i.id and c.count_date < p_date
                order by c.count_date desc limit 1), 0) as opening,
      coalesce((select sum(s.qty) from stock_in s where s.item_id = i.id and s.entry_date = p_date), 0) as sin,
      (select c.closing_qty from stock_counts c where c.item_id = i.id and c.count_date = p_date) as closing
    from inventory_items i where i.shop_id = my_shop_id() and i.active)
  select id, name, unit, category, opening, sin, closing,
         case when closing is null then null else opening + sin - closing end
    from x order by category, name
$$;

-- ---------------------------------------------------------------------
-- 8. ARCHIVE  (keep ~6 months live; older detail moves to archive_* tables,
--    daily totals are kept forever in daily_summary)
-- ---------------------------------------------------------------------
create or replace function archive_old_data(p_months int default 6) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_shop uuid := my_shop_id(); v_cut date; n_o int; n_e int;
begin
  if my_role() <> 'owner' or not can_use() then raise exception 'Only owner can archive'; end if;
  v_cut := (date_trunc('month', today_ist()) - make_interval(months => p_months))::date;

  insert into daily_summary(shop_id, day, orders, items, sales, cash, upi, unpaid, expenses, profit)
  select v_shop, day, orders, items, sales, cash, upi, unpaid, expenses, profit
    from daily_live(v_shop, '2000-01-01', v_cut - 1)
  on conflict (shop_id, day) do update set orders = excluded.orders, items = excluded.items,
    sales = excluded.sales, cash = excluded.cash, upi = excluded.upi, unpaid = excluded.unpaid,
    expenses = excluded.expenses, profit = excluded.profit;

  insert into archive_orders      select * from orders      where shop_id = v_shop and order_date < v_cut;
  insert into archive_order_items select oi.* from order_items oi join orders o on o.id = oi.order_id
                                   where o.shop_id = v_shop and o.order_date < v_cut;
  insert into archive_expenses    select * from expenses    where shop_id = v_shop and expense_date < v_cut;

  delete from orders   where shop_id = v_shop and order_date < v_cut;   -- items cascade
  get diagnostics n_o = row_count;
  delete from expenses where shop_id = v_shop and expense_date < v_cut;
  get diagnostics n_e = row_count;
  return jsonb_build_object('before', v_cut, 'orders_archived', n_o, 'expenses_archived', n_e);
end $$;

-- ---------------------------------------------------------------------
-- DONE.  Make yourself super admin (after signing up once in the app):
--   update profiles set role = 'super_admin', shop_id = null where email = 'YOU@EMAIL.COM';
-- ---------------------------------------------------------------------
