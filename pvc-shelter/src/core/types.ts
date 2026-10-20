// Tipos compartidos del núcleo. Todo es serializable a JSON (necesario para el
// guardado en la nube del Sprint 8), por eso no hay clases ni Maps aquí.

export type RoomType = 'entrance' | 'elevator' | 'power' | 'food' | 'water' | 'living';

/** Letra del sistema P.A.T.R.O.N. que usa una sala para producir. */
export type PatronStat = 'P' | 'A' | 'T' | 'R' | 'O' | 'N';

export type RoomLevel = 1 | 2 | 3;
export type RoomBlocks = 1 | 2 | 3;

export interface Room {
  id: string;
  type: RoomType;
  /** Piso: 0 es la superficie (puerta del búnker), crece hacia abajo. */
  floor: number;
  /** Columna de la celda más a la izquierda que ocupa la sala. */
  col: number;
  /** Cantidad de bloques fusionados (1 = simple, 2 = doble, 3 = triple). */
  blocks: RoomBlocks;
  level: RoomLevel;
}

export interface Rock {
  id: string;
  floor: number;
  col: number;
  /** Ancho en celdas. */
  width: number;
}

export interface GridState {
  floors: number;
  cols: number;
  rooms: Record<string, Room>;
  rocks: Record<string, Rock>;
  /** Contador para ids deterministas (evita depender de crypto/Date en lógica pura). */
  nextId: number;
  /** Semilla con la que se generaron las rocas (reproducibilidad). */
  seed: number;
}

export type Result<T> = { ok: true; value: T } | { ok: false; reason: string };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = <T = never>(reason: string): Result<T> => ({ ok: false, reason });
