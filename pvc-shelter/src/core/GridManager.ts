import {
  BLOCK_CELLS,
  GRID_COLS,
  GRID_FLOORS,
  MAX_MERGE_BLOCKS,
  ROCK_FREE_FLOORS,
  ROOM_DEFS,
} from './config';
import { createRng, randomInt } from './random';
import { fail, ok } from './types';
import type { GridState, Result, Rock, Room, RoomBlocks, RoomType } from './types';

// Reglas espaciales del búnker. Funciones puras: reciben un GridState y
// devuelven uno nuevo (nunca mutan el de entrada), así Zustand detecta cambios
// por referencia y la lógica se puede testear sin React ni Pixi.

export interface Placement {
  floor: number;
  col: number;
  width: number;
}

/** Mapa celda -> id, para consultas de adyacencia en O(1). */
export interface Occupancy {
  rooms: (string | null)[][];
  rocks: (string | null)[][];
}

export function roomWidth(room: Pick<Room, 'type' | 'blocks'>): number {
  return ROOM_DEFS[room.type].cellsPerBlock * room.blocks;
}

function inBounds(grid: GridState, floor: number, col: number): boolean {
  return floor >= 0 && floor < grid.floors && col >= 0 && col < grid.cols;
}

export function buildOccupancy(grid: GridState, excludeRoomId?: string): Occupancy {
  const empty = () => Array.from({ length: grid.floors }, () => Array<string | null>(grid.cols).fill(null));
  const occ: Occupancy = { rooms: empty(), rocks: empty() };
  for (const room of Object.values(grid.rooms)) {
    if (room.id === excludeRoomId) continue;
    const w = roomWidth(room);
    for (let c = room.col; c < room.col + w; c++) occ.rooms[room.floor][c] = room.id;
  }
  for (const rock of Object.values(grid.rocks)) {
    for (let c = rock.col; c < rock.col + rock.width; c++) occ.rocks[rock.floor][c] = rock.id;
  }
  return occ;
}

function roomIdAt(grid: GridState, occ: Occupancy, floor: number, col: number): string | null {
  return inBounds(grid, floor, col) ? occ.rooms[floor][col] : null;
}

export function findRoomAt(grid: GridState, floor: number, col: number): Room | null {
  for (const room of Object.values(grid.rooms)) {
    if (room.floor === floor && col >= room.col && col < room.col + roomWidth(room)) return room;
  }
  return null;
}

