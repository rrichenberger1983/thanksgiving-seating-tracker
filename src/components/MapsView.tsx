import { useMemo, useState } from 'react';
import type { DataApi } from '../useData';
import { countsByTable, searchGuests } from '../logic';
import type { Guest } from '../types';
import { MapSvg } from './MapSvg';
import { GuestRow } from './GuestRow';
import { GuestForm } from './GuestForm';
import { Modal } from './Modal';

export function MapsView({ data }: { data: DataApi }) {
  const [areaId, setAreaId] = useState<string>('');
  const [mode, setMode] = useState<'map' | 'list'>('map');
  const [openTable, setOpenTable] = useState<string | null>(null);

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
        <MapSvg area={area} tables={tables} counts={counts} onSelect={setOpenTable} />
      ) : (
        <div className="table-grid">
          {tables.map((t) => {
            const c = counts[t.id] ?? { assigned: 0, arrived: 0 };
            const state = c.assigned === 0 ? 'empty' : c.arrived === c.assigned ? 'done' : 'open';
            return (
              <button key={t.id} className={`table-chip ${state}`} onClick={() => setOpenTable(t.id)}>
                <b>{t.id}</b>
                <span>{c.arrived}/{c.assigned}</span>
              </button>
            );
          })}
        </div>
      )}

      {openTable && <TableSheet tableId={openTable} data={data} onClose={() => setOpenTable(null)} />}
    </section>
  );
}

function TableSheet({ tableId, data, onClose }: { tableId: string; data: DataApi; onClose: () => void }) {
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
                <GuestRow key={g.id} g={g} data={data} showTable={false} onEdit={(x) => setMode({ edit: x })} />
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
