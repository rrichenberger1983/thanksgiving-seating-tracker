# Setup (about 15 minutes, all doable from an iPad)

## A. Supabase (the dedicated Thanksgiving project)
1. Dashboard -> **SQL Editor** -> New query -> paste all of `supabase/setup.sql` -> Run. (Creates tables, security rules, the 59 tables, live updates.)
2. **Turn off public sign-up:** Authentication -> Sign In / Providers -> turn **off** "Allow new users to sign up". Leave "Allow anonymous sign-ins" off.
3. **Create the ONE shared staff login:** Authentication -> Users -> Add user -> Create new user. Email: any address you choose (e.g. `thanksgiving-staff@yourdomain.org`; no emails are sent, so it does not need to receive mail). Password: a long, unique one you hand to staff verbally or on paper. Tick *Auto Confirm User*.
4. **Authorize it:** SQL Editor -> paste the "GRANT" snippet from `supabase/staff_admin.sql` with that same email -> Run. A login without a row in `public.staff` sees nothing.
5. **Test data (optional, fictional only):** run `supabase/seed_test_guests.sql`.
6. **Copy two public values:** Project Settings -> API (or Connect): the **Project URL** and the **publishable key** (`sb_publishable_…`). Never use the `service_role`/secret key anywhere in this app.

## B. GitHub Pages (the live link)
1. Repo -> Settings -> **Pages** -> Source: **GitHub Actions**.
2. Repo -> Settings -> Secrets and variables -> Actions -> **Variables** tab -> New repository variable:
   - `SUPABASE_URL` = the Project URL
   - `SUPABASE_PUBLISHABLE_KEY` = the publishable key
   - `STAFF_LOGIN_EMAIL` = the shared staff email from step A3 (public; it ends up in the page code, which is fine — the password is what protects the login and it is never stored anywhere in this project)
3. Repo -> Actions -> "Deploy to GitHub Pages" -> **Run workflow** (or push any commit).
4. The app lives at `https://rrichenberger1983.github.io/thanksgiving-seating-tracker/`. Share that link. Staff sign in with Username `thanksgiving` (not case-sensitive) and the shared password, and can "Add to Home Screen".

## C. iPhone / iPad install
Safari -> open the link -> Share -> **Add to Home Screen**.

## D. After the event
Run `supabase/delete_event_data.sql`, delete the staff logins, then pause or delete the Supabase project. See docs/PRIVACY-AND-ACCESS.md.
