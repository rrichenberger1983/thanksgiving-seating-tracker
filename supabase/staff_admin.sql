-- STAFF ADMIN SNIPPETS — run in the Supabase SQL Editor (runs as the project owner).

-- 1) GRANT access: first create the ONE shared staff user in Dashboard -> Authentication -> Users -> Add user
--    (tick "Auto Confirm User"), then put that exact email here (same as the STAFF_LOGIN_EMAIL variable):
insert into public.staff (user_id, email)
select id, email from auth.users
where email in ('thanksgiving-staff@example.org')
on conflict (user_id) do nothing;

-- 2) REVOKE access immediately (user keeps no data access even if still signed in):
delete from public.staff where email = 'thanksgiving-staff@example.org';

-- 3) FULLY remove the login as well (or CHANGE ITS PASSWORD: Authentication -> Users -> the user -> Send/Reset password):
--    Dashboard -> Authentication -> Users -> (user) -> Delete user.

-- 4) See who currently has access:
select s.email, s.created_at from public.staff s order by s.created_at;
