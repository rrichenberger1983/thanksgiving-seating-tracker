import { useEffect, useMemo, useState } from 'react';
import type { DataApi } from '../useData';
import { countsByTable, searchGuests } from '../logic';
import type { Guest } from '../types';
import { MapSvg } from './MapSvg';
import { GuestRow } from './GuestRow';
import { GuestForm } from './GuestForm';
import { Modal } from './Modal';

export interface MapFocus {
  tableId: string;
  guestId?: string;
  nonce: number;
}

export function MapsView({ data, focus = null }: { data: DataApi; focus?: MapFocus | null }) {
  const focusTable = focus ? data.tableById.get(focus.tableId) : undefined;
  const [areaId, setAreaId] = useState<string>(focusTable?.area_id ?? '');
  const [mode, setMode] = useState<'map' | 'list'>('map');
  const [openTable, setOpenTable] = useState<string | null>(focusTable ? focusTable.id : null);
  const [highlight, setHighlight] = useState<string | null>(focusTable ? focusTable.id : null);
  const [focusGuest, setFocusGuest] = useState<string | null>(focusTable ? (focus?.guestId ?? null) : null);

  // A new request from the Guests list: show that room/table. A missing table is ignored (stays put).
  useEffect(() => {
    if (!focus) return;
    const t = data.tableById.get(focus.tableId);
    if (!t) return;
    setAreaId(t.area_id);
    setMode('map');
    setHighlight(t.id);
    setFocusGuest(focus.guestId ?? null);
    setOpenTable(t.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce]);

  // Normal table tap. Selecting a different table clears the located-table outline.
  const selectTable = (id: string) => {
    setHighlight((h) => (h === id ? h : null));
    setFocusGuest(null);
    setOpenTable(id);
  };

  const counts = useMemo(() => countsByTable(data.guests), [data.guests]);
  const area = data.areas.find((a) => a.id === areaId) ?? data.areas[0];
  const tables = useMemo(() => data.tables.filter((t) => t.area_id === area?.id), [data.tables, area]);

  if (!data.loaded || !area) return <p className="empty">Loading maps…</p>;

  const roomCounts = (id: string) => {
    let assigned = 0, arrived = 0;
    for (const t of data.tables) if (t.area_id === id) {
      const c = counts[t.id];
      if (c) { assigned += c.assigned; arrived += c.arrived; }
    }
    return { assigned, arrived };
  };

  return (
    <section>
      <div className="room-tabs" role="tablist" aria-label="Dining area">
        {data.areas.map((a) => {
          const c = roomCounts(a.id);
          return (
            <button key={a.id} role="tab" aria-selected={a.id === area.id} className={a.id === area.id ? 'on' : ''} onClick={() => setAreaId(a.id)}>
              <span>{a.name}</span>
              <small>{c.arrived}/{c.assigned} arrived</small>
            </button>
          );
        })}
      </div>

      <div className="seg" role="group" aria-label="View">
        <button className={mode === 'map' ? 'on' : ''} onClick={() => setMode('map')} aria-pressed={mode === 'map'}>Map</button>
        <button className={mode === 'list' ? 'on' : ''} onClick={() => setMode('list')} aria-pressed={mode === 'list'}>Table list</button>
      </div>

      <div className="legend" aria-hidden="true">
        <span><i className="sw empty" /> No guests</span>
        <span><i className="sw open" /> Waiting</span>
        <span><i className="sw done" /> All arrived</span>
      </div>

      {mode === 'map' ? (
        <MapSvg
          area={area}
          tables={tables}
          counts={counts}
          onSelect={selectTable}
          highlightId={highlight}
          panTo={focus && focusTable?.area_id === area.id ? { tableId: focus.tableId, nonce: focus.nonce } : null}
        />
      ) : (
        <div className="table-grid">
          {tables.map((t) => {
            const c = counts[t.id] ?? { assigned: 0, arrived: 0 };
            const state = c.assigned === 0 ? 'empty' : c.arrived === c.assigned ? 'done' : 'open';
            return (
              <button key={t.id} className={`table-chip ${state}${t.id === highlight ? ' located' : ''}`} onClick={() => selectTable(t.id)}>
                <b>{t.id}</b>
                <span>{c.arrived}/{c.assigned}</span>
              </button>
            );
          })}
        </div>
      )}

      {openTable && (
        <TableSheet
          tableId={openTable}
          data={data}
          focusGuestId={focusGuest}
          onClose={() => {
            setOpenTable(null);
            setFocusGuest(null); // the table outline stays until another table is selected
          }}
        />
      )}
    </section>
  );
}

function TableSheet({ tableId, data, onClose, focusGuestId = null }: { tableId: string; data: DataApi; onClose: () => void; focusGuestId?: string | null }) {
  const [mode, setMode] = useState<'list' | 'add' | { edit: Guest }>('list');
  const table = data.tableById.get(tableId);
  const roomName = table ? data.areaById.get(table.area_id)?.name : '';
  const here = searchGuests(data.guests.filter((g) => g.table_id === tableId), '');
  const arrived = here.filter((g) => g.checked_in).length;

  return (
    <Modal title={`Table ${tableId}`} onClose={onClose}>
      <p className="sheet-sub">{roomName} · {arrived} of {here.length} arrived</p>
      {mode === 'list' && (
        <>
          {here.length === 0 ? (
            <p className="empty">No guests assigned to this table.</p>
          ) : (
            <ul className="guest-list">
              {here.map((g) => (
                <GuestRow key={g.id} g={g} data={data} showTable={false} highlight={g.id === focusGuestId} onEdit={(x) => setMode({ edit: x })} />
              ))}
            </ul>
          )}
          <button className="btn btn-primary wide" onClick={() => setMode('add')}>＋ Add guest to this table</button>
        </>
      )}
      {mode === 'add' && (
        <GuestForm data={data} defaultTableId={tableId} onSaved={() => setMode('list')} onCancel={() => setMode('list')} />
      )}
      {typeof mode === 'object' && (
        <GuestForm
          key={mode.edit.id}
          data={data}
          existing={data.guestMap[mode.edit.id] ?? mode.edit}
          onSaved={() => setMode('list')}
          onCancel={() => setMode('list')}
        />
      )}
    </Modal>
  );
}
