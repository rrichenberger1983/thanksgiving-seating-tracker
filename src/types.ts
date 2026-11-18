export interface Area {
  id: string;
  name: string;
  sort_order: number;
  map_w: number;
  map_h: number;
}

export interface TableRow {
  id: string;
  area_id: string;
  label: string;
  shape: 'rect' | 'round';
  x: number; // normalized center
  y: number;
  w: number;
  h: number;
  capacity: number | null;
}

export interface Guest {
  id: string;
  first_name: string;
  last_initial: string;
  table_id: string;
  checked_in: boolean;
  checked_in_at: string | null;
  version: number;
  updated_at: string;
}

export type ConnStatus = 'connecting' | 'live' | 'offline';
