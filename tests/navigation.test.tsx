// @vitest-environment jsdom
// Guest -> table navigation: Guests list tap, Maps focus/highlight/pan, independence of check-in,
// graceful handling of missing tables, and an end-to-end flow through the real Main component.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import layout from '../src/data/layout.json';
import { ROOM_VIEWS } from '../src/features';
import type { DataApi } from '../src/useData';
import type { Area, Guest, TableRow } from '../src/types';

type Row = Record<string, any>;
const S = vi.hoisted(() => ({ guests: [] as Row[] }));

// Fake Supabase client (used only by the end-to-end test through useData).
vi.mock('../src/supabase', () => {
  const builder = (table: string) => {
    const q: Row = { op: 'select', eq: {}, single: false, payload: null };
    const api: any = {
      select: () => api, order: () => api, abortSignal: () => api,
      update: (p: Row) => ((q.op = 'update'), (q.payload = p), api),
      eq: (k: string, v: unknown) => ((q.eq[k] = v), api),
      maybeSingle: () => ((q.single = true), api),
      then: (res: any, rej: any) => exec().then(res, rej),
    };
    const match = () => S.guests.filter((g) => Object.entries(q.eq).every(([k, v]) => g[k] === v));
    const exec = async () => {
      if (table === 'dining_areas') return { data: layout.areas, error: null };
      if (table === 'dining_tables') return { data: layout.tables, error: null };
      if (q.op === 'update') {
        const rows = match();
        rows.forEach((g) => Object.assign(g, q.payload, { version: g.version + 1, checked_in_at: '2026-11-19T18:00:00Z' }));
        return { data: rows.map((g) => ({ ...g })), error: null };
      }
      const rows = match();
      return { data: q.single ? (rows[0] ?? null) : rows.map((g) => ({ ...g })), error: null };
    };
    return api;
  };
  const supabase = {
    from: builder,
    channel: () => { const ch: any = { on: () => ch, subscribe: () => ch }; return ch; },
    removeChannel: () => Promise.resolve('ok'),
    auth: { signOut: vi.fn() },
  };
  return { supabase, configured: true, staffLoginEmail: 'x@example.test' };
});

import { GuestsView } from '../src/components/GuestsView';
import { MapsView } from '../src/components/MapsView';
import { Main } from '../src/App';

const areas = layout.areas as Area[];
const tables = (layout.tables as unknown as TableRow[]).map((t) => ({ ...t, capacity: null }));
const mkGuest = (o: Partial<Guest> & { id: string }): Guest => ({
  first_name: 'Sam', last_initial: 'K', table_id: 'AR-03', checked_in: false, checked_in_at: null,
  version: 1, updated_at: '2026-11-19T12:00:00Z', ...o,
});

function mkData(guests: Guest[]): DataApi & { setCheckIn: ReturnType<typeof vi.fn> } {
  return {
    areas, tables, guests,
    guestMap: Object.fromEntries(guests.map((g) => [g.id, g])),
    tableById: new Map(tables.map((t) => [t.id, t])),
    areaById: new Map(areas.map((a) => [a.id, a])),
    conn: 'live', loaded: true, lastSync: new Date(), loadError: null,
    saving: new Set<string>(), issues: {},
    refresh: vi.fn(), setCheckIn: vi.fn(), saveGuest: vi.fn(),
  } as unknown as DataApi & { setCheckIn: ReturnType<typeof vi.fn> };
}

const sam = mkGuest({ id: 'g1' });
const pat = mkGuest({ id: 'g2', first_name: 'Pat', last_initial: 'L', table_id: 'MD-05', checked_in: true, checked_in_at: '2026-11-19T17:30:00Z' });
const lost = mkGuest({ id: 'g3', first_name: 'Lou', last_initial: 'M', table_id: 'ZZ-99' });

afterEach(cleanup);

