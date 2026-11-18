# Privacy, access, and facility approval

## What the app stores
First name, last initial, table assignment, check-in status/time, and which staff account last changed a record. No diagnoses, resident room numbers, clinical information, phone numbers, or free text. The form tells staff not to enter any.

## Before real data goes in — get these answered by the facility (this is a checklist, not legal advice)
- Does facility policy allow an external web host (GitHub Pages) and an external database vendor (Supabase) for guest names? Who approves it (IT, compliance/privacy officer, administrator)?
- Are any guests current residents/patients? A name together with being a resident of a skilled nursing facility may be protected health information. If so, ask the privacy officer whether a vendor agreement (BAA) is required. Supabase's BAA/HIPAA offering, to my knowledge, is only on certain paid plans — verify with Supabase before relying on it. This app has **not** been assessed for HIPAA and makes no compliance claim.
- Who may be given staff accounts, and is shared-device use (one tablet, several people) acceptable?
- Retention: when must the data be deleted? (Default here: right after the event.)
- Until approved: use fictional guests only (`supabase/seed_test_guests.sql`).

## How access works
- Sign-up is disabled; an admin creates each login.
- Having a login is not enough: the database only answers accounts listed in `public.staff` (row-level security).
- Anonymous visitors get nothing from the database. The public page itself only shows a sign-in form.

## Revoke a person's access
SQL Editor: `delete from public.staff where email = 'person@example.org';` (takes effect on their next request), then Authentication -> Users -> Delete user. Snippets: `supabase/staff_admin.sql`.

## Delete the event data afterward
Run `supabase/delete_event_data.sql` (deletes all guests and all staff rows), delete the logins, then pause/delete the Supabase project. Deleting the GitHub repo is optional — it holds no guest data.

## Notes
- The browser stores the staff login session in local storage on that device. Staff should sign out on shared devices (Sign out link, top right).
- Supabase keeps its own backups/logs per its plan; deleting the project removes them per Supabase's policy.
