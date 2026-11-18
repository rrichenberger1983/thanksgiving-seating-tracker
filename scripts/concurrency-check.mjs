// Real multi-connection concurrency check against a throwaway local Postgres.
// Not part of `npm test` (needs a downloaded Postgres binary and a non-root user).
// Run:  mkdir /tmp/pgtest && cd /tmp/pgtest && npm i embedded-postgres pg
//       cp <repo>/scripts/concurrency-check.mjs . && cp -r <repo>/supabase . && node concurrency-check.mjs   (as non-root)
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';

const DIR = '/tmp/pgdata-concurrency';
fs.rmSync(DIR, { recursive: true, force: true });
const server = new EmbeddedPostgres({ databaseDir: DIR, user: 'postgres', password: 'pw', port: 54329, persistent: false });
await server.initialise();
await server.start();
await server.createDatabase('t');

const conn = async () => {
  const c = new pg.Client({ host: 'localhost', port: 54329, user: 'postgres', password: 'pw', database: 't' });
  await c.connect();
  return c;
};
const admin = await conn();
await admin.query(`
  create role anon nologin; create role authenticated nologin;
  create schema auth; create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  create publication supabase_realtime;
  alter default privileges in schema public grant all on tables to anon, authenticated;`);
await admin.query(fs.readFileSync('supabase/migrations/0001_schema.sql', 'utf8'));
await admin.query(fs.readFileSync('supabase/migrations/0002_seed_tables.sql', 'utf8'));
const staffIds = Array.from({ length: 20 }, (_, i) => `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`);
for (const id of staffIds) {
  await admin.query(`insert into auth.users values ($1,$2)`, [id, `${id}@x.test`]);
  await admin.query(`insert into public.staff (user_id) values ($1)`, [id]);
}

const asStaff = async (uid) => {
  const c = await conn();
  await c.query(`set role authenticated`);
  await c.query(`select set_config('test.uid', $1, false)`, [uid]);
  return c;
};
const clients = await Promise.all(staffIds.map(asStaff));
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

// 1) 20 staff devices check in the same guest at the same instant (all hold version 1).
let allOk = true, maxWinners = 0;
for (let round = 0; round < 25; round++) {
  const g = await clients[0].query(`insert into public.guests (first_name,last_initial,table_id) values ('Race','R','MD-01') returning id`);
  const id = g.rows[0].id;
  const res = await Promise.all(clients.map((c) =>
    c.query(`update public.guests set checked_in=true where id=$1 and version=1 returning id`, [id])));
  const winners = res.filter((r) => r.rowCount === 1).length;
  maxWinners = Math.max(maxWinners, winners);
  const row = (await admin.query(`select version, checked_in from public.guests where id=$1`, [id])).rows[0];
  if (winners !== 1 || row.version !== 2 || !row.checked_in) allOk = false;
}
check('25 rounds x 20 simultaneous check-ins: exactly one winner each, version 1 -> 2', allOk, `max winners in a round = ${maxWinners}`);

// 2) Check-in vs undo racing with the same version: one wins, the other is told "stale".
allOk = true;
for (let round = 0; round < 25; round++) {
  const g = await clients[0].query(`insert into public.guests (first_name,last_initial,table_id) values ('Race','U','MD-02') returning id`);
  const id = g.rows[0].id;
  const [a, b] = await Promise.all([
    clients[1].query(`update public.guests set checked_in=true  where id=$1 and version=1 returning id`, [id]),
    clients[2].query(`update public.guests set table_id='MD-03' where id=$1 and version=1 returning id`, [id]),
  ]);
  if (a.rowCount + b.rowCount !== 1) allOk = false;
}
check('check-in vs reassignment racing on the same version: exactly one succeeds', allOk);

// 3) Deterministic interleave: A holds the row lock, B waits, A commits, B must re-check and match 0 rows.
const g3 = await clients[0].query(`insert into public.guests (first_name,last_initial,table_id) values ('Lock','L','MD-04') returning id`);
const id3 = g3.rows[0].id;
await clients[3].query('begin');
await clients[3].query(`update public.guests set checked_in=true where id=$1 and version=1`, [id3]);
const pendingB = clients[4].query(`update public.guests set checked_in=true where id=$1 and version=1 returning id`, [id3]);
await new Promise((r) => setTimeout(r, 400));
await clients[3].query('commit');
const b3 = await pendingB;
check('blocked second writer re-checks version after the first commits and updates 0 rows', b3.rowCount === 0);

// 4) A non-staff session sees nothing even though it is authenticated.
const outsider = await asStaff('99999999-9999-9999-9999-999999999999');
const seen = await outsider.query('select count(*)::int n from public.guests');
check('authenticated non-staff user sees 0 guests', seen.rows[0].n === 0);

for (const c of [...clients, outsider, admin]) await c.end();
await server.stop();
console.log(failures === 0 ? '\nALL CONCURRENCY CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
