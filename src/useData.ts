import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { indexGuests, mergeGuest, reconcileGuests, type GuestInput } from './logic';
import type { Area, ConnStatus, Guest, TableRow } from './types';

export interface Issue {
  message: string;
  retry?: () => void;
}

export type SaveResult =
  | { ok: true; guest: Guest }
  | { ok: false; kind: 'conflict'; message: string; latest?: Guest }
  | { ok: false; kind: 'error'; message: string };

const WRITE_TIMEOUT_MS = 10_000;
const POLL_MS = 45_000;

const NET_MSG = 'Not saved — could not confirm with the server. Check Wi-Fi and tap Retry.';

export function useData(enabled: boolean) {
  const [areas, setAreas] = useState<Area[]>([]);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [guestMap, setGuestMap] = useState<Record<string, Guest>>({});
  const [conn, setConn] = useState<ConnStatus>('connecting');
  const [loaded, setLoaded] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set());
  const [issues, setIssues] = useState<Record<string, Issue>>({});

  const chRef = useRef<RealtimeChannel | null>(null);
  const connRef = useRef<ConnStatus>('connecting');
  const guestsRef = useRef<Record<string, Guest>>({});
  guestsRef.current = guestMap;

  const updateConn = useCallback((c: ConnStatus) => {
    connRef.current = c;
    setConn(c);
  }, []);

  /** Authoritative full read. Safe to call any time. */
  const refresh = useCallback(async (): Promise<boolean> => {
    if (!supabase) return false;
    try {
      const [a, t, g] = await Promise.all([
        supabase.from('dining_areas').select('*').order('sort_order'),
        supabase.from('dining_tables').select('*').order('id'),
        supabase.from('guests').select('*'),
      ]);
      const err = a.error ?? t.error ?? g.error;
      if (err) {
        setLoadError('Could not load the latest data. Showing what was last loaded.');
        return false;
      }
      setAreas(a.data as Area[]);
      setTables(t.data as TableRow[]);
      setGuestMap((local) => reconcileGuests(local, g.data as Guest[]));
      setLastSync(new Date());
      setLoadError(null);
      setLoaded(true);
      return true;
    } catch {
      setLoadError('Could not reach the server. Showing what was last loaded.');
      return false;
    }
  }, []);

  const subscribe = useCallback(() => {
    if (!supabase) return;
    if (chRef.current) {
      void supabase.removeChannel(chRef.current);
      chRef.current = null;
    }
    updateConn('connecting');
    const ch = supabase
      .channel(`guests-live-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guests' }, (p) => {
        if (p.eventType === 'DELETE') {
          const id = (p.old as { id?: string }).id;
          if (id)
            setGuestMap((m) => {
              const next = { ...m };
              delete next[id];
              return next;
            });
          return;
        }
        setGuestMap((m) => mergeGuest(m, p.new as Guest));
        setLastSync(new Date());
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          updateConn('live');
          void refresh(); // always re-read after (re)subscribing so nothing is missed
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          updateConn('offline');
        }
      });
    chRef.current = ch;
  }, [refresh, updateConn]);

  // Initial load, realtime, resume/reconnect handling.
  useEffect(() => {
    if (!enabled || !supabase) return;
    void refresh();
    subscribe();

    const resume = () => {
      if (document.visibilityState === 'hidden') return;
      void refresh();
      if (connRef.current !== 'live') subscribe();
    };
    const goOffline = () => updateConn('offline');
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    window.addEventListener('offline', goOffline);
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refresh();
        if (connRef.current === 'offline') subscribe();
      }
    }, POLL_MS);

    return () => {
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', goOffline);
      window.clearInterval(poll);
      if (chRef.current && supabase) void supabase.removeChannel(chRef.current);
      chRef.current = null;
    };
  }, [enabled, refresh, subscribe, updateConn]);

  const markSaving = (id: string, on: boolean) =>
    setSaving((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  const setIssue = (id: string, issue: Issue | null) =>
    setIssues((m) => {
      const n = { ...m };
      if (issue) n[id] = issue;
      else delete n[id];
      return n;
    });

  const fetchOne = async (id: string): Promise<Guest | undefined> => {
    if (!supabase) return undefined;
    const { data } = await supabase.from('guests').select('*').eq('id', id).maybeSingle();
    if (data) setGuestMap((m) => mergeGuest(m, data as Guest));
    return (data as Guest | null) ?? undefined;
  };

  /** Check in / undo. UI only changes after the database confirms (version-checked update). */
  const setCheckIn = useCallback(async (g: Guest, value: boolean): Promise<void> => {
    if (!supabase) return;
    markSaving(g.id, true);
    setIssue(g.id, null);
    const retry = () => {
      const cur = guestsRef.current[g.id] ?? g;
      void setCheckIn(cur, value);
    };
    try {
      const { data, error } = await supabase
        .from('guests')
        .update({ checked_in: value })
        .eq('id', g.id)
        .eq('version', g.version)
        .select()
        .abortSignal(AbortSignal.timeout(WRITE_TIMEOUT_MS));
      if (error) {
        setIssue(g.id, { message: NET_MSG, retry });
      } else if (!data || data.length === 0) {
        const latest = await fetchOne(g.id);
        const same = latest && latest.checked_in === value;
        setIssue(g.id, {
          message: same
            ? `Already ${value ? 'checked in' : 'marked not arrived'} by another staff member.`
            : 'Another staff member just changed this guest. Latest shown — tap again if still needed.',
        });
      } else {
        setGuestMap((m) => mergeGuest(m, data[0] as Guest));
      }
    } catch {
      setIssue(g.id, { message: NET_MSG, retry });
    } finally {
      markSaving(g.id, false);
    }
  }, []);

  /** Create (existing undefined) or edit a guest. Edits are rejected if the row changed meanwhile. */
  const saveGuest = useCallback(async (input: GuestInput, existing?: Guest): Promise<SaveResult> => {
    if (!supabase) return { ok: false, kind: 'error', message: 'Not connected.' };
    const fields = {
      first_name: input.firstName.trim(),
      last_initial: input.lastInitial.trim(),
      table_id: input.tableId,
    };
    const timeout = AbortSignal.timeout(WRITE_TIMEOUT_MS);
    try {
      if (!existing) {
        const { data, error } = await supabase.from('guests').insert(fields).select().abortSignal(timeout).single();
        if (error || !data)
          return {
            ok: false,
            kind: 'error',
            message: 'Not saved. Check the Guests list for this name before trying again, then tap Save.',
          };
        setGuestMap((m) => mergeGuest(m, data as Guest));
        return { ok: true, guest: data as Guest };
      }
      const { data, error } = await supabase
        .from('guests')
        .update(fields)
        .eq('id', existing.id)
        .eq('version', existing.version)
        .select()
        .abortSignal(timeout);
      if (error) return { ok: false, kind: 'error', message: NET_MSG };
      if (!data || data.length === 0) {
        const latest = await fetchOne(existing.id);
        return {
          ok: false,
          kind: 'conflict',
          message: 'Another staff member changed this guest. The latest details are shown — review, then save again.',
          latest,
        };
      }
      setGuestMap((m) => mergeGuest(m, data[0] as Guest));
      return { ok: true, guest: data[0] as Guest };
    } catch {
      return { ok: false, kind: 'error', message: NET_MSG };
    }
  }, []);

  const guests = useMemo(() => Object.values(guestMap), [guestMap]);
  const tableById = useMemo(() => new Map(tables.map((t) => [t.id, t])), [tables]);
  const areaById = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas]);

  return {
    areas, tables, guests, guestMap, tableById, areaById,
    conn, loaded, lastSync, loadError, saving, issues,
    refresh, setCheckIn, saveGuest,
  };
}

export type DataApi = ReturnType<typeof useData>;
export { indexGuests };
