import { useCallback, useEffect, useRef, useState } from 'react';
import type { Area, TableRow } from '../types';
import type { Counts } from '../logic';
import { DEFAULT_VIEW, ROOM_VIEWS, type Feature } from '../features';

interface Props {
  area: Area;
  tables: TableRow[];
  counts: Record<string, Counts>;
  onSelect: (tableId: string) => void;
}

interface View { x: number; y: number; w: number }
const MAX_ZOOM = 6;

function FeatureShape({ f }: { f: Feature }) {
  switch (f.t) {
    case 'line':
      return <line x1={f.x1} y1={f.y1} x2={f.x2} y2={f.y2} className="feat" strokeWidth={f.sw ?? 5} />;
    case 'path':
      return <path d={f.d} className="feat" fill="none" strokeWidth={4} />;
    case 'rect':
      return <rect x={f.x} y={f.y} width={f.w} height={f.h} className="feat" fill="none" strokeWidth={4} />;
    case 'text':
      return <text x={f.x} y={f.y} className="feat-text" fontSize={f.size ?? 40} textAnchor="middle">{f.s}</text>;
  }
}

export function MapSvg({ area, tables, counts, onSelect }: Props) {
  const room = ROOM_VIEWS[area.id] ?? DEFAULT_VIEW;
  const [bx, by, bw, bh] = room.box;
  const aspect = bh / bw;
  const [view, setView] = useState<View>({ x: bx, y: by, w: bw });
  const viewRef = useRef(view);
  viewRef.current = view;
  const wrapRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const lastDist = useRef(0);
  const moved = useRef(false);
  const downAt = useRef({ x: 0, y: 0 });

  const clamp = useCallback(
    (v: View): View => {
      const w = Math.min(bw, Math.max(bw / MAX_ZOOM, v.w));
      const h = w * aspect;
      return {
        w,
        x: Math.min(bx + bw - w, Math.max(bx, v.x)),
        y: Math.min(by + bh - h, Math.max(by, v.y)),
      };
    },
    [bx, by, bw, bh, aspect],
  );

  // Reset when switching rooms.
  useEffect(() => {
    setView({ x: bx, y: by, w: bw });
  }, [area.id, bx, by, bw]);

  const zoomAt = useCallback(
    (factor: number, px: number, py: number) => {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const v = viewRef.current;
      const fx = (px - r.left) / r.width;
      const fy = (py - r.top) / r.height;
      const nw = Math.min(bw, Math.max(bw / MAX_ZOOM, v.w / factor));
      const ax = v.x + fx * v.w;
      const ay = v.y + fy * v.w * aspect;
      setView(clamp({ w: nw, x: ax - fx * nw, y: ay - fy * nw * aspect }));
    },
    [bw, aspect, clamp],
  );

  const zoomCenter = (factor: number) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (r) zoomAt(factor, r.left + r.width / 2, r.top + r.height / 2);
  };

  // Wheel zoom needs a non-passive listener so the page does not scroll.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX, e.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      moved.current = false;
      downAt.current = { x: e.clientX, y: e.clientY };
    }
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      lastDist.current = Math.hypot(a.x - b.x, a.y - b.y);
      moved.current = true;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const el = wrapRef.current;
    if (!el) return;
    const next = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, next);
    if (Math.hypot(next.x - downAt.current.x, next.y - downAt.current.y) > 8) moved.current = true;

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (lastDist.current > 0) zoomAt(dist / lastDist.current, (a.x + b.x) / 2, (a.y + b.y) / 2);
      lastDist.current = dist;
    } else if (pointers.current.size === 1 && moved.current) {
      const r = el.getBoundingClientRect();
      const v = viewRef.current;
      const k = v.w / r.width;
      setView(clamp({ w: v.w, x: v.x - (next.x - prev.x) * k, y: v.y - (next.y - prev.y) * k }));
    }
  };

  const onPointerEnd = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    lastDist.current = 0;
  };

  const zoomed = view.w < bw * 0.98;

  return (
    <div className="map-block">
      <div
        ref={wrapRef}
        className="map-wrap"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <svg
          viewBox={`${view.x} ${view.y} ${view.w} ${view.w * aspect}`}
          role="group"
          aria-label={`${area.name} floor plan`}
          preserveAspectRatio="xMidYMid meet"
        >
          {room.features.map((f, i) => (
            <FeatureShape key={i} f={f} />
          ))}
          {tables.map((t) => {
            const cx = t.x * area.map_w;
            const cy = t.y * area.map_h;
            const w = t.w * area.map_w;
            const h = t.h * area.map_h;
            const c = counts[t.id] ?? { assigned: 0, arrived: 0 };
            const state = c.assigned === 0 ? 'empty' : c.arrived === c.assigned ? 'done' : 'open';
            const small = h < 85;
            const fs = Math.max(22, Math.min(54, Math.min(w, h) * 0.36));
            const summary = `Table ${t.id}, ${c.arrived} of ${c.assigned} arrived`;
            return (
              <g
                key={t.id}
                className={`tbl ${state}`}
                role="button"
                tabIndex={0}
                aria-label={summary}
                onClick={() => {
                  if (!moved.current) onSelect(t.id);
                }}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(t.id)}
              >
                {t.shape === 'round' ? (
                  <circle cx={cx} cy={cy} r={w / 2} />
                ) : (
                  <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={8} />
                )}
                {small ? (
                  <text x={cx} y={cy + fs * 0.35} fontSize={Math.min(fs, h * 0.42)} textAnchor="middle" className="tbl-num">
                    {t.label} · {c.arrived}/{c.assigned}
                  </text>
                ) : (
                  <>
                    <text x={cx} y={cy - fs * 0.05} fontSize={fs} textAnchor="middle" className="tbl-num">{t.label}</text>
                    <text x={cx} y={cy + fs * 0.85} fontSize={fs * 0.78} textAnchor="middle" className="tbl-count">
                      {c.arrived}/{c.assigned}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="zoom-bar">
        <button className="btn btn-small" onClick={() => zoomCenter(1.6)} aria-label="Zoom in">＋ Zoom</button>
        <button className="btn btn-small" onClick={() => zoomCenter(1 / 1.6)} aria-label="Zoom out">－ Zoom</button>
        <button className="btn btn-small" onClick={() => setView({ x: bx, y: by, w: bw })} disabled={!zoomed}>Fit</button>
        <span className="hint">Pinch or use ＋ to zoom · drag to move</span>
      </div>
    </div>
  );
}
