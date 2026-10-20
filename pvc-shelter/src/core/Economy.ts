import {
  BASE_STORAGE,
  DWELLERS_PER_BLOCK,
  ITEM_BASE_CAPACITY,
  ITEM_CAPACITY_PER_STORAGE_BLOCK,
  LEVEL_EFFICIENCY,
  MED_BASE_STORAGE,
  MED_STORAGE_PER_BLOCK,
  MERGE_EFFICIENCY,
  ROOM_DEFS,
  STORAGE_PER_BLOCK,
} from './config';
import type { GridState, ProducedResource, Rock, Room, RoomType } from './types';

// Fórmulas de costos y rendimiento. Separadas de GridManager para que el
// Sprint 2 (economía) pueda crecer aquí sin tocar las reglas espaciales.

export function countBlocksOfType(grid: GridState, type: RoomType): number {
  let total = 0;
  for (const room of Object.values(grid.rooms)) {
    if (room.type === type) total += room.blocks;
  }
  return total;
}

/** Cada bloque existente del mismo tipo encarece el siguiente. */
export function buildCost(grid: GridState, type: RoomType): number {
  const def = ROOM_DEFS[type];
  return def.baseCost + def.costIncrement * countBlocksOfType(grid, type);
}

/** Costo de subir al siguiente nivel, o null si ya está al máximo. */
export function upgradeCost(room: Room): number | null {
  const def = ROOM_DEFS[room.type];
  if (room.level >= def.maxLevel) return null;
  const next = (room.level + 1) as 2 | 3;
  return def.upgradeCosts[next] * room.blocks;
}

/** Las rocas profundas cuestan más de romper. */
export function rockClearCost(rock: Rock): number {
  return (50 + rock.floor * 15) * rock.width;
}

/** Se devuelve la mitad del costo base por bloque (las mejoras no se reembolsan). */
export function demolishRefund(room: Room): number {
  return Math.floor(ROOM_DEFS[room.type].baseCost * 0.5) * room.blocks;
}

/** Salas sin puestos de trabajo (pasivas o de paso). */
const NO_WORKERS: RoomType[] = ['elevator', 'entrance', 'storage', 'barracks'];

export function roomCapacity(room: Room): number {
  return NO_WORKERS.includes(room.type) ? 0 : DWELLERS_PER_BLOCK * room.blocks;
}

export function roomEfficiency(room: Room): number {
  return MERGE_EFFICIENCY[room.blocks] * LEVEL_EFFICIENCY[room.level];
}

/** Suma de bloques × eficiencia de nivel de las salas que cumplen la condición. */
function weightedBlocks(grid: GridState, match: (room: Room) => boolean): number {
  let total = 0;
  for (const room of Object.values(grid.rooms)) {
    if (match(room)) total += room.blocks * LEVEL_EFFICIENCY[room.level];
  }
  return total;
}

/** Tope de almacenamiento: base + cada bloque que produce ese recurso (más si está mejorado). */
export function storageCap(grid: GridState, resource: ProducedResource): number {
  const producing = weightedBlocks(grid, (r) => ROOM_DEFS[r.type].produces === resource);
  if (resource === 'stimpaks' || resource === 'radaways') {
    return Math.floor(MED_BASE_STORAGE + MED_STORAGE_PER_BLOCK * producing);
  }
  return BASE_STORAGE + STORAGE_PER_BLOCK * producing;
}

/** Plazas del inventario de objetos (Sprint 5); los Almacenes la amplían. */
export function itemCapacity(grid: GridState): number {
  return Math.floor(ITEM_BASE_CAPACITY + ITEM_CAPACITY_PER_STORAGE_BLOCK * weightedBlocks(grid, (r) => r.type === 'storage'));
}

