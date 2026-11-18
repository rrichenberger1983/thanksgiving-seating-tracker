# Security review — 2026-11-18

**Method:** self-review by the build session against the new-app security baseline. The separate `security-auditor` agent was **not available** in this session, so this is *not* an independent audit. Re-run the auditor on the repo when you have it.

## Baseline checklist
| Item | Status |
|---|---|
| RLS enabled on every table; explicit policy per role | Done and tested (`tests/db.test.ts`) |
| Nothing granted to `anon`/`public` | Done and tested |
| Public sign-up off | **Owner action** in Supabase dashboard (docs/SETUP.md A2). Defense in depth: even if left on, a new account sees nothing (needs a `public.staff` row) — tested |
| Data API scope | Needed by the app; only `public` schema holds data. Staff have column-level grants, no DELETE |
| SECURITY DEFINER functions set `search_path` | `is_staff()` uses `search_path = ''` |
| Schema changes via migration files | Yes (`supabase/migrations/`) |
| Service-role / secret keys | None in code, build, repo, or workflow. Build uses URL + publishable key only (bundle scan clean; the only `sb_secret_` string is supabase-js's own key-prefix check) |
| Security headers | CSP set via `<meta>` (script/style `'self'`, connect only to `*.supabase.co`), `referrer: no-referrer`. **Not possible on GitHub Pages:** X-Frame-Options / frame-ancestors (meta can't set them). Pages serves HTTPS |
| Login lockout / rate limit | Client-side 30 s cooldown after 5 failures (cosmetic only). Real protection is Supabase Auth's built-in rate limits — check Authentication -> Rate Limits |
| AI call limits; server-side URL fetching | Not applicable (no AI, no server code) |
| Free-text fields with personal data | None. Names are validated (letters only, 40 chars, DB constraint too); form warns not to enter room numbers or health info |
| Dependencies current / known vulnerabilities | `npm audit`: 0 vulnerabilities (minimal deps: react, react-dom, supabase-js) |
| Repo private | **Exception:** public, because free GitHub Pages requires it. Code only; no data or secrets (`.gitignore` covers env files) |
| Fake data only | Yes — `seed_test_guests.sql` is fictional |

## Findings
| # | Severity | Finding | Action |
|---|---|---|---|
| 1 | Medium | No X-Frame-Options/frame-ancestors on GitHub Pages (clickjacking of the login page possible in theory). Data exposure is limited (first name + initial, behind login) | Accepted for a one-day event. Move to Cloudflare/Vercel if this is ever reused |
| 2 | Medium | Sign-up must be disabled by the owner in the dashboard (cannot be done in SQL). RLS already prevents data access by strangers | Do docs/SETUP.md A2 and confirm |
| 3 | Low | Session token lives in browser local storage (supabase-js default). XSS is the main risk; mitigated by strict CSP, no third-party scripts, no `dangerouslySetInnerHTML` | Staff sign out on shared devices |
| 4 | Low | All staff can see and edit all guests; only the last editor (`updated_by`) is recorded, no history | By design for MVP |
| 5 | Info | Supabase Security Advisors not run (no access to the project from this session) | Run Dashboard -> Advisors -> Security after setup; expect no RLS warnings |
| 6 | Info | Real-name data is not authorized yet | See docs/PRIVACY-AND-ACCESS.md |
| 7 | Low | Shared login (added later the same day): one account for all staff, so no per-person accountability and revocation is all-or-nothing. The shared email is public in the page code; the password is not stored anywhere. A weak/guessable password is the main risk | Use a long unique password; rely on Supabase Auth rate limits; rotate after the event |

No Critical or High findings.
