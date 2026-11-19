// Runs the real schema + RLS against an in-process Postgres (PGlite). This proves the SQL
// logic. It is NOT a test of the live Supabase project (Auth, Realtime, network) — see docs/TESTING.md.
import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

const STAFF = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222'; // signed in, NOT on the staff list
const STAFF2 = '33333333-3333-3333-3333-333333333333';

const stub = `
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  create publication supabase_realtime;
  alter default privileges in schema public grant all on tables to anon, authenticated;
`;

let db: PGlite;
async function as<T>(role: 'anon' | 'authenticated' | null, uid: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`reset role; select set_config('test.uid', '${uid ?? ''}', false);`);
  if (role) await db.exec(`set role ${role};`);
  try { return await fn(); } finally { await db.exec('reset role;'); }
}
const q = (sql: string, p: unknown[] = []) => db.query<any>(sql, p);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(stub);
  await db.exec(fs.readFileSync('supabase/migrations/0001_schema.sql', 'utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/0002_seed_tables.sql', 'utf8'));
  await db.exec(`insert into auth.users values ('${STAFF}','a@x.test'),('${OTHER}','b@x.test'),('${STAFF2}','c@x.test');
                 insert into public.staff (user_id,email) values ('${STAFF}','a@x.test'),('${STAFF2}','c@x.test');`);
});

describe('seed data', () => {
  it('has 4 areas and 60 tables with correct per-room counts', async () => {
    const r = await q(`select area_id, count(*)::int n from public.dining_tables group by 1 order by 1`);
    expect(Object.fromEntries(r.rows.map((x) => [x.area_id, x.n]))).toEqual({ '200': 10, AR: 13, ES: 6, MD: 31 });
  });
  it('every table belongs to an existing area; no capacities invented', async () => {
    const r = await q(`select count(*)::int n from public.dining_tables t left join public.dining_areas a on a.id=t.area_id where a.id is null`);
    expect(r.rows[0].n).toBe(0);
    const c = await q(`select count(*)::int n from public.dining_tables where capacity is not null`);
    expect(c.rows[0].n).toBe(0);
  });
});

describe('RLS: who can see/do what', () => {
  it('RLS is enabled on every application table', async () => {
    const r = await q(`select relname, relrowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r' order by 1`);
    expect(r.rows.map((x) => x.relname)).toEqual(['dining_areas', 'dining_tables', 'guests', 'staff']);
    expect(r.rows.every((x) => x.relrowsecurity)).toBe(true);
  });
  it('anonymous users get nothing (permission denied)', async () => {
    for (const t of ['guests', 'dining_tables', 'dining_areas', 'staff'])
      await expect(as('anon', null, () => q(`select * from public.${t}`))).rejects.toThrow(/permission denied/);
    await expect(as('anon', null, () => q(`insert into public.guests (first_name,last_initial,table_id) values ('A','B','MD-01')`))).rejects.toThrow(/permission denied/);
  });
  it('a signed-in user who is not on the staff list sees nothing and cannot write', async () => {
    await as('authenticated', OTHER, async () => {
      expect((await q(`select * from public.guests`)).rows).toHaveLength(0);
      expect((await q(`select * from public.dining_tables`)).rows).toHaveLength(0);
      expect((await q(`select * from public.staff`)).rows).toHaveLength(0);
    });
    await expect(as('authenticated', OTHER, () => q(`insert into public.guests (first_name,last_initial,table_id) values ('A','B','MD-01')`))).rejects.toThrow(/row-level security/);
  });
  it('staff can read areas/tables and only their own staff row', async () => {
    await as('authenticated', STAFF, async () => {
      expect((await q(`select * from public.dining_areas`)).rows).toHaveLength(4);
      expect((await q(`select * from public.dining_tables`)).rows).toHaveLength(60);
      expect((await q(`select user_id from public.staff`)).rows.map((r) => r.user_id)).toEqual([STAFF]);
    });
  });
  it('staff cannot edit tables/areas/staff or grant themselves access', async () => {
    await expect(as('authenticated', STAFF, () => q(`update public.dining_tables set label='x'`))).rejects.toThrow(/permission denied/);
    await expect(as('authenticated', STAFF, () => q(`insert into public.staff (user_id) values ('${OTHER}')`))).rejects.toThrow(/permission denied/);
    await expect(as('authenticated', STAFF, () => q(`delete from public.guests`))).rejects.toThrow(/permission denied/);
  });
});