describe('Guests list: tap to locate', () => {
  it('tapping the name or the row asks to show that guest\'s table', () => {
    const onLocate = vi.fn();
    render(<GuestsView data={mkData([sam, pat])} onLocate={onLocate} />);
    fireEvent.click(screen.getByText('Sam K.'));
    expect(onLocate).toHaveBeenLastCalledWith('AR-03', 'g1');
    const row = screen.getByText('Pat L.').closest('li')!;
    fireEvent.click(row); // row background
    expect(onLocate).toHaveBeenLastCalledWith('MD-05', 'g2');
    expect(onLocate).toHaveBeenCalledTimes(2);
  });

  it('keyboard: Enter on the name locates', () => {
    const onLocate = vi.fn();
    render(<GuestsView data={mkData([sam])} onLocate={onLocate} />);
    fireEvent.keyDown(screen.getByRole('button', { name: /Show Sam K\. on the map/ }), { key: 'Enter' });
    expect(onLocate).toHaveBeenCalledWith('AR-03', 'g1');
  });

  it('Check In is independent: no navigation, check-in requested exactly once', () => {
    const data = mkData([sam]);
    const onLocate = vi.fn();
    render(<GuestsView data={data} onLocate={onLocate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Check In' }));
    expect(data.setCheckIn).toHaveBeenCalledTimes(1);
    expect(data.setCheckIn).toHaveBeenCalledWith(sam, true);
    expect(onLocate).not.toHaveBeenCalled();
  });

  it('tapping the name never checks anyone in', () => {
    const data = mkData([sam]);
    render(<GuestsView data={data} onLocate={vi.fn()} />);
    fireEvent.click(screen.getByText('Sam K.'));
    expect(data.setCheckIn).not.toHaveBeenCalled();
  });

  it('Undo and Edit stay independent too', () => {
    const data = mkData([pat]);
    const onLocate = vi.fn();
    render(<GuestsView data={data} onLocate={onLocate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(data.setCheckIn).toHaveBeenCalledWith(pat, false);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('dialog', { name: 'Edit guest' })).toBeTruthy();
    expect(onLocate).not.toHaveBeenCalled();
  });

  it('a guest whose table is missing/outdated shows a notice and does not navigate', () => {
    const onLocate = vi.fn();
    render(<GuestsView data={mkData([lost])} onLocate={onLocate} />);
    fireEvent.click(screen.getByText('Lou M.'));
    expect(onLocate).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toMatch(/no table on the map/);
  });

  it('search still works', () => {
    render(<GuestsView data={mkData([sam, pat])} onLocate={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Search guests'), { target: { value: 'pat' } });
    expect(screen.queryByText('Sam K.')).toBeNull();
    expect(screen.getByText('Pat L.')).toBeTruthy();
  });
});

const viewBox = (c: HTMLElement) => (c.querySelector('svg')!.getAttribute('viewBox') as string).split(' ').map(Number);
const ring = (c: HTMLElement) => c.querySelectorAll('.hl-ring');

describe('Dining Maps: focus request', () => {
  const focus = { tableId: 'AR-03', guestId: 'g1', nonce: 1 };

  it('selects the room, outlines the table, zooms to it, and opens the table sheet', () => {
    const { container } = render(<MapsView data={mkData([sam])} focus={focus} />);
    expect(screen.getByRole('tab', { name: /Activity Room/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('dialog', { name: 'Table AR-03' })).toBeTruthy();
    expect(ring(container)).toHaveLength(1);
    const g = ring(container)[0].closest('g.tbl')!;
    expect(g.getAttribute('aria-label')).toMatch(/Table AR-03.*selected/);
    // located guest is marked in the sheet
    expect(screen.getByText('Sam K.').closest('li')!.className).toMatch(/guest-focus/);
    // zoomed in and centered on the table
    const [x, y, w, h] = viewBox(container);
    const base = ROOM_VIEWS.AR.box;
    expect(w).toBeLessThan(base[2]);
    const t = tables.find((r) => r.id === 'AR-03')!;
    const [cx, cy] = [t.x * 2016, t.y * 1512];
    expect(cx).toBeGreaterThan(x); expect(cx).toBeLessThan(x + w);
    expect(cy).toBeGreaterThan(y); expect(cy).toBeLessThan(y + h);
  });

  it('works for another room (Main Dining)', () => {
    render(<MapsView data={mkData([pat])} focus={{ tableId: 'MD-05', guestId: 'g2', nonce: 2 }} />);
    expect(screen.getByRole('tab', { name: /Main Dining/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('dialog', { name: 'Table MD-05' })).toBeTruthy();
  });

  it('existing check-in control works from the opened sheet', () => {
    const data = mkData([sam]);
    render(<MapsView data={data} focus={focus} />);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Check In' }));
    expect(data.setCheckIn).toHaveBeenCalledWith(sam, true);
  });

  it('closing the sheet keeps the outline; selecting another table clears it', () => {
    const { container } = render(<MapsView data={mkData([sam])} focus={focus} />);
    fireEvent.click(screen.getByRole('button', { name: /Close/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(ring(container)).toHaveLength(1);
    fireEvent.click(container.querySelector('g[aria-label^="Table AR-04"]')!);
    expect(screen.getByRole('dialog', { name: 'Table AR-04' })).toBeTruthy();
    expect(ring(container)).toHaveLength(0);
  });

  it('tapping the same located table keeps its outline', () => {
    const { container } = render(<MapsView data={mkData([sam])} focus={focus} />);
    fireEvent.click(container.querySelector('g[aria-label^="Table AR-03"]')!);
    expect(ring(container)).toHaveLength(1);
  });

  it('a focus on a table that no longer exists is ignored without crashing', () => {
    const { container } = render(<MapsView data={mkData([lost])} focus={{ tableId: 'ZZ-99', guestId: 'g3', nonce: 3 }} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(ring(container)).toHaveLength(0);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('normal use is unchanged: no focus -> no outline, tap opens a sheet', () => {
    const { container } = render(<MapsView data={mkData([sam])} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(ring(container)).toHaveLength(0);
    // default room is Main Dining
    fireEvent.click(container.querySelector('g[aria-label^="Table MD-05"]')!);
    expect(screen.getByRole('dialog', { name: 'Table MD-05' })).toBeTruthy();
    expect(ring(container)).toHaveLength(0);
  });
});

describe('end to end through the real app shell', () => {
  beforeEach(() => {
    S.guests = [
      { ...sam, version: 1 },
      { ...pat, version: 1 },
    ];
  });

  it('tap guest -> Dining Maps, right room, table outlined, sheet open; Check In works; leaving the map clears it', async () => {
    const { container } = render(<Main />);
    await screen.findByText('Sam K.');
    fireEvent.click(screen.getByText('Sam K.'));

    // Navigated to Dining Maps with everything in place
    await waitFor(() => expect(screen.getByRole('button', { name: /Dining Maps/ }).getAttribute('aria-current')).toBe('true'));
    expect(screen.getByRole('tab', { name: /Activity Room/ }).getAttribute('aria-selected')).toBe('true');
    const dialog = await screen.findByRole('dialog', { name: 'Table AR-03' });
    expect(container.querySelectorAll('.hl-ring')).toHaveLength(1);
    expect(within(dialog).getByText('NOT ARRIVED')).toBeTruthy(); // tapping did not check anyone in
    expect(S.guests[0].checked_in).toBeFalsy();

    // Existing check-in control, confirmed by the (fake) database before the UI changes
    fireEvent.click(within(dialog).getByRole('button', { name: 'Check In' }));
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByText(/ARRIVED/)).toBeTruthy());
    expect(S.guests[0].checked_in).toBe(true);

    // Leave the map and come back by the normal tab: no stale outline or sheet
    fireEvent.click(screen.getByRole('button', { name: /Guests/ }));
    expect(await screen.findByLabelText('Search guests')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Dining Maps/ }));
    await screen.findByRole('tablist', { name: 'Dining area' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(container.querySelectorAll('.hl-ring')).toHaveLength(0);
  });
});
