// @vitest-environment jsdom
// Hook-level tests with a fake Supabase client: verifies UI-state rules (no optimistic success,
// retry on failure, stale-write handling, refresh on reconnect/resume). The real client/Realtime
// service is NOT exercised here — see docs/TESTING.md for the live-device checks.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import layout from '../src/data/layout.json';

type Row = Record<string, any>;
const S = vi.hoisted(() => ({
  guests: [] as Row[],
  fail: false,
  hold: null as null | Promise<void>,
  selectCalls: 0,
  channels: [] as { cb?: (s: string) => void; change?: (p: any) => void; removed: boolean }[],
}));

vi.mock('../src/supabase', () => {
  const builder = (table: string) => {
    const q: Row = { table, op: 'select', eq: {}, single: false, payload: null };
    const api: any = {
      select: () => api,
      order: () => api,
      abortSignal: () => api,
      update: (p: Row) => ((q.op = 'update'), (q.payload = p), api),
      insert: (p: Row) => ((q.op = 'insert'), (q.payload = p), api),
      eq: (k: string, v: unknown) => ((q.eq[k] = v), api),
      maybeSingle: () => ((q.single = true), api),
      single: () => ((q.single = true), api),
      then: (res: any, rej: any) => exec().then(res, rej),
    };
    const exec = async () => {
      if (S.hold) await S.hold;
      if (S.fail) return { data: null, error: { message: 'network' } };
      if (table === 'dining_areas') return { data: layout.areas, error: null };
      if (table === 'dining_tables') return { data: layout.tables, error: null };
      if (q.op === 'select') {
        S.selectCalls++;
        const rows = S.guests.filter((g) => Object.entries(q.eq).every(([k, v]) => g[k] === v));
        return { data: q.single ? (rows[0] ?? null) : rows, error: null };
      }
      if (q.op === 'update') {
        const rows = S.guests.filter((g) => Object.entries(q.eq).every(([k, v]) => g[k] === v));
        rows.forEach((g) => Object.assign(g, q.payload, { version: g.version + 1 }));
        return { data: rows.map((g) => ({ ...g })), error: null };
      }
      return { data: null, error: null };
    };
    return api;
  };
  const supabase = {
    from: builder,
    channel: () => {
      const rec: any = { removed: false };
      S.channels.push(rec);
      const ch: any = {
        on: (_t: string, _f: unknown, cb: (p: any) => void) => ((rec.change = cb), ch),
        subscribe: (cb: (s: string) => void) => ((rec.cb = cb), ch),
      };
      return ch;
    },
    removeChannel: () => Promise.resolve('ok'),
  };
  return { supabase, configured: true };
});

import { useData } from '../src/useData';

const guest = (over: Row = {}): Row => ({
  id: 'g1', first_name: 'Mary', last_initial: 'S', table_id: 'MD-01', checked_in: false,
  checked_in_at: null, version: 1, updated_at: '2026-11-19T12:00:00Z', ...over,
});
const latestChannel = () => S.channels[S.channels.length - 1];

beforeEach(() => {
  S.guests = [guest()];
  S.fail = false;
  S.hold = null;
  S.selectCalls = 0;
  S.channels = [];
});
afterEach(() => vi.useRealTimers());

async function mount() {
  const hook = renderHook(() => useData(true));
  await waitFor(() => expect(hook.result.current.loaded).toBe(true));
  await act(async () => latestChannel().cb?.('SUBSCRIBED'));
  return hook;
}

