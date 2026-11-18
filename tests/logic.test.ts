import { describe, expect, it } from 'vitest';
import layout from '../src/data/layout.json';
import {
  computeStats, countsByTable, mergeGuest, reconcileGuests, searchGuests, validateGuest,
} from '../src/logic';
import type { Area, Guest, TableRow } from '../src/types';

const tables = layout.tables.map((t) => ({ ...t, capacity: null })) as TableRow[];
const areas = layout.areas as Area[];
const g = (over: Partial<Guest> & { id: string }): Guest => ({
  first_name: 'Mary', last_initial: 'S', table_id: 'MD-01', checked_in: false,
  checked_in_at: null, version: 1, updated_at: '2026-11-19T12:00:00Z', ...over,
});

describe('search', () => {
  const list = [
    g({ id: '1', first_name: 'Mary', last_initial: 'S' }),
    g({ id: '2', first_name: 'Marcus', last_initial: 'T' }),
    g({ id: '3', first_name: 'Sam', last_initial: 'M' }),
    g({ id: '4', first_name: 'Ann-Marie', last_initial: 'K' }),
  ];
  it('prefix "mar" finds Mary and Marcus (and Ann-Marie by substring)', () => {
    expect(searchGuests(list, 'mar').map((x) => x.first_name).sort()).toEqual(['Ann-Marie', 'Marcus', 'Mary']);
  });
  it('a single letter matches last initial or first-name start', () => {
    expect(searchGuests(list, 's').map((x) => x.first_name).sort()).toEqual(['Mary', 'Sam']);
  });
  it('first name + initial narrows to one', () => {
    expect(searchGuests(list, 'mary s').map((x) => x.id)).toEqual(['1']);
  });
  it('empty query returns everyone sorted by name', () => {
    expect(searchGuests(list, '').map((x) => x.first_name)).toEqual(['Ann-Marie', 'Marcus', 'Mary', 'Sam']);
  });
  it('is case-insensitive and ignores extra spaces', () => {
    expect(searchGuests(list, '  MARY   s ').map((x) => x.id)).toEqual(['1']);
  });
});

describe('realtime merge / stale protection', () => {
  it('ignores an older version, accepts a newer one', () => {
    const m = { a: g({ id: 'a', version: 3, checked_in: true }) };
    expect(mergeGuest(m, g({ id: 'a', version: 2, checked_in: false })).a.checked_in).toBe(true);
    expect(mergeGuest(m, g({ id: 'a', version: 4, checked_in: false })).a.checked_in).toBe(false);
  });
  it('adds unknown guests', () => {
    expect(Object.keys(mergeGuest({}, g({ id: 'z' })))).toEqual(['z']);
  });
  it('a full refresh never rolls back a newer realtime row', () => {
    const local = { a: g({ id: 'a', version: 5, checked_in: true }) };
    const out = reconcileGuests(local, [g({ id: 'a', version: 4 }), g({ id: 'b' })]);
    expect(out.a.version).toBe(5);
    expect(out.b).toBeDefined();
  });
  it('a full refresh drops guests that no longer exist on the server', () => {
    const out = reconcileGuests({ gone: g({ id: 'gone' }) }, []);
    expect(out).toEqual({});
  });
});

describe('dashboard totals', () => {
  const guests = [
    g({ id: '1', table_id: 'MD-01', checked_in: true }),
    g({ id: '2', table_id: 'MD-02' }),
    g({ id: '3', table_id: 'AR-01', checked_in: true }),
    g({ id: '4', table_id: 'ES-06' }),
  ];
  it('computes total / arrived / remaining and per-room', () => {
    const s = computeStats(guests, tables, areas);
    expect([s.total, s.arrived, s.remaining]).toEqual([4, 2, 2]);
    expect(s.rooms.map((r) => [r.id, r.arrived, r.assigned])).toEqual([
      ['MD', 1, 2], ['AR', 1, 1], ['200', 0, 0], ['ES', 0, 1],
    ]);
  });
  it('counts per table', () => {
    expect(countsByTable(guests)['MD-01']).toEqual({ assigned: 1, arrived: 1 });
  });
});

describe('guest validation', () => {
  const ok = { firstName: 'Mary', lastInitial: 'S', areaId: 'MD', tableId: 'MD-12' };
  it('accepts a valid guest', () => expect(validateGuest(ok, tables)).toEqual({}));
  it('requires every field', () => {
    const e = validateGuest({ firstName: '', lastInitial: '', areaId: '', tableId: '' }, tables);
    expect(Object.keys(e).sort()).toEqual(['areaId', 'firstName', 'lastInitial', 'tableId']);
  });
  it('rejects digits / symbols / markup in names', () => {
    expect(validateGuest({ ...ok, firstName: 'Mary2' }, tables).firstName).toBeDefined();
    expect(validateGuest({ ...ok, firstName: '<b>x</b>' }, tables).firstName).toBeDefined();
  });
  it('allows hyphens, apostrophes, accents', () => {
    expect(validateGuest({ ...ok, firstName: "Anne-Marie O'Neil" }, tables)).toEqual({});
    expect(validateGuest({ ...ok, firstName: 'José' }, tables)).toEqual({});
  });
  it('last initial must be exactly one letter', () => {
    expect(validateGuest({ ...ok, lastInitial: 'SM' }, tables).lastInitial).toBeDefined();
    expect(validateGuest({ ...ok, lastInitial: '5' }, tables).lastInitial).toBeDefined();
  });
  it('table must belong to the chosen area (room/table consistency)', () => {
    expect(validateGuest({ ...ok, areaId: 'AR', tableId: 'MD-12' }, tables).tableId).toBeDefined();
    expect(validateGuest({ ...ok, tableId: 'MD-99' }, tables).tableId).toBeDefined();
  });
});
