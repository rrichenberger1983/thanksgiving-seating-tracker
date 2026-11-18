-- ===== 0001_schema.sql =====
-- Thanksgiving Seating Tracker — schema, RLS, realtime.
-- Run once in the Supabase SQL Editor of the DEDICATED Thanksgiving project.
-- Stores only: first name, last initial, table assignment, check-in status.

-- ---------------------------------------------------------------- tables
create table if not exists public.dining_areas (
  id         text primary key,
  name       text not null,
  sort_order int  not null,
  map_w      int  not null,
  map_h      int  not null
);

create table if not exists public.dining_tables (
  id       text primary key,                       -- e.g. MD-01
  area_id  text not null references public.dining_areas(id),
  label    text not null,                          -- e.g. 01
  shape    text not null check (shape in ('rect', 'round')),
  x        real not null check (x between 0 and 1), -- normalized center
  y        real not null check (y between 0 and 1),
  w        real not null check (w > 0 and w <= 1),
  h        real not null check (h > 0 and h <= 1),
  capacity int  check (capacity is null or capacity > 0)  -- optional; never invented
);

create table if not exists public.guests (
  id           uuid primary key default gen_random_uuid(),
  first_name   text not null
               check (char_length(first_name) between 1 and 40
                      and first_name ~ '^[[:alpha:]][[:alpha:] .''-]*$'),
  last_initial text not null check (last_initial ~ '^[[:alpha:]]$'),
  table_id     text not null references public.dining_tables(id),
  checked_in   boolean not null default false,
  checked_in_at timestamptz,
  version      integer not null default 1,         -- optimistic-concurrency token
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid
);
create index if not exists guests_table_id_idx on public.guests (table_id);

-- Authorized staff allowlist. Being signed in is NOT enough; you must be listed here.
create table if not exists public.staff (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- helpers
create or replace function public.is_staff()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff s where s.user_id = (select auth.uid()));
$$;
revoke all on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;

-- Server-controlled fields: clients can never set version/timestamps/updated_by.
create or replace function public.guests_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.first_name   := btrim(new.first_name);
  new.last_initial := upper(btrim(new.last_initial));
  if tg_op = 'INSERT' then
    new.version       := 1;
    new.checked_in    := false;
    new.checked_in_at := null;
    new.created_at    := now();
    new.updated_at    := now();
    new.updated_by    := auth.uid();
  else
    new.id         := old.id;
    new.created_at := old.created_at;
    new.version    := old.version + 1;
    new.updated_at := now();
    new.updated_by := auth.uid();
    if new.checked_in and not old.checked_in then
      new.checked_in_at := now();
    elsif not new.checked_in then
      new.checked_in_at := null;
    else
      new.checked_in_at := old.checked_in_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guests_before_write on public.guests;
create trigger guests_before_write
  before insert or update on public.guests
  for each row execute function public.guests_before_write();

-- ---------------------------------------------------------------- RLS
alter table public.dining_areas  enable row level security;
alter table public.dining_tables enable row level security;
alter table public.guests        enable row level security;
alter table public.staff         enable row level security;

drop policy if exists staff_read_own   on public.staff;
drop policy if exists areas_staff_read on public.dining_areas;
drop policy if exists tables_staff_read on public.dining_tables;
drop policy if exists guests_staff_read   on public.guests;
drop policy if exists guests_staff_insert on public.guests;
drop policy if exists guests_staff_update on public.guests;

create policy staff_read_own    on public.staff         for select to authenticated using (user_id = (select auth.uid()));
create policy areas_staff_read  on public.dining_areas  for select to authenticated using (public.is_staff());
create policy tables_staff_read on public.dining_tables for select to authenticated using (public.is_staff());
create policy guests_staff_read   on public.guests for select to authenticated using (public.is_staff());
create policy guests_staff_insert on public.guests for insert to authenticated with check (public.is_staff());
create policy guests_staff_update on public.guests for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
-- No DELETE policy: guests are never deleted from the app (see docs/DATA-RETENTION.md).