describe('useData', () => {
  it('loads areas, 60 tables, guests and goes Live when subscribed', async () => {
    const { result } = await mount();
    expect(result.current.areas).toHaveLength(4);
    expect(result.current.tables).toHaveLength(60);
    expect(result.current.guests).toHaveLength(1);
    expect(result.current.conn).toBe('live');
  });

  it('does NOT show a check-in until the database confirms it', async () => {
    const { result } = await mount();
    let release!: () => void;
    S.hold = new Promise<void>((r) => (release = r));
    let p!: Promise<void>;
    act(() => { p = result.current.setCheckIn(result.current.guestMap.g1, true); });
    await waitFor(() => expect(result.current.saving.has('g1')).toBe(true));
    expect(result.current.guestMap.g1.checked_in).toBe(false); // still not shown
    S.hold = null; release();
    await act(async () => { await p; });
    expect(result.current.guestMap.g1.checked_in).toBe(true);
    expect(result.current.guestMap.g1.version).toBe(2);
    expect(result.current.saving.has('g1')).toBe(false);
  });

  it('on a failed save keeps the old state, shows an error, and Retry succeeds', async () => {
    const { result } = await mount();
    S.fail = true;
    await act(async () => { await result.current.setCheckIn(result.current.guestMap.g1, true); });
    expect(result.current.guestMap.g1.checked_in).toBe(false);
    expect(result.current.issues.g1.message).toMatch(/Not saved/);
    expect(result.current.issues.g1.retry).toBeTypeOf('function');
    S.fail = false;
    await act(async () => { result.current.issues.g1.retry!(); });
    await waitFor(() => expect(result.current.guestMap.g1.checked_in).toBe(true));
    expect(result.current.issues.g1).toBeUndefined();
  });

  it('a stale check-in (someone else already did it) is rejected and the latest is shown', async () => {
    const { result } = await mount();
    const stale = { ...result.current.guestMap.g1 }; // device still holds version 1
    S.guests[0] = guest({ checked_in: true, version: 2, checked_in_at: '2026-11-19T12:01:00Z' }); // other staff
    await act(async () => { await result.current.setCheckIn(stale, true); });
    expect(S.guests[0].version).toBe(2); // our write did not overwrite
    expect(result.current.guestMap.g1.checked_in).toBe(true); // latest pulled in
    expect(result.current.issues.g1.message).toMatch(/Already checked in/);
  });

  it('applies realtime changes from other devices and ignores older versions', async () => {
    const { result } = await mount();
    await act(async () => latestChannel().change!({ eventType: 'UPDATE', new: guest({ checked_in: true, version: 3 }) }));
    expect(result.current.guestMap.g1.checked_in).toBe(true);
    await act(async () => latestChannel().change!({ eventType: 'UPDATE', new: guest({ checked_in: false, version: 2 }) }));
    expect(result.current.guestMap.g1.version).toBe(3);
    await act(async () => latestChannel().change!({ eventType: 'INSERT', new: guest({ id: 'g2', first_name: 'Sam', version: 1 }) }));
    expect(result.current.guests).toHaveLength(2);
  });

  it('after a dropped connection, app resume re-reads the server and re-subscribes', async () => {
    const { result } = await mount();
    await act(async () => latestChannel().cb?.('CLOSED'));
    expect(result.current.conn).toBe('offline');
    // Missed change while offline:
    S.guests[0] = guest({ checked_in: true, version: 2 });
    const channelsBefore = S.channels.length;
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await waitFor(() => expect(result.current.guestMap.g1.checked_in).toBe(true)); // authoritative refresh
    expect(S.channels.length).toBe(channelsBefore + 1); // fresh realtime channel
    await act(async () => latestChannel().cb?.('SUBSCRIBED'));
    expect(result.current.conn).toBe('live');
  });

  it('browser going offline/online flips status and refreshes', async () => {
    const { result } = await mount();
    await act(async () => { window.dispatchEvent(new Event('offline')); });
    expect(result.current.conn).toBe('offline');
    const before = S.selectCalls;
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(S.selectCalls).toBeGreaterThan(before));
    expect(result.current.conn).toBe('connecting');
  });

  it('edit with a stale version is a conflict, not an overwrite', async () => {
    const { result } = await mount();
    const stale = { ...result.current.guestMap.g1 };
    S.guests[0] = guest({ first_name: 'Maria', version: 2 });
    let res: any;
    await act(async () => {
      res = await result.current.saveGuest({ firstName: 'Mary', lastInitial: 'S', areaId: 'MD', tableId: 'MD-02' }, stale);
    });
    expect(res).toMatchObject({ ok: false, kind: 'conflict' });
    expect(S.guests[0]).toMatchObject({ first_name: 'Maria', table_id: 'MD-01' }); // untouched
  });
});
