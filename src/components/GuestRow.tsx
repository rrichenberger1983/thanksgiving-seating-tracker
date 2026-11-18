import type { DataApi } from '../useData';
import { guestLabel } from '../logic';
import type { Guest } from '../types';

interface Props {
  g: Guest;
  data: DataApi;
  onEdit: (g: Guest) => void;
  showTable?: boolean;
}

const timeOf = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';

export function GuestRow({ g, data, onEdit, showTable = true }: Props) {
  const saving = data.saving.has(g.id);
  const issue = data.issues[g.id];
  const table = data.tableById.get(g.table_id);
  const room = table ? data.areaById.get(table.area_id)?.name : '';
  return (
    <li className={`guest ${g.checked_in ? 'arrived' : 'waiting'}`}>
      <div className="guest-main">
        <div className="guest-name">{guestLabel(g)}</div>
        {showTable && (
          <div className="guest-meta">
            {room} · Table {g.table_id}
          </div>
        )}
        <div className={`badge ${g.checked_in ? 'badge-ok' : 'badge-wait'}`}>
          {saving ? 'Saving…' : g.checked_in ? `✔ ARRIVED ${timeOf(g.checked_in_at)}` : 'NOT ARRIVED'}
        </div>
      </div>
      <div className="guest-actions">
        {g.checked_in ? (
          <button className="btn btn-undo" disabled={saving} onClick={() => void data.setCheckIn(g, false)}>
            Undo
          </button>
        ) : (
          <button className="btn btn-checkin" disabled={saving} onClick={() => void data.setCheckIn(g, true)}>
            Check In
          </button>
        )}
        <button className="btn-link" disabled={saving} onClick={() => onEdit(g)}>
          Edit
        </button>
      </div>
      {issue && (
        <div className="issue" role="alert">
          <span>{issue.message}</span>
          {issue.retry && (
            <button className="btn btn-small" onClick={issue.retry}>
              Retry
            </button>
          )}
        </div>
      )}
    </li>
  );
}
