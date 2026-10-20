import { DWELLERS_PER_BLOCK, LEVEL_EFFICIENCY, MERGE_EFFICIENCY, ROOM_DEFS } from './config';
import type { GridState, Rock, Room, RoomType } from './types';

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

export function roomCapacity(room: Room): number {
  return room.type === 'elevator' || room.type === 'entrance' ? 0 : DWELLERS_PER_BLOCK * room.blocks;
}

export function roomEfficiency(room: Room): number {
  return MERGE_EFFICIENCY[room.blocks] * LEVEL_EFFICIENCY[room.level];
}
