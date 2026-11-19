# Thanksgiving Seating Tracker

Mobile-first PWA for facility staff: find a guest, see the dining-room maps, check guests in, and see changes from other devices live.

- **Rooms/tables:** Main Dining 31, Activity Room 13, 200 Hall Pod 10, East Side Dining 6 (60 total).
- **Stores only:** first name, last initial, table, check-in status.
- **Stack:** React + TypeScript + Vite, Supabase (Postgres, Auth, Realtime), GitHub Pages.

Start with **[docs/SETUP.md](docs/SETUP.md)**. Also: [privacy & access](docs/PRIVACY-AND-ACCESS.md), [testing](docs/TESTING.md), [security review](docs/security-audit-2026-11-18.md).

```bash
npm ci
npm test
VITE_SUPABASE_URL=... VITE_SUPABASE_PUBLISHABLE_KEY=... VITE_STAFF_LOGIN_EMAIL=... npm run dev
```
