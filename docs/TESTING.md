# Testing — what was run, and what was not

## Automated (run with `npm test`; 49 tests, all passing on 2026-11-18)
| Area | How | Result |
|---|---|---|
| Table counts & numbering (MD 31 / AR 12 / 200 10 / ES 6 = 59), unique IDs, in-bounds, no overlaps | `tests/layout.test.ts` | pass |
| Search (first name / last initial), merge & stale-update rules, dashboard totals, input validation, room/table consistency | `tests/logic.test.ts` | pass |
| Schema, **RLS**, anon/non-staff denial, column grants, check-in / undo, version-based stale-write rejection, reassignment, validation constraints | `tests/db.test.ts` — real Postgres engine (PGlite) with a stand-in for Supabase's `auth` schema | pass |
| Hook behaviour: no check-in shown until DB confirms, failed save -> error + Retry, stale write -> latest shown, realtime merge, refresh + re-subscribe on resume/online/offline | `tests/useData.test.ts` — fake Supabase client | pass |
| True simultaneous writers (20 connections x 25 rounds: exactly one winner each; blocked-writer re-check) | `scripts/concurrency-check.mjs` against a throwaway real Postgres 17 (run once, outside `npm test`) | pass |
| Production build + typecheck | `npm run build` | pass |
| Dependency vulnerabilities | `npm audit` | 0 found |

## NOT covered by automation (limits)
- The **live Supabase project**: Auth settings (sign-up off), Realtime delivery over the network, and RLS as enforced by Supabase's own `auth.uid()` were **not** tested here — the Supabase project is in an account this session cannot reach. The SQL is the same file the tests ran; the stand-in only replaces `auth.uid()`.
- Real **reconnection after interrupted connectivity** (Wi-Fi drop with a live websocket) — only simulated with a fake client.
- **Mobile usability** on real iPhones/iPads (tap sizes, pinch/pan feel, PWA install) — layout was reviewed from rendered images only.
- The **deployed site** is verified separately (see final report).

## Physical-device checklist (5 minutes, two devices)
1. Open the link on an iPhone and an iPad; sign in with two different staff accounts.
2. Guests tab: search "ma" and a single letter; results make sense.
3. Check a fictional guest in on device A -> device B shows ARRIVED within a few seconds. Undo on B -> A updates.
4. On both devices, tap Check In for the same guest at the same moment -> one succeeds, the other shows "Already checked in".
5. Dining Maps: all 4 rooms load; pinch/zoom; tap a table; tables show arrived/assigned counts; check in from the table view.
6. Turn on Airplane Mode on device A -> status shows Offline; a Check In shows "Not saved" with Retry; turn it off -> status returns to Live and the Retry works.
7. Lock the screen 1 minute and reopen -> data refreshes.
8. Add Guest: add, edit, reassign to another room; it appears on the other device.
9. Sign in as a login that is NOT on the staff list -> "Not authorized", no data.
10. Add to Home Screen; launches full-screen.
