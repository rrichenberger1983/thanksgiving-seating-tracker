-- STAFF ADMIN SNIPPETS — run in the Supabase SQL Editor (runs as the project owner).

-- 1) GRANT access: first create the user in Dashboard -> Authentication -> Users -> Add user
--    (tick "Auto Confirm User"), then add their email here:
insert into public.staff (user_id, email)
select id, email from auth.users
where email in ('staff1@example.org', 'staff2@example.org')
on conflict (user_id) do nothing;

-- 2) REVOKE access immediately (user keeps no data access even if still signed in):
delete from public.staff where email = 'staff1@example.org';

-- 3) FULLY remove the login as well:
--    Dashboard -> Authentication -> Users -> (user) -> Delete user.

-- 4) See who currently has access:
select s.email, s.created_at from public.staff s order by s.created_at;
