import type { Area, Guest, TableRow } from './types';

/** Insert/replace a guest from the server (realtime or fetch). Older versions never win. */
export function mergeGuest(map: Record<string, Guest>, incoming: Guest): Record<string, Guest> {
  const cur = map[incoming.id];
  if (cur && cur.version > incoming.version) return map;
  return { ...map, [incoming.id]: incoming };
}

/** Replace local state with an authoritative full fetch. */
export function indexGuests(rows: Guest[]): Record<string, Guest> {
  const out: Record<string, Guest> = {};
  for (const g of rows) out[g.id] = g;
  return out;
}

/** Merge an authoritative fetch with local state: never go backwards on a newer realtime row. */
export function reconcileGuests(local: Record<string, Guest>, fetched: Guest[]): Record<string, Guest> {
  const out = indexGuests(fetched);
  for (const id of Object.keys(out)) {
    const l = local[id];
    if (l && l.version > out[id].version) out[id] = l;
  }
  return out;
}

/** "mar" / "s" / "mary s" — every token must match first name or last initial. */
export function searchGuests(guests: Guest[], query: string): Guest[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const sorted = [...guests].sort(
    (a, b) => a.first_name.localeCompare(b.first_name) || a.last_initial.localeCompare(b.last_initial),
  );
  if (tokens.length === 0) return sorted;
  return sorted.filter((g) => {
    const first = g.first_name.toLowerCase();
    const initial = g.last_initial.toLowerCase();
    return tokens.every(
      (t) => first.startsWith(t) || (t.length === 1 && initial === t) || (t.length >= 2 && first.includes(t)),
    );
  });
}

export interface Counts {
  assigned: number;
  arrived: number;
}

export function countsByTable(guests: Guest[]): Record<string, Counts> {
  const out: Record<string, Counts> = {};
  for (const g of guests) {
    const c = (out[g.table_id] ??= { assigned: 0, arrived: 0 });
    c.assigned += 1;
    if (g.checked_in) c.arrived += 1;
  }
  return out;
}

export interface Stats {
  total: number;
  arrived: number;
  remaining: number;
  rooms: { id: string; name: string; assigned: number; arrived: number }[];
}

export function computeStats(guests: Guest[], tables: TableRow[], areas: Area[]): Stats {
  const areaOfTable = new Map(tables.map((t) => [t.id, t.area_id]));
  const arrived = guests.filter((g) => g.checked_in).length;
  const rooms = [...areas]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((a) => {
      const inRoom = guests.filter((g) => areaOfTable.get(g.table_id) === a.id);
      return { id: a.id, name: a.name, assigned: inRoom.length, arrived: inRoom.filter((g) => g.checked_in).length };
    });
  return { total: guests.length, arrived, remaining: guests.length - arrived, rooms };
}

export interface GuestInput {
  firstName: string;
  lastInitial: string;
  areaId: string;
  tableId: string;
}

export type FieldErrors = Partial<Record<keyof GuestInput, string>>;

export function validateGuest(input: GuestInput, tables: TableRow[]): FieldErrors {
  const e: FieldErrors = {};
  const first = input.firstName.trim();
  if (!first) e.firstName = 'Enter a first name.';
  else if (first.length > 40) e.firstName = 'Keep it under 40 characters.';
  else if (!/^[\p{L}][\p{L} .'’-]*$/u.test(first)) e.firstName = 'Letters only (spaces, . - \' allowed).';
  const initial = input.lastInitial.trim();
  if (!initial) e.lastInitial = 'Enter one letter.';
  else if (!/^\p{L}$/u.test(initial)) e.lastInitial = 'One letter only.';
  if (!input.areaId) e.areaId = 'Choose a dining area.';
  if (!input.tableId) e.tableId = 'Choose a table.';
  else {
    const t = tables.find((x) => x.id === input.tableId);
    if (!t) e.tableId = 'That table does not exist.';
    else if (input.areaId && t.area_id !== input.areaId) e.tableId = 'That table is not in the chosen area.';
  }
  return e;
}

export const guestLabel = (g: Pick<Guest, 'first_name' | 'last_initial'>) => `${g.first_name} ${g.last_initial}.`;
