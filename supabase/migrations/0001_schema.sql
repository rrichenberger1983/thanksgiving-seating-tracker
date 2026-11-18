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
