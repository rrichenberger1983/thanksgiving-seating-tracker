import { useMemo, useState } from 'react';
import type { DataApi } from '../useData';
import { computeStats, searchGuests } from '../logic';
import type { Guest } from '../types';
import { GuestRow } from './GuestRow';
import { GuestForm } from './GuestForm';
import { Modal } from './Modal';

type Filter = 'all' | 'waiting' | 'arrived';

export function GuestsView({ data }: { data: DataApi }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<Guest | null>(null);

  const stats = useMemo(() => computeStats(data.guests, data.tables, data.areas), [data.guests, data.tables, data.areas]);
  const list = useMemo(() => {
    const found = searchGuests(data.guests, query);
    return found.filter((g) => (filter === 'all' ? true : filter === 'arrived' ? g.checked_in : !g.checked_in));
  }, [data.guests, query, filter]);

  // Keep the edit sheet pointed at the freshest copy of the guest.
  const editingLive = editing ? (data.guestMap[editing.id] ?? editing) : null;

  return (
    <section>
      <div className="dash" aria-label="Totals">
        <div className="stat"><b>{stats.total}</b><span>Total</span></div>
        <div className="stat stat-ok"><b>{stats.arrived}</b><span>Arrived</span></div>
        <div className="stat stat-wait"><b>{stats.remaining}</b><span>Remaining</span></div>
      </div>
      <div className="rooms">
        {stats.rooms.map((r) => (
          <span key={r.id} className="chip">
            {r.name}: <b>{r.arrived}</b>/{r.assigned}
          </span>
        ))}
      </div>

      <input
        className="search"
        type="search"
        inputMode="search"
        placeholder="Search first name or last initial"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        aria-label="Search guests"
      />
      <div className="seg" role="group" aria-label="Filter">
        {(['all', 'waiting', 'arrived'] as const).map((f) => (
          <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)} aria-pressed={filter === f}>
            {f === 'all' ? 'All' : f === 'waiting' ? 'Not arrived' : 'Arrived'}
          </button>
        ))}
      </div>

      {!data.loaded ? (
        <p className="empty">Loading guests…</p>
      ) : list.length === 0 ? (
        <p className="empty">{data.guests.length === 0 ? 'No guests yet. Use the Add Guest tab.' : 'No matching guests.'}</p>
      ) : (
        <ul className="guest-list">
          {list.map((g) => (
            <GuestRow key={g.id} g={g} data={data} onEdit={setEditing} />
          ))}
        </ul>
      )}

      {editingLive && (
        <Modal title="Edit guest" onClose={() => setEditing(null)}>
          <GuestForm
            key={`${editingLive.id}`}
            data={data}
            existing={editingLive}
            onSaved={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}
    </section>
  );
}
