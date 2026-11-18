import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import layout from '../src/data/layout.json';

const byArea = (id: string) => layout.tables.filter((t) => t.area_id === id);

describe('floor-plan layout (from the four photos)', () => {
  it('has the verified table count per room', () => {
    expect(byArea('MD')).toHaveLength(31); // 27 printed + 4 hand-drawn (reconciled from photo 1)
    expect(byArea('AR')).toHaveLength(12);
    expect(byArea('200')).toHaveLength(10);
    expect(byArea('ES')).toHaveLength(6);
    expect(layout.tables).toHaveLength(59);
  });

  it('numbers tables with stable, unique, zero-padded IDs', () => {
    const ids = layout.tables.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    const expectIds = (prefix: string, n: number) =>
      Array.from({ length: n }, (_, i) => `${prefix}-${String(i + 1).padStart(2, '0')}`);
    expect(byArea('MD').map((t) => t.id)).toEqual(expectIds('MD', 31));
    expect(byArea('AR').map((t) => t.id)).toEqual(expectIds('AR', 12));
    expect(byArea('200').map((t) => t.id)).toEqual(expectIds('200', 10));
    expect(byArea('ES').map((t) => t.id)).toEqual(expectIds('ES', 6));
  });

  it('numbers top-to-bottom, left-to-right within a 200px row band', () => {
    const W = 2016, H = 1512;
    for (const a of ['MD', 'AR', '200', 'ES']) {
      const ts = byArea(a);
      for (let i = 1; i < ts.length; i++) {
        const p = ts[i - 1], c = ts[i];
        const pb = Math.floor((p.y * H) / 200), cb = Math.floor((c.y * H) / 200);
        expect(cb > pb || (cb === pb && c.x * W >= p.x * W)).toBe(true);
      }
    }
  });

  it('keeps every table inside the map and never overlapping another', () => {
    for (const a of ['MD', 'AR', '200', 'ES']) {
      const ts = byArea(a);
      for (const t of ts) {
        expect(t.x - t.w / 2).toBeGreaterThanOrEqual(0);
        expect(t.x + t.w / 2).toBeLessThanOrEqual(1);
        expect(t.y - t.h / 2).toBeGreaterThanOrEqual(0);
        expect(t.y + t.h / 2).toBeLessThanOrEqual(1);
      }
      for (let i = 0; i < ts.length; i++)
        for (let j = i + 1; j < ts.length; j++) {
          const a1 = ts[i], b = ts[j];
          const overlap =
            Math.abs(a1.x - b.x) < (a1.w + b.w) / 2 && Math.abs(a1.y - b.y) < (a1.h + b.h) / 2;
          expect(overlap, `${a1.id} overlaps ${b.id}`).toBe(false);
        }
    }
  });

  it('has exactly one round table (Activity Room)', () => {
    const round = layout.tables.filter((t) => t.shape === 'round');
    expect(round.map((t) => t.area_id)).toEqual(['AR']);
  });

  it('seed SQL contains every table and never invents capacities', () => {
    const sql = fs.readFileSync('supabase/migrations/0002_seed_tables.sql', 'utf8');
    for (const t of layout.tables) expect(sql).toContain(`'${t.id}'`);
    expect(sql).not.toMatch(/capacity/);
  });
});