-- Least privilege: nothing for anon/public; narrow column grants for staff.
revoke all on public.dining_areas, public.dining_tables, public.guests, public.staff from anon, public, authenticated;
grant select on public.dining_areas, public.dining_tables, public.staff to authenticated;
grant select on public.guests to authenticated;
grant insert (first_name, last_initial, table_id) on public.guests to authenticated;
grant update (first_name, last_initial, table_id, checked_in) on public.guests to authenticated;

-- ---------------------------------------------------------------- realtime
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'guests') then
    alter publication supabase_realtime add table public.guests;
  end if;
end $$;

-- ===== 0002_seed_tables.sql =====
-- GENERATED by scripts/build-layout.mjs — do not edit by hand.
insert into public.dining_areas (id, name, sort_order, map_w, map_h) values
  ('MD', 'Main Dining', 1, 2016, 1512),
  ('AR', 'Activity Room', 2, 2016, 1512),
  ('200', '200 Hall Pod', 3, 2016, 1512),
  ('ES', 'East Side Dining', 4, 2016, 1512)
on conflict (id) do nothing;

insert into public.dining_tables (id, area_id, label, shape, x, y, w, h) values
  ('MD-01', 'MD', '01', 'rect', 0.1275, 0.0893, 0.068, 0.0827),
  ('MD-02', 'MD', '02', 'rect', 0.2371, 0.0886, 0.066, 0.082),
  ('MD-03', 'MD', '03', 'rect', 0.1225, 0.2414, 0.0689, 0.086),
  ('MD-04', 'MD', '04', 'rect', 0.2346, 0.2401, 0.068, 0.086),
  ('MD-05', 'MD', '05', 'rect', 0.119, 0.3829, 0.0694, 0.0886),
  ('MD-06', 'MD', '06', 'rect', 0.2331, 0.3823, 0.0699, 0.0893),
  ('MD-07', 'MD', '07', 'rect', 0.4826, 0.3704, 0.0863, 0.0503),
  ('MD-08', 'MD', '08', 'rect', 0.6017, 0.3624, 0.0645, 0.0483),
  ('MD-09', 'MD', '09', 'rect', 0.7073, 0.3552, 0.0714, 0.0463),
  ('MD-10', 'MD', '10', 'rect', 0.812, 0.3598, 0.0675, 0.041),
  ('MD-11', 'MD', '11', 'rect', 0.4727, 0.5112, 0.0665, 0.0886),
  ('MD-12', 'MD', '12', 'rect', 0.5769, 0.5119, 0.066, 0.0873),
  ('MD-13', 'MD', '13', 'rect', 0.691, 0.5066, 0.066, 0.0873),
  ('MD-14', 'MD', '14', 'rect', 0.7976, 0.5053, 0.0645, 0.0886),
  ('MD-15', 'MD', '15', 'rect', 0.1136, 0.58, 0.0704, 0.0926),
  ('MD-16', 'MD', '16', 'rect', 0.2212, 0.5728, 0.0709, 0.0939),
  ('MD-17', 'MD', '17', 'rect', 0.3209, 0.5734, 0.0699, 0.0933),
  ('MD-18', 'MD', '18', 'rect', 0.1106, 0.7341, 0.0714, 0.0959),
  ('MD-19', 'MD', '19', 'rect', 0.2192, 0.7315, 0.0709, 0.0979),
  ('MD-20', 'MD', '20', 'rect', 0.3194, 0.7255, 0.0709, 0.0966),
  ('MD-21', 'MD', '21', 'rect', 0.4747, 0.6786, 0.0675, 0.0913),
  ('MD-22', 'MD', '22', 'rect', 0.5804, 0.6766, 0.067, 0.0926),
  ('MD-23', 'MD', '23', 'rect', 0.6954, 0.6746, 0.067, 0.0926),
  ('MD-24', 'MD', '24', 'rect', 0.8194, 0.6706, 0.0689, 0.0926),
  ('MD-25', 'MD', '25', 'rect', 0.1071, 0.8882, 0.0729, 0.086),
  ('MD-26', 'MD', '26', 'rect', 0.2183, 0.8849, 0.0719, 0.0853),
  ('MD-27', 'MD', '27', 'rect', 0.3185, 0.8823, 0.0709, 0.0833),
  ('MD-28', 'MD', '28', 'rect', 0.4762, 0.8664, 0.0689, 0.0992),
  ('MD-29', 'MD', '29', 'rect', 0.5863, 0.8631, 0.0704, 0.0992),
  ('MD-30', 'MD', '30', 'rect', 0.7059, 0.8578, 0.0724, 0.0992),
  ('MD-31', 'MD', '31', 'rect', 0.8353, 0.8512, 0.0724, 0.0992),
  ('AR-01', 'AR', '01', 'rect', 0.2406, 0.3578, 0.0645, 0.0847),
  ('AR-02', 'AR', '02', 'rect', 0.3686, 0.3545, 0.0645, 0.0847),
  ('AR-03', 'AR', '03', 'rect', 0.495, 0.3512, 0.063, 0.084),
  ('AR-04', 'AR', '04', 'rect', 0.2401, 0.5179, 0.0655, 0.0886),
  ('AR-05', 'AR', '05', 'rect', 0.37, 0.5126, 0.0655, 0.086),
  ('AR-06', 'AR', '06', 'rect', 0.4985, 0.5026, 0.0645, 0.086),
  ('AR-07', 'AR', '07', 'round', 0.8036, 0.4134, 0.0843, 0.1124),
  ('AR-08', 'AR', '08', 'rect', 0.2381, 0.6733, 0.066, 0.0899),
  ('AR-09', 'AR', '09', 'rect', 0.37, 0.668, 0.0665, 0.0893),
  ('AR-10', 'AR', '10', 'rect', 0.501, 0.6627, 0.0665, 0.0893),
  ('AR-11', 'AR', '11', 'rect', 0.2708, 0.8307, 0.1052, 0.0582),
  ('AR-12', 'AR', '12', 'rect', 0.4762, 0.8452, 0.0992, 0.0562),
  ('200-01', '200', '01', 'rect', 0.3224, 0.2791, 0.0645, 0.0827),
  ('200-02', '200', '02', 'rect', 0.4271, 0.2778, 0.0635, 0.0827),
  ('200-03', '200', '03', 'rect', 0.5159, 0.2765, 0.0635, 0.0827),
  ('200-04', '200', '04', 'rect', 0.6166, 0.2851, 0.0382, 0.0747),
  ('200-05', '200', '05', 'rect', 0.3229, 0.4187, 0.0655, 0.084),
  ('200-06', '200', '06', 'rect', 0.4291, 0.4153, 0.0645, 0.082),
  ('200-07', '200', '07', 'rect', 0.5188, 0.4134, 0.0635, 0.0833),
  ('200-08', '200', '08', 'rect', 0.3313, 0.5622, 0.0893, 0.0463),
  ('200-09', '200', '09', 'rect', 0.4385, 0.5562, 0.0734, 0.0443),
  ('200-10', '200', '10', 'rect', 0.5342, 0.5463, 0.062, 0.0509),
  ('ES-01', 'ES', '01', 'rect', 0.313, 0.2798, 0.066, 0.086),
  ('ES-02', 'ES', '02', 'rect', 0.4216, 0.2758, 0.0665, 0.086),
  ('ES-03', 'ES', '03', 'rect', 0.5134, 0.2725, 0.0645, 0.0853),
  ('ES-04', 'ES', '04', 'rect', 0.3135, 0.4226, 0.067, 0.0886),
  ('ES-05', 'ES', '05', 'rect', 0.4241, 0.418, 0.0665, 0.0866),
  ('ES-06', 'ES', '06', 'rect', 0.5164, 0.4153, 0.0655, 0.086)
on conflict (id) do nothing;
