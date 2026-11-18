// Generates supabase/seed_test_guests.sql: FICTIONAL guests for testing only.
import fs from 'node:fs';
const layout = JSON.parse(fs.readFileSync('src/data/layout.json', 'utf8'));
const names = ['Ava','Ben','Cora','Dale','Edie','Finn','Gus','Hana','Ivan','June','Kit','Lena','Milo','Nora','Otis','Pia','Quinn','Rex','Sage','Tess','Uma','Vic','Wren','Xavi','Yara','Zane'];
let seed = 20261119;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const rows = [];
for (let i = 0; i < 48; i++) {
  const t = layout.tables[Math.floor(rnd() * layout.tables.length)];
  const first = names[i % names.length];
  const initial = String.fromCharCode(65 + Math.floor(rnd() * 26));
  rows.push(`  ('${first}', '${initial}', '${t.id}')`);
}
const sql = `-- FICTIONAL TEST GUESTS ONLY. Names are made up. Run in the SQL Editor (it bypasses RLS).
-- Before entering any real data, run:  delete from public.guests;
insert into public.guests (first_name, last_initial, table_id) values
${rows.join(',\n')};
`;
fs.writeFileSync('supabase/seed_test_guests.sql', sql);
console.log('wrote', rows.length, 'fictional guests');
