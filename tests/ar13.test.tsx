// @vitest-environment jsdom
// AR-13 behaves like every other table: map, forms, guest list, navigation, highlight, fit.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import layout from '../src/data/layout.json';
import { ROOM_VIEWS } from '../src/features';
import type { DataApi } from '../src/useData';
import type { Area, Guest, TableRow } from '../src/types';

vi.mock('../src/supabase', () => ({ supabase: null, configured: true, staffLoginEmail: 'x@example.test' }));

import { GuestForm } from '../src/components/GuestForm';
import { GuestsView } from '../src/components/GuestsView';
import { MapsView } from '../src/components/MapsView';
import { validateGuest } from '../src/logic';

const areas = layout.areas as Area[];
const tables = (layout.tables as unknown as TableRow[]).map((t) => ({ ...t, capacity: null }));
const g13: Guest = { id: 'g13', first_name: 'Thirteen', last_initial: 'T', table_id: 'AR-13', checked_in: false, checked_in_at: null, version: 1, updated_at: '' };
const mk = (guests: Guest[]) =>
  ({
    areas, tables, guests, guestMap: Object.fromEntries(guests.map((g) => [g.id, g])),
    tableById: new Map(tables.map((t) => [t.id, t])), areaById: new Map(areas.map((a) => [a.id, a])),
    conn: 'live', loaded: true, lastSync: new Date(), loadError: null, saving: new Set<string>(), issues: {},
    refresh: vi.fn(), setCheckIn: vi.fn(), saveGuest: vi.fn(),
  }) as unknown as DataApi & { setCheckIn: ReturnType<typeof vi.fn> };

afterEach(cleanup);
const byId = (id: string) => tables.find((t) => t.id === id)!;

describe('AR-13 geometry', () => {
  const a12 = byId('AR-12'), a13 = byId('AR-13'), a11 = byId('AR-11');
  it('matches AR-12 exactly in size and orientation, same row, to its right', () => {
    expect(a13.shape).toBe('rect');
    expect([a13.w, a13.h]).toEqual([a12.w, a12.h]);
    expect(a13.y).toBe(a12.y);
    expect(a13.x).toBeGreaterThan(a12.x);
  });
  it('uses the same gap as AR-11 -> AR-12 and does not overlap', () => {
    const gap = (l: TableRow, r: TableRow) => (r.x - r.w / 2 - (l.x + l.w / 2)) * 2016;
    expect(Math.abs(gap(a12, a13) - gap(a11, a12))).toBeLessThan(1);
    expect(gap(a12, a13)).toBeGreaterThan(0);
  });
  it('fits inside the Activity Room Fit view', () => {
    const [bx, by, bw, bh] = ROOM_VIEWS.AR.box;
    const l = (a13.x - a13.w / 2) * 2016, r = (a13.x + a13.w / 2) * 2016;
    const t = (a13.y - a13.h / 2) * 1512, b = (a13.y + a13.h / 2) * 1512;
    expect(l).toBeGreaterThanOrEqual(bx); expect(r).toBeLessThanOrEqual(bx + bw);
    expect(t).toBeGreaterThanOrEqual(by); expect(b).toBeLessThanOrEqual(by + bh);
  });
  it('existing AR tables keep their IDs (AR-01..AR-12 unchanged in order)', () => {
    const ids = tables.filter((t) => t.area_id === 'AR').map((t) => t.id);
    expect(ids).toEqual(Array.from({ length: 13 }, (_, i) => `AR-${String(i + 1).padStart(2, '0')}`));
  });
});

describe('AR-13 in the app', () => {
  it('Add Guest: AR-13 is selectable after choosing Activity Room, and validates', () => {
    render(<GuestForm data={mk([])} />);
    fireEvent.change(screen.getByLabelText('Dining area'), { target: { value: 'AR' } });
    const opts = [...(screen.getByLabelText('Table') as HTMLSelectElement).options].map((o) => o.value);
    expect(opts).toContain('AR-13');
    expect(opts.filter((o) => o.startsWith('AR-'))).toHaveLength(13);
    expect(validateGuest({ firstName: 'Ann', lastInitial: 'B', areaId: 'AR', tableId: 'AR-13' }, tables)).toEqual({});
  });

  it('Edit Guest: a guest on AR-13 shows it preselected and can be reassigned to/from it', () => {
    render(<GuestForm data={mk([g13])} existing={g13} />);
    expect((screen.getByLabelText('Dining area') as HTMLSelectElement).value).toBe('AR');
    expect((screen.getByLabelText('Table') as HTMLSelectElement).value).toBe('AR-13');
  });

  it('Guests list shows Table AR-13 and tapping the guest locates it; Check In stays independent', () => {
    const data = mk([g13]);
    const onLocate = vi.fn();
    render(<GuestsView data={data} onLocate={onLocate} />);
    expect(screen.getByText(/Activity Room · Table AR-13/)).toBeTruthy();
    fireEvent.click(screen.getByText('Thirteen T.'));
    expect(onLocate).toHaveBeenCalledWith('AR-13', 'g13');
    fireEvent.click(screen.getByRole('button', { name: 'Check In' }));
    expect(data.setCheckIn).toHaveBeenCalledWith(g13, true);
    expect(onLocate).toHaveBeenCalledTimes(1);
  });

  it('Maps: AR-13 is drawn, counts guests, outlines on navigation, opens its sheet, shows the full room', () => {
    const data = mk([g13]);
    const { container } = render(<MapsView data={data} focus={{ tableId: 'AR-13', guestId: 'g13', nonce: 1 }} />);
    expect(container.querySelectorAll('g.tbl')).toHaveLength(13);
    const g = container.querySelector('g[aria-label^="Table AR-13"]')!;
    expect(g.getAttribute('aria-label')).toBe('Table AR-13, 0 of 1 arrived, selected');
    expect(container.querySelectorAll('.hl-ring')).toHaveLength(1);
    expect((container.querySelector('svg')!.getAttribute('viewBox') as string).split(' ').map(Number)).toEqual(ROOM_VIEWS.AR.box);
    const sheet = screen.getByRole('dialog', { name: 'Table AR-13' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Check In' }));
    expect(data.setCheckIn).toHaveBeenCalledWith(g13, true);
  });

  it('Maps: tapping AR-13 normally opens its guest list', () => {
    const { container } = render(<MapsView data={mk([g13])} focus={{ tableId: 'AR-01', nonce: 1 }} />);
    fireEvent.click(container.querySelector('g[aria-label^="Table AR-13"]')!);
    const sheet = screen.getByRole('dialog', { name: 'Table AR-13' });
    expect(within(sheet).getByText('Thirteen T.')).toBeTruthy();
  });
});
