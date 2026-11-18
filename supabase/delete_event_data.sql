-- AFTER THE EVENT — remove all guest data. Run in the Supabase SQL Editor.
-- 1) Delete every guest record (names, seating, check-in times):
delete from public.guests;
-- 2) Remove all staff access:
delete from public.staff;
-- 3) Confirm both are empty:
select (select count(*) from public.guests) as guests, (select count(*) from public.staff) as staff;
-- 4) Optional: delete the staff logins (Dashboard -> Authentication -> Users), then pause or
--    delete the whole project (Dashboard -> Project Settings -> General -> Pause / Delete project).
