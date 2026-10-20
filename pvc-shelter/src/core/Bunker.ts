import { ROOM_DEFS, STARTING_DWELLERS, STARTING_RESOURCES } from './config';
import { dwellersInRoom, generateDwellers, livingCount } from './Dwellers';
import { createStartingInventory } from './Inventory';
import * as Grid from './GridManager';
import { emptyRuntime, getRuntime } from './Production';
import { createRng } from './random';
import { fail, ok } from './types';
import type { GameData, Result, Room, RoomRuntime, RoomType } from './types';

// Operaciones a nivel de partida: combinan las reglas espaciales del grid con
// el estado que vive fuera de él (habitantes y temporizadores por sala).

export function createNewGame(seed: number): GameData {
  const grid = Grid.createInitialGrid(seed);
  // Otra secuencia derivada de la semilla para no acoplar habitantes y rocas.
  const { dwellers, nextId } = generateDwellers(createRng(seed ^ 0x5bd1e995), STARTING_DWELLERS, 1);
  const runtime: Record<string, RoomRuntime> = {};
  for (const id of Object.keys(grid.rooms)) runtime[id] = emptyRuntime();
  return {
    grid,
    resources: { ...STARTING_RESOURCES },
    dwellers,
    runtime,
    inventory: createStartingInventory(),
    raid: null,
    nextDwellerId: nextId,
    time: 0,
  };
}

/**
 * Aplica el resultado de construir/mejorar: si hubo fusión, los habitantes y el
 * estado de producción de las salas absorbidas pasan a la sala resultante.
 */
export function applyRoomChange(data: GameData, change: Grid.RoomChange): GameData {
  const runtime = { ...data.runtime };
  const group = [change.roomId, ...change.absorbedIds].map((id) => getRuntime(data, id));
  runtime[change.roomId] = {
    progress: Math.max(...group.map((r) => r.progress)),
    ready: group.some((r) => r.ready),
    rushHeat: Math.max(...group.map((r) => r.rushHeat)),
    powered: group.every((r) => r.powered),
    incident: group.find((r) => r.incident)?.incident ?? null,
    craft: group.find((r) => r.craft)?.craft ?? null,
  };
  for (const id of change.absorbedIds) delete runtime[id];

  let dwellers = data.dwellers;
  if (change.absorbedIds.length > 0) {
    const absorbed = new Set(change.absorbedIds);
    dwellers = Object.fromEntries(
      Object.entries(data.dwellers).map(([id, d]) => [id, d.roomId && absorbed.has(d.roomId) ? { ...d, roomId: change.roomId } : d]),
    );
  }
  return { ...data, grid: change.grid, runtime, dwellers };
}

/** Desbloqueo por población: cada tipo de sala exige un mínimo de habitantes vivos. */
export function canBuildType(data: GameData, type: RoomType): Result<null> {
  const def = ROOM_DEFS[type];
  if (!def.buildable) return fail(`${def.name} no se puede construir.`);
  const population = livingCount(data);
  if (population < def.unlockPopulation) {
    return fail(`${def.name} se desbloquea con ${def.unlockPopulation} habitantes (tienes ${population}).`);
  }
  return ok(null);
}

export function canDemolish(data: GameData, roomId: string): Result<Room> {
  const check = Grid.canDemolishRoom(data.grid, roomId);
  if (!check.ok) return check;
  if (dwellersInRoom(data, roomId).length > 0) return fail('Saca primero a los habitantes de la sala.');
  if (getRuntime(data, roomId).incident) return fail('No se puede demoler durante un incidente.');
  if (getRuntime(data, roomId).craft) return fail('Recoge o termina la fabricación antes de demoler el taller.');
  if (data.raid) return fail('No se puede demoler durante un asalto.');
  return check;
}

export function demolish(data: GameData, roomId: string): Result<GameData> {
  const check = canDemolish(data, roomId);
  if (!check.ok) return check;
  const res = Grid.demolishRoom(data.grid, roomId);
  if (!res.ok) return res;
  const runtime = { ...data.runtime };
  delete runtime[roomId];
  return ok({ ...data, grid: res.value, runtime });
}
