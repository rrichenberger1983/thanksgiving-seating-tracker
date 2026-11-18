# Setup (about 15 minutes, all doable from an iPad)

## A. Supabase (the dedicated Thanksgiving project)
1. Dashboard -> **SQL Editor** -> New query -> paste all of `supabase/setup.sql` -> Run. (Creates tables, security rules, the 59 tables, live updates.)
2. **Turn off public sign-up:** Authentication -> Sign In / Providers -> turn **off** "Allow new users to sign up". Leave "Allow anonymous sign-ins" off.
3. **Create staff logins:** Authentication -> Users -> Add user -> Create new user (email + password, tick *Auto Confirm User*). Use strong, unique passwords.
4. **Authorize them:** SQL Editor -> paste the "GRANT" snippet from `supabase/staff_admin.sql` with the real emails -> Run. A login without a row in `public.staff` sees nothing.
5. **Test data (optional, fictional only):** run `supabase/seed_test_guests.sql`.
6. **Copy two public values:** Project Settings -> API (or Connect): the **Project URL** and the **publishable key** (`sb_publishable_…`). Never use the `service_role`/secret key anywhere in this app.

## B. GitHub Pages (the live link)
1. Repo -> Settings -> **Pages** -> Source: **GitHub Actions**.
2. Repo -> Settings -> Secrets and variables -> Actions -> **Variables** tab -> New repository variable:
   - `SUPABASE_URL` = the Project URL
   - `SUPABASE_PUBLISHABLE_KEY` = the publishable key
3. Repo -> Actions -> "Deploy to GitHub Pages" -> **Run workflow** (or push any commit).
4. The app lives at `https://rrichenberger1983.github.io/thanksgiving-seating-tracker/`. Share that link; staff open it, sign in, and can "Add to Home Screen".

## C. iPhone / iPad install
Safari -> open the link -> Share -> **Add to Home Screen**.

## D. After the event
Run `supabase/delete_event_data.sql`, delete the staff logins, then pause or delete the Supabase project. See docs/PRIVACY-AND-ACCESS.md.
