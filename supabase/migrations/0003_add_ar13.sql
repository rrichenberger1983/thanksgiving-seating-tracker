-- Add table AR-13 (Activity Room, right of AR-12). ADDITIVE and idempotent:
-- no data is changed or deleted; running it twice (or on a fresh install) does nothing extra.
-- Needed once on a project that already ran setup.sql before AR-13 existed.
insert into public.dining_tables (id, area_id, label, shape, x, y, w, h)
values ('AR-13', 'AR', '13', 'rect', 0.6786, 0.8452, 0.0992, 0.0562)
on conflict (id) do nothing;