describe('guest create / edit / reassign', () => {
  let id = '';
  it('creates a guest; server controls version and check-in fields', async () => {
    const r = await as('authenticated', STAFF, () =>
      q(`insert into public.guests (first_name,last_initial,table_id) values ('  mary ','s','MD-01') returning *`));
    const row = r.rows[0]; id = row.id;
    expect(row.first_name).toBe('mary');
    expect(row.last_initial).toBe('S');
    expect(row.version).toBe(1);
    expect(row.checked_in).toBe(false);
    expect(row.updated_by).toBe(STAFF);
  });
  it('clients cannot set version, check-in, or timestamps on insert', async () => {
    await expect(as('authenticated', STAFF, () => q(`insert into public.guests (first_name,last_initial,table_id,version) values ('A','B','MD-01',99)`))).rejects.toThrow(/permission denied/);
    await expect(as('authenticated', STAFF, () => q(`insert into public.guests (first_name,last_initial,table_id,checked_in) values ('A','B','MD-01',true)`))).rejects.toThrow(/permission denied/);
  });
  it('rejects invalid names, initials and unknown tables', async () => {
    const bad = (a: string, b: string, t: string) =>
      as('authenticated', STAFF, () => q(`insert into public.guests (first_name,last_initial,table_id) values ($1,$2,$3)`, [a, b, t]));
    await expect(bad('<script>', 'A', 'MD-01')).rejects.toThrow(/check constraint/);
    await expect(bad('Mary', '12', 'MD-01')).rejects.toThrow(/check constraint/);
    await expect(bad('', 'A', 'MD-01')).rejects.toThrow(/check constraint/);
    await expect(bad('x'.repeat(41), 'A', 'MD-01')).rejects.toThrow(/check constraint/);
    await expect(bad('Mary', 'S', 'NOPE-1')).rejects.toThrow(/foreign key/);
  });
  it('reassigns between tables and rooms (version-checked)', async () => {
    const r = await as('authenticated', STAFF, () =>
      q(`update public.guests set table_id='AR-03' where id=$1 and version=1 returning table_id, version`, [id]));
    expect(r.rows[0]).toEqual({ table_id: 'AR-03', version: 2 });
    const room = await q(`select t.area_id from public.guests g join public.dining_tables t on t.id=g.table_id where g.id=$1`, [id]);
    expect(room.rows[0].area_id).toBe('AR');
  });
  it('cannot reassign to a table that does not exist', async () => {
    await expect(as('authenticated', STAFF, () => q(`update public.guests set table_id='ZZ-01' where id=$1`, [id]))).rejects.toThrow(/foreign key/);
  });
});

describe('check-in / undo and stale-write protection', () => {
  let id = '';
  beforeAll(async () => {
    const r = await as('authenticated', STAFF, () => q(`insert into public.guests (first_name,last_initial,table_id) values ('Pat','K','ES-01') returning id`));
    id = r.rows[0].id;
  });
  const checkIn = (uid: string, value: boolean, version: number) =>
    as('authenticated', uid, () =>
      q(`update public.guests set checked_in=$2 where id=$1 and version=$3 returning checked_in, checked_in_at, version`, [id, value, version]));

  it('check in sets time and bumps version', async () => {
    const r = await checkIn(STAFF, true, 1);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].checked_in).toBe(true);
    expect(r.rows[0].checked_in_at).not.toBeNull();
    expect(r.rows[0].version).toBe(2);
  });
  it('a second staff member holding the old version is rejected (0 rows) — no silent overwrite', async () => {
    const stale = await checkIn(STAFF2, false, 1);
    expect(stale.rows).toHaveLength(0);
    const now = await q(`select checked_in, version from public.guests where id=$1`, [id]);
    expect(now.rows[0]).toEqual({ checked_in: true, version: 2 });
  });
  it('undo clears the time and bumps version again', async () => {
    const r = await checkIn(STAFF2, false, 2);
    expect(r.rows[0]).toMatchObject({ checked_in: false, checked_in_at: null, version: 3 });
  });
  it('a repeated check-in with the same (now stale) version is also rejected', async () => {
    await checkIn(STAFF, true, 3);
    const dup = await checkIn(STAFF2, true, 3);
    expect(dup.rows).toHaveLength(0);
  });
  it('clients cannot tamper with version / timestamps / updated_by directly', async () => {
    await expect(as('authenticated', STAFF, () => q(`update public.guests set version=1 where id=$1`, [id]))).rejects.toThrow(/permission denied/);
    await expect(as('authenticated', STAFF, () => q(`update public.guests set checked_in_at=now() where id=$1`, [id]))).rejects.toThrow(/permission denied/);
  });
  it('realtime publication includes guests (when the publication exists)', async () => {
    const r = await q(`select tablename from pg_publication_tables where pubname='supabase_realtime'`);
    expect(r.rows.map((x) => x.tablename)).toContain('guests');
  });
});

describe('migration 0003: add AR-13 (existing projects)', () => {
  const mig = () => fs.readFileSync('supabase/migrations/0003_add_ar13.sql', 'utf8');
  it('is additive and idempotent, matches the generated seed row, and leaves guests/other tables untouched', async () => {
    const before = await q(`select id, x, y, w, h from public.dining_tables where id <> 'AR-13' order by id`);
    const ar13Seed = (await q(`select * from public.dining_tables where id='AR-13'`)).rows[0];
    // Simulate a project that ran the older setup.sql (no AR-13) and already has a guest assigned.
    await db.exec(`delete from public.dining_tables where id='AR-13'`);
    await db.exec(`insert into public.guests (first_name,last_initial,table_id) values ('Mig','R','AR-12')`);
    expect((await q(`select count(*)::int n from public.dining_tables`)).rows[0].n).toBe(59);
    await db.exec(mig());
    await db.exec(mig()); // run twice
    expect((await q(`select count(*)::int n from public.dining_tables`)).rows[0].n).toBe(60);
    expect((await q(`select * from public.dining_tables where id='AR-13'`)).rows[0]).toEqual(ar13Seed);
    const after = await q(`select id, x, y, w, h from public.dining_tables where id <> 'AR-13' order by id`);
    expect(after.rows).toEqual(before.rows);
    expect((await q(`select count(*)::int n from public.guests where first_name='Mig' and table_id='AR-12'`)).rows[0].n).toBe(1);
  });
  it('a guest can be assigned to AR-13 and checked in (same rules as every table)', async () => {
    const r = await as('authenticated', STAFF, () => q(`insert into public.guests (first_name,last_initial,table_id) values ('Thirteen','T','AR-13') returning id, version`));
    const c = await as('authenticated', STAFF, () => q(`update public.guests set checked_in=true where id=$1 and version=$2 returning checked_in, version`, [r.rows[0].id, r.rows[0].version]));
    expect(c.rows[0]).toEqual({ checked_in: true, version: 2 });
  });
});
