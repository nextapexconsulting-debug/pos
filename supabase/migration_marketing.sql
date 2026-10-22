-- Marketing: Instagram / WhatsApp / public order code
alter table shop_settings
  add column if not exists instagram_url text,
  add column if not exists whatsapp_number text,
  add column if not exists public_order_code text;

-- Unique public code per shop (for QR → customer order form)
create unique index if not exists shop_settings_public_code_uidx
  on shop_settings (public_order_code)
  where public_order_code is not null;

-- Customer order requests (from QR form) — staff can convert to real order
create table if not exists order_requests (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references shops(id) on delete cascade,
  customer_name text,
  customer_mobile text not null,
  items_text   text not null,
  status       text not null default 'new' check (status in ('new','done','cancelled')),
  created_at   timestamptz not null default now()
);
create index if not exists order_requests_shop_status on order_requests(shop_id, status, created_at desc);
alter table order_requests enable row level security;
drop policy if exists order_requests_shop on order_requests;
create policy order_requests_shop on order_requests for all
  using (shop_id = my_shop_id() and can_use())
  with check (shop_id = my_shop_id() and can_use());

-- Ensure public code exists
create or replace function ensure_public_order_code()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_shop uuid := my_shop_id();
  v_code text;
begin
  if v_shop is null then raise exception 'No shop'; end if;
  select public_order_code into v_code from shop_settings where shop_id = v_shop;
  if v_code is null or length(v_code) < 4 then
    v_code := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    insert into shop_settings(shop_id, public_order_code)
    values (v_shop, v_code)
    on conflict (shop_id) do update set public_order_code = excluded.public_order_code;
  end if;
  return v_code;
end $$;
grant execute on function ensure_public_order_code() to authenticated;