export function findRockAt(grid: GridState, floor: number, col: number): Rock | null {
  for (const rock of Object.values(grid.rocks)) {
    if (rock.floor === floor && col >= rock.col && col < rock.col + rock.width) return rock;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Estado inicial
// ---------------------------------------------------------------------------

function generateRocks(floors: number, cols: number, seed: number, firstId: number) {
  const rng = createRng(seed);
  const rocks: Record<string, Rock> = {};
  let nextId = firstId;
  for (let floor = ROCK_FREE_FLOORS; floor < floors; floor++) {
    // Más profundo = más roca.
    const density = Math.min(0.05 + floor * 0.008, 0.22);
    let col = 0;
    while (col < cols) {
      if (rng() < density) {
        const width = Math.min(randomInt(rng, 1, 3), cols - col);
        const id = `rock-${nextId++}`;
        rocks[id] = { id, floor, col, width };
        col += width + 1; // hueco mínimo para que cada roca sea distinguible
      } else {
        col++;
      }
    }
  }
  return { rocks, nextId };
}

export function createInitialGrid(seed: number, floors = GRID_FLOORS, cols = GRID_COLS): GridState {
  const entrance: Room = { id: 'room-1', type: 'entrance', floor: 0, col: 0, blocks: 1, level: 1 };
  const elevator: Room = { id: 'room-2', type: 'elevator', floor: 0, col: BLOCK_CELLS, blocks: 1, level: 1 };
  const { rocks, nextId } = generateRocks(floors, cols, seed, 3);
  return {
    floors,
    cols,
    seed,
    nextId,
    rooms: { [entrance.id]: entrance, [elevator.id]: elevator },
    rocks,
  };
}

// ---------------------------------------------------------------------------
// Conectividad
// ---------------------------------------------------------------------------

function neighborIds(grid: GridState, occ: Occupancy, room: Room): string[] {
  const w = roomWidth(room);
  const ids = [roomIdAt(grid, occ, room.floor, room.col - 1), roomIdAt(grid, occ, room.floor, room.col + w)];
  if (room.type === 'elevator') {
    // Los ascensores solo conectan verticalmente con otro ascensor en la misma columna.
    for (const f of [room.floor - 1, room.floor + 1]) {
      const id = roomIdAt(grid, occ, f, room.col);
      if (id && grid.rooms[id].type === 'elevator') ids.push(id);
    }
  }
  return ids.filter((id): id is string => id !== null);
}

/** Ids de salas alcanzables desde la puerta (BFS), ignorando opcionalmente una sala. */
export function getConnectedRoomIds(grid: GridState, excludeRoomId?: string): Set<string> {
  const visited = new Set<string>();
  const entrance = Object.values(grid.rooms).find((r) => r.type === 'entrance');
  if (!entrance || entrance.id === excludeRoomId) return visited;

  const occ = buildOccupancy(grid, excludeRoomId);
  const queue = [entrance.id];
  visited.add(entrance.id);
  while (queue.length > 0) {
    const room = grid.rooms[queue.shift()!];
    for (const id of neighborIds(grid, occ, room)) {
      if (!visited.has(id)) {
        visited.add(id);
        queue.push(id);
      }
    }
  }
  return visited;
}

// ---------------------------------------------------------------------------
// Construcción
// ---------------------------------------------------------------------------

export function canPlaceRoom(
  grid: GridState,
  type: RoomType,
  floor: number,
  col: number,
  occ: Occupancy = buildOccupancy(grid),
): Result<Placement> {
  const def = ROOM_DEFS[type];
  if (!def.buildable) return fail(`${def.name} no se puede construir.`);

  const width = def.cellsPerBlock;
  if (floor < 0 || floor >= grid.floors || col < 0 || col + width > grid.cols) {
    return fail('Fuera de los límites del búnker.');
  }
  for (let c = col; c < col + width; c++) {
    if (occ.rocks[floor][c]) return fail('Hay rocas: destrúyelas antes de construir.');
    if (occ.rooms[floor][c]) return fail('El espacio ya está ocupado.');
  }

  const touchesRoom =
    roomIdAt(grid, occ, floor, col - 1) !== null || roomIdAt(grid, occ, floor, col + width) !== null;
  let touchesElevator = false;
  if (type === 'elevator') {
    for (const f of [floor - 1, floor + 1]) {
      const id = roomIdAt(grid, occ, f, col);
      if (id && grid.rooms[id].type === 'elevator') touchesElevator = true;
    }
  }
  if (!touchesRoom && !touchesElevator) {
    return fail('Debe conectarse a una sala existente o a un ascensor.');
  }
  return ok({ floor, col, width });
}

/** Todas las posiciones donde se puede construir el tipo dado (para el modo construcción). */
export function getValidPlacements(grid: GridState, type: RoomType): Placement[] {
  const occ = buildOccupancy(grid);
  const placements: Placement[] = [];
  for (let floor = 0; floor < grid.floors; floor++) {
    for (let col = 0; col < grid.cols; col++) {
      const res = canPlaceRoom(grid, type, floor, col, occ);
      if (res.ok) placements.push(res.value);
    }
  }
  return placements;
}

export interface RoomChange {
  grid: GridState;
  /** Id de la sala resultante (puede ser la sala fusionada). */
  roomId: string;
}

export function placeRoom(grid: GridState, type: RoomType, floor: number, col: number): Result<RoomChange> {
  const check = canPlaceRoom(grid, type, floor, col);
  if (!check.ok) return check;

  const id = `room-${grid.nextId}`;
  const room: Room = { id, type, floor, col, blocks: 1, level: 1 };
  const next: GridState = { ...grid, nextId: grid.nextId + 1, rooms: { ...grid.rooms, [id]: room } };
  return ok(mergeRoom(next, id));
}

// ---------------------------------------------------------------------------
// Fusión
// ---------------------------------------------------------------------------

function canMergeWith(a: Room, b: Room | undefined): b is Room {
  return !!b && a.type === b.type && a.level === b.level && ROOM_DEFS[a.type].mergeable;
}

/**
 * Fusiona la sala con sus vecinas horizontales compatibles (mismo tipo, mismo
 * nivel) sin superar MAX_MERGE_BLOCKS. Prioriza la fusión triple; si no cabe,
 * la combinación más grande (izquierda en caso de empate). La sala resultante
 * conserva el id de `roomId` para que la selección en la UI no se pierda.
 */
export function mergeRoom(grid: GridState, roomId: string): RoomChange {
  const room = grid.rooms[roomId];
  if (!room || !ROOM_DEFS[room.type].mergeable) return { grid, roomId };

  const occ = buildOccupancy(grid);
  const leftId = roomIdAt(grid, occ, room.floor, room.col - 1);
  const rightId = roomIdAt(grid, occ, room.floor, room.col + roomWidth(room));
  const left = leftId ? grid.rooms[leftId] : undefined;
  const right = rightId ? grid.rooms[rightId] : undefined;

  const fits = (...rooms: Room[]) => rooms.reduce((s, r) => s + r.blocks, 0) <= MAX_MERGE_BLOCKS;
  let group: Room[] | null = null;
  if (canMergeWith(room, left) && canMergeWith(room, right) && fits(left, room, right)) {
    group = [left, room, right];
  } else {
    const withLeft = canMergeWith(room, left) && fits(left, room) ? [left, room] : null;
    const withRight = canMergeWith(room, right) && fits(room, right) ? [room, right] : null;
    if (withLeft && withRight) {
      group = withRight[1].blocks > withLeft[0].blocks ? withRight : withLeft;
    } else {
      group = withLeft ?? withRight;
    }
  }
  if (!group) return { grid, roomId };

  const merged: Room = {
    ...room,
    col: Math.min(...group.map((r) => r.col)),
    blocks: group.reduce<number>((s, r) => s + r.blocks, 0) as RoomBlocks,
  };
  const rooms = { ...grid.rooms };
  for (const r of group) delete rooms[r.id];
  rooms[roomId] = merged;
  return { grid: { ...grid, rooms }, roomId };
}

// ---------------------------------------------------------------------------
// Mejora y demolición
// ---------------------------------------------------------------------------

export function canUpgradeRoom(grid: GridState, roomId: string): Result<Room> {
  const room = grid.rooms[roomId];
  if (!room) return fail('La sala no existe.');
  const def = ROOM_DEFS[room.type];
  if (def.maxLevel <= 1) return fail(`${def.name} no se puede mejorar.`);
  if (room.level >= def.maxLevel) return fail('La sala ya está al nivel máximo.');
  return ok(room);
}

/** Sube un nivel y, si ahora coincide con una vecina del mismo tipo, se fusionan. */
export function upgradeRoom(grid: GridState, roomId: string): Result<RoomChange> {
  const check = canUpgradeRoom(grid, roomId);
  if (!check.ok) return check;
  const room = check.value;
  const upgraded: Room = { ...room, level: (room.level + 1) as Room['level'] };
  return ok(mergeRoom({ ...grid, rooms: { ...grid.rooms, [roomId]: upgraded } }, roomId));
}

export function canDemolishRoom(grid: GridState, roomId: string): Result<Room> {
  const room = grid.rooms[roomId];
  if (!room) return fail('La sala no existe.');
  if (!ROOM_DEFS[room.type].demolishable) return fail(`${ROOM_DEFS[room.type].name} no se puede demoler.`);

  const reachable = getConnectedRoomIds(grid, roomId);
  const total = Object.keys(grid.rooms).length - 1;
  if (reachable.size < total) {
    return fail('No se puede demoler: dejaría salas desconectadas de la entrada.');
  }
  return ok(room);
}

export function demolishRoom(grid: GridState, roomId: string): Result<GridState> {
  const check = canDemolishRoom(grid, roomId);
  if (!check.ok) return check;
  const rooms = { ...grid.rooms };
  delete rooms[roomId];
  return ok({ ...grid, rooms });
}

// ---------------------------------------------------------------------------
// Rocas
// ---------------------------------------------------------------------------

export function clearRock(grid: GridState, rockId: string): Result<GridState> {
  if (!grid.rocks[rockId]) return fail('La roca no existe.');
  const rocks = { ...grid.rocks };
  delete rocks[rockId];
  return ok({ ...grid, rocks });
}
