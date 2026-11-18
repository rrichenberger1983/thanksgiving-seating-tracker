// Decorative room features (walls, doors, labels) traced from the floor-plan photos.
// Coordinates share the 2016 x 1512 canvas used for tables. Purely visual — no data.

export type Feature =
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; sw?: number }
  | { t: 'path'; d: string }
  | { t: 'text'; x: number; y: number; s: string; size?: number }
  | { t: 'rect'; x: number; y: number; w: number; h: number };

export interface RoomView {
  /** Cropped viewBox [x, y, w, h] that frames the room at full size. */
  box: [number, number, number, number];
  features: Feature[];
}

export const ROOM_VIEWS: Record<string, RoomView> = {
  MD: {
    box: [90, 0, 1720, 1440],
    features: [
      { t: 'line', x1: 767, y1: 18, x2: 767, y2: 300, sw: 14 },
      { t: 'path', d: 'M800 72 Q800 20 868 18' },
      { t: 'path', d: 'M1445 28 Q1450 90 1530 97' },
      { t: 'line', x1: 968, y1: 35, x2: 1385, y2: 35, sw: 4 },
      { t: 'text', x: 1176, y: 90, s: 'Kitchen', size: 54 },
    ],
  },
  AR: {
    box: [90, 70, 1740, 1290],
    features: [
      { t: 'line', x1: 130, y1: 100, x2: 612, y2: 100, sw: 6 },
      { t: 'line', x1: 115, y1: 100, x2: 115, y2: 505, sw: 4 },
      { t: 'line', x1: 1152, y1: 88, x2: 1290, y2: 88, sw: 6 },
      { t: 'rect', x: 800, y: 88, w: 253, h: 122 },
      { t: 'path', d: 'M800 210 Q850 120 925 92 Q1000 120 1053 210' },
      { t: 'text', x: 926, y: 262, s: 'Entrance', size: 44 },
      { t: 'rect', x: 1295, y: 90, w: 120, h: 40 },
      { t: 'text', x: 1355, y: 175, s: 'Sink', size: 40 },
    ],
  },
  '200': { box: [480, 270, 880, 700], features: [] },
  ES: { box: [480, 270, 720, 540], features: [] },
};

export const DEFAULT_VIEW: RoomView = { box: [0, 0, 2016, 1512], features: [] };
