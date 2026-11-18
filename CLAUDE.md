# Thanksgiving Seating Tracker

One-event PWA (Nov 19, 2026) for facility staff to find dinner guests, view the four dining-room maps, and check guests in across devices. React + TypeScript + Vite, Supabase (Postgres/Auth/Realtime), GitHub Pages.

## Status
MVP built and tested (see docs/TESTING.md). Remaining: Supabase setup by the owner (docs/SETUP.md) and physical-device checks.

## Commands
- `npm run build` — regenerates layout/SQL, typechecks, builds to `dist/`
- `npm test` — layout, logic, SQL/RLS (in-process Postgres), and hook tests
- `npm run layout` — regenerate `src/data/layout.json` and `supabase/*.sql` from `src/data/layout-raw.json`

## Architecture notes
- Table geometry: `src/data/layout-raw.json` (pixels measured from the 4 floor-plan photos) -> `scripts/build-layout.mjs` -> stable IDs (MD-01…, AR-01…, 200-01…, ES-01…) + normalized coordinates -> seed SQL. Never hand-edit generated files.
- Decorative walls/doors live in `src/features.ts` (not in the database).
- Every write is version-checked (`where id = ? and version = ?`); 0 rows means someone else changed it first. The UI never shows a check-in as done until the database returns the row.
- Schema changes only via new files in `supabase/migrations/`; `supabase/setup.sql` is generated.

## Security (read before every change)
- Data stored: first name, last initial, table, check-in status. Nothing else. No diagnoses, resident room numbers, or clinical data. Never add free-text fields.
- Fictional data only until the facility authorizes real data (see docs/PRIVACY-AND-ACCESS.md). Never claim HIPAA compliance.
- RLS ON for every table; no policy = no access; nothing granted to `anon`/`public`. Access requires a row in `public.staff`, not just a login.
- Public sign-up OFF in Supabase Auth. Accounts are created by an admin only.
- Least privilege: staff get column-level grants only (no delete, no version/timestamp writes). Server trigger controls version, timestamps, `updated_by`.
- Only the Supabase URL and *publishable* key ever appear in client code/build. Never the service-role/secret key, never in the repo, chat, or GitHub Actions.
- Every SECURITY DEFINER function sets `search_path = ''`.
- No offline mutation queue: failed saves show an error with Retry.
- Never touch other projects (PaintBid, Tailgate HQ, Lighthouse I/O, InfoVault, referral-tracker) or their Supabase databases.
- Known exception to "private repo": GitHub Pages on a free plan needs a public repo. The repo contains code only — no data, no secrets.
- Run `npm audit` before each deploy; keep dependencies current.
