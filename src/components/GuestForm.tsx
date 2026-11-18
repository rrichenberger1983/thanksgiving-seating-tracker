import { useRef, useState } from 'react';
import type { DataApi } from '../useData';
import { guestLabel, validateGuest, type FieldErrors } from '../logic';
import type { Guest } from '../types';

interface Props {
  data: DataApi;
  existing?: Guest;
  defaultTableId?: string;
  onSaved?: (g: Guest) => void;
  onCancel?: () => void;
}

export function GuestForm({ data, existing, defaultTableId, onSaved, onCancel }: Props) {
  const startTable = existing?.table_id ?? defaultTableId ?? '';
  const [first, setFirst] = useState(existing?.first_name ?? '');
  const [initial, setInitial] = useState(existing?.last_initial ?? '');
  const [areaId, setAreaId] = useState(data.tableById.get(startTable)?.area_id ?? '');
  const [tableId, setTableId] = useState(startTable);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  const base = useRef<Guest | undefined>(existing);

  const tablesInArea = data.tables.filter((t) => t.area_id === areaId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const input = { firstName: first, lastInitial: initial, areaId, tableId };
    const errs = validateGuest(input, data.tables);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setBanner(null);
    const res = await data.saveGuest(input, base.current);
    setBusy(false);
    if (res.ok) {
      if (!existing) {
        setBanner({ kind: 'ok', text: `Saved: ${guestLabel(res.guest)} → Table ${res.guest.table_id}` });
        setFirst('');
        setInitial('');
      }
      onSaved?.(res.guest);
    } else if (res.kind === 'conflict') {
      if (res.latest) {
        base.current = res.latest;
        setFirst(res.latest.first_name);
        setInitial(res.latest.last_initial);
        setTableId(res.latest.table_id);
        setAreaId(data.tableById.get(res.latest.table_id)?.area_id ?? '');
      }
      setBanner({ kind: 'warn', text: res.message });
    } else {
      setBanner({ kind: 'err', text: res.message });
    }
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      {banner && (
        <div className={`banner banner-${banner.kind}`} role={banner.kind === 'ok' ? 'status' : 'alert'}>
          {banner.text}
        </div>
      )}
      <label>
        First name
        <input
          value={first}
          onChange={(e) => setFirst(e.target.value)}
          maxLength={40}
          autoComplete="off"
          autoCapitalize="words"
          aria-invalid={Boolean(errors.firstName)}
        />
        {errors.firstName && <span className="field-err">{errors.firstName}</span>}
      </label>
      <label>
        Last initial
        <input
          value={initial}
          onChange={(e) => setInitial(e.target.value.slice(0, 1))}
          maxLength={1}
          autoComplete="off"
          autoCapitalize="characters"
          className="initial"
          aria-invalid={Boolean(errors.lastInitial)}
        />
        {errors.lastInitial && <span className="field-err">{errors.lastInitial}</span>}
      </label>
      <label>
        Dining area
        <select
          value={areaId}
          onChange={(e) => {
            setAreaId(e.target.value);
            setTableId('');
          }}
        >
          <option value="">Choose area…</option>
          {data.areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        {errors.areaId && <span className="field-err">{errors.areaId}</span>}
      </label>
      <label>
        Table
        <select value={tableId} onChange={(e) => setTableId(e.target.value)} disabled={!areaId}>
          <option value="">{areaId ? 'Choose table…' : 'Choose an area first'}</option>
          {tablesInArea.map((t) => (
            <option key={t.id} value={t.id}>
              {t.id}
            </option>
          ))}
        </select>
        {errors.tableId && <span className="field-err">{errors.tableId}</span>}
      </label>
      <p className="hint">First name and last initial only. Do not enter room numbers or any health information.</p>
      <div className="form-actions">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : existing ? 'Save changes' : 'Save guest'}
        </button>
        {onCancel && (
          <button className="btn" type="button" onClick={onCancel} disabled={busy}>
            Close
          </button>
        )}
      </div>
    </form>
  );
}
