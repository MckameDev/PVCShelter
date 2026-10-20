import { buildOccupancy, findRoomAt, roomNeighborIds, roomWidth } from './GridManager';
import type { GridState, Room } from './types';

// Rutas de los habitantes por el búnker. Grafo = salas conectadas. El costo es
// la distancia real caminada: desde el punto donde el habitante entra a una
// sala hasta el borde compartido con la siguiente (o hasta el hueco del
// ascensor), más FLOOR_COST por piso recorrido. Así Dijkstra elige el ascensor
// más cercano a donde está el habitante, no al centro de la sala.

/** Punto de paso: piso entero y posición horizontal continua en celdas. */
export interface Waypoint {
  floor: number;
  x: number;
}

/** Costo de subir/bajar un piso, en celdas equivalentes de caminata. */
export const FLOOR_COST = 2;

const center = (r: Room) => r.col + roomWidth(r) / 2;

/** Punto donde se pasa de la sala `a` a la vecina `b`. */
function crossingX(a: Room, b: Room): number {
  if (a.floor !== b.floor) return a.col + 0.5; // hueco del ascensor
  return b.col > a.col ? b.col : a.col; // borde compartido
}

/**
 * Secuencia de salas de menor costo entre dos salas, o null si no hay conexión.
 * `fromX`/`toX` son las posiciones reales de salida y llegada (por defecto, los centros).
 */
export function findRoomPath(grid: GridState, fromId: string, toId: string, fromX?: number, toX?: number): Room[] | null {
  const from = grid.rooms[fromId];
  const to = grid.rooms[toId];
  if (!from || !to) return null;
  if (fromId === toId) return [from];
  const goalX = toX ?? center(to);

  const occ = buildOccupancy(grid);
  const dist = new Map<string, number>([[fromId, 0]]);
  /** Punto por el que se entró a cada sala en la mejor ruta encontrada. */
  const entryX = new Map<string, number>([[fromId, fromX ?? center(from)]]);
  const prev = new Map<string, string>();
  const open = new Set<string>([fromId]);
  const done = new Set<string>();

  // Dijkstra con búsqueda lineal: el grafo tiene como mucho unas centenas de salas.
  while (open.size > 0) {
    let current = '';
    let best = Infinity;
    for (const id of open) {
      const d = dist.get(id)!;
      if (d < best) {
        best = d;
        current = id;
      }
    }
    open.delete(current);
    done.add(current);
    if (current === toId) break;

    const room = grid.rooms[current];
    const x = entryX.get(current)!;
    for (const nid of roomNeighborIds(grid, occ, room)) {
      if (done.has(nid)) continue;
      const next = grid.rooms[nid];
      const cross = crossingX(room, next);
      let nd = best + Math.abs(x - cross) + FLOOR_COST * Math.abs(room.floor - next.floor);
      if (nid === toId) nd += Math.abs(cross - goalX);
      if (nd < (dist.get(nid) ?? Infinity)) {
        dist.set(nid, nd);
        entryX.set(nid, cross);
        prev.set(nid, current);
        open.add(nid);
      }
    }
  }
  if (!prev.has(toId)) return null;

  const path: Room[] = [];
  for (let id: string | undefined = toId; id; id = prev.get(id)) path.unshift(grid.rooms[id]);
  return path;
}

/**
 * Waypoints para ir de `from` a `to`. Los tramos horizontales entre salas
 * contiguas no necesitan puntos intermedios; en cada ascensor se añade la
 * entrada (centro del hueco en el piso de origen) y la salida (piso destino).
 * Devuelve null si alguno de los extremos no está en una sala o no hay ruta.
 */
export function findPath(grid: GridState, from: Waypoint, to: Waypoint): Waypoint[] | null {
  const start = findRoomAt(grid, from.floor, Math.floor(from.x));
  const goal = findRoomAt(grid, to.floor, Math.floor(to.x));
  if (!start || !goal) return null;
  const rooms = findRoomPath(grid, start.id, goal.id, from.x, to.x);
  if (!rooms) return null;

  const waypoints: Waypoint[] = [];
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1];
    const b = rooms[i];
    if (a.floor === b.floor) continue;
    const shaftX = a.col + 0.5;
    const last = waypoints[waypoints.length - 1];
    if (!last || last.floor !== a.floor || last.x !== shaftX) waypoints.push({ floor: a.floor, x: shaftX });
    waypoints.push({ floor: b.floor, x: shaftX });
  }
  waypoints.push(to);
  // Los tramos verticales consecutivos (varios pisos por el mismo hueco) se funden.
  return waypoints.filter((w, i) => {
    const prev = waypoints[i - 1];
    const next = waypoints[i + 1];
    return !(prev && next && prev.x === w.x && next.x === w.x && prev.floor !== w.floor && next.floor !== w.floor);
  });
}
