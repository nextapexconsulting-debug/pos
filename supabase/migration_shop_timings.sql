-- =====================================================================
-- Shop-specific business day timings (stored in DB, not local device)
-- day_start_time = when a new business day begins (e.g. 14:00)
-- day_end_time   = typical close (e.g. 09:00 next calendar morning) — for display
-- =====================================================================

alter table shop_settings
  add column if not exists day_start_time time not null default '14:00',
  add column if not exists day_end_time   time not null default '09:00';

comment on column shop_settings.day_start_time is
  'IST time when new business day starts (orders after this count as this calendar date as business day until next start)';
comment on column shop_settings.day_end_time is
  'IST typical close time (may be next morning). Used for UI only.';

-- Business day for a shop at timestamp p_ts (default now)
-- Formula: (IST local time − day_start_time as interval)::date
create or replace function business_day_for_shop(
  p_shop uuid,
  p_ts timestamptz default now()
) returns date
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start time;
  v_ist   timestamp;
  v_mid   timestamp;
  v_offset interval;
begin
  if p_shop is null then
    return ((p_ts at time zone 'Asia/Kolkata') - interval '14 hours')::date;
  end if;

  select day_start_time into v_start
  from shop_settings
  where shop_id = p_shop;

  if v_start is null then
    v_start := '14:00'::time;
  end if;

  v_ist := p_ts at time zone 'Asia/Kolkata';
  v_mid := date_trunc('day', v_ist);
  v_offset := (v_start - time '00:00');  -- e.g. 14 hours

  return (v_ist - v_offset)::date;
end;
$$;

-- Current shop's business day (for authenticated users)
create or replace function today_business_ist()
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_shop uuid := my_shop_id();
begin
  return business_day_for_shop(v_shop, now());
end;
$$;

-- Keep name used by older code
create or replace function business_day_ist(p_ts timestamptz default now())
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return business_day_for_shop(my_shop_id(), p_ts);
end;
$$;

grant execute on function business_day_for_shop(uuid, timestamptz) to authenticated;
grant execute on function today_business_ist() to authenticated;
grant execute on function business_day_ist(timestamptz) to authenticated;

-- Read timings for current shop
create or replace function get_shop_timings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_shop uuid := my_shop_id();
  r record;
begin
  if v_shop is null then
    return jsonb_build_object(
      'day_start_time', '14:00',
      'day_end_time', '09:00',
      'business_day', business_day_for_shop(null, now())
    );
  end if;

  select day_start_time, day_end_time into r
  from shop_settings where shop_id = v_shop;

  if not found then
    insert into shop_settings(shop_id) values (v_shop) on conflict do nothing;
    select day_start_time, day_end_time into r
    from shop_settings where shop_id = v_shop;
  end if;

  return jsonb_build_object(
    'day_start_time', to_char(coalesce(r.day_start_time, '14:00'::time), 'HH24:MI'),
    'day_end_time', to_char(coalesce(r.day_end_time, '09:00'::time), 'HH24:MI'),
    'business_day', business_day_for_shop(v_shop, now())
  );
end;
$$;
grant execute on function get_shop_timings() to authenticated;

-- Save timings (owner)
create or replace function set_shop_timings(p_start time, p_end time)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop uuid := my_shop_id();
begin
  if v_shop is null or not can_use() then
    raise exception 'Access disabled';
  end if;
  if my_role() is distinct from 'owner' then
    raise exception 'Owner only';
  end if;
  if p_start is null then
    raise exception 'Start time required';
  end if;

  insert into shop_settings(shop_id, day_start_time, day_end_time)
  values (v_shop, p_start, coalesce(p_end, '09:00'::time))
  on conflict (shop_id) do update set
    day_start_time = excluded.day_start_time,
    day_end_time = excluded.day_end_time,
    updated_at = now();

  return get_shop_timings();
end;
$$;
grant execute on function set_shop_timings(time, time) to authenticated;

-- Ensure place_order uses shop business day (patch if function exists with v_day)
-- Callers should use: v_day := business_day_for_shop(v_shop, now());
