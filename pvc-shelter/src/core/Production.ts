import {
  CODOS_CHANCE_MAX,
  CODOS_CHANCE_PER_R,
  INCIDENT_HP_PER_BLOCK,
  MIN_CYCLE_FACTOR,
  REFERENCE_STAT,
  ROOM_DEFS,
  RUSH_BASE_FAIL,
  RUSH_FAIL_MAX,
  RUSH_FAIL_MIN,
  RUSH_FAIL_PER_HEAT,
  RUSH_FAIL_PER_R,
  RUSH_FAIL_PER_ROOM_STAT,
  XP_PER_COLLECT,
  XP_PER_RUSH,
} from './config';
import { dwellersInRoom } from './Dwellers';
import { roomCapacity, roomEfficiency, storageCap } from './Economy';
import { randomInt } from './random';
import { fail, ok } from './types';
import type { Dweller, GameData, IncidentKind, PatronStat, Result, Rng, Room, RoomRuntime, VitalResource } from './types';

// Ciclos de producción, recolección y Modo Exprés (Rush).

export const RESOURCE_NAMES: Record<VitalResource, string> = {
  energy: 'Energía',
  food: 'Comida',
  water: 'Agua',
};

export function emptyRuntime(): RoomRuntime {
  return { progress: 0, ready: false, rushHeat: 0, powered: true, incident: null };
}

export function getRuntime(data: Pick<GameData, 'runtime'>, roomId: string): RoomRuntime {
  return data.runtime[roomId] ?? emptyRuntime();
}

export function statSum(workers: Dweller[], stat: PatronStat): number {
  return workers.reduce((sum, d) => sum + d.stats[stat], 0);
}

/**
 * Segundos que tarda un ciclo con los trabajadores actuales, o null si la sala
 * no produce o está vacía. Una sala llena con stat media REFERENCE_STAT tarda
 * exactamente cycleSeconds; mejores stats o más gente lo acortan.
 */
export function cycleTime(room: Room, workers: Dweller[]): number | null {
  const def = ROOM_DEFS[room.type];
  if (!def.produces || !def.stat || workers.length === 0) return null;
  const sum = statSum(workers, def.stat);
  if (sum <= 0) return null;
  const t = (def.cycleSeconds * roomCapacity(room) * REFERENCE_STAT) / sum;
  return Math.max(t, def.cycleSeconds * MIN_CYCLE_FACTOR);
}

export function cycleYield(room: Room): number {
  return Math.round(ROOM_DEFS[room.type].baseYield * roomEfficiency(room));
}

export function codosChance(workers: Dweller[]): number {
  return Math.min(CODOS_CHANCE_MAX, statSum(workers, 'R') * CODOS_CHANCE_PER_R);
}

/** % de fallo del Exprés: baja con Rebusque (R) y el stat de la sala; sube con cada uso reciente. */
export function rushFailChance(room: Room, runtime: RoomRuntime, workers: Dweller[]): number {
  const stat = ROOM_DEFS[room.type].stat;
  const n = Math.max(1, workers.length);
  const avgR = statSum(workers, 'R') / n;
  const avgStat = stat ? statSum(workers, stat) / n : 0;
  const chance =
    RUSH_BASE_FAIL +
    runtime.rushHeat * RUSH_FAIL_PER_HEAT -
    avgR * RUSH_FAIL_PER_R -
    avgStat * RUSH_FAIL_PER_ROOM_STAT;
  return Math.min(RUSH_FAIL_MAX, Math.max(RUSH_FAIL_MIN, chance));
}

function addResource(data: GameData, resource: VitalResource, amount: number): { data: GameData; stored: number } {
  const cap = storageCap(data.grid, resource);
  const current = data.resources[resource];
  const next = Math.min(cap, current + amount);
  return { data: { ...data, resources: { ...data.resources, [resource]: next } }, stored: Math.max(0, next - current) };
}

function addXp(data: GameData, workers: Dweller[], xp: number): GameData {
  if (workers.length === 0) return data;
  const dwellers = { ...data.dwellers };
  for (const w of workers) dwellers[w.id] = { ...dwellers[w.id], xp: dwellers[w.id].xp + xp };
  return { ...data, dwellers };
}

function rollCodos(rng: Rng, workers: Dweller[], blocks: number): number {
  return rng() < codosChance(workers) ? randomInt(rng, 3, 10) * blocks : 0;
}

export interface CollectSummary {
  resource: VitalResource;
  /** Unidades que entraron al almacén (puede ser menos que lo producido si está lleno). */
  stored: number;
  codos: number;
  rooms: number;
}

/** Recolecta todas las salas listas que producen `resource` (como tocar un icono en Fallout Shelter). */
export function collectResource(data: GameData, resource: VitalResource, rng: Rng): Result<{ data: GameData; summary: CollectSummary }> {
  const readyRooms = Object.values(data.grid.rooms).filter(
    (r) => ROOM_DEFS[r.type].produces === resource && getRuntime(data, r.id).ready,
  );
  if (readyRooms.length === 0) return fail(`No hay ${RESOURCE_NAMES[resource]} lista para recolectar.`);

  let next = data;
  let produced = 0;
  let codos = 0;
  const runtime = { ...data.runtime };
  for (const room of readyRooms) {
    const workers = dwellersInRoom(data, room.id);
    produced += cycleYield(room);
    codos += rollCodos(rng, workers, room.blocks);
    runtime[room.id] = { ...getRuntime(data, room.id), ready: false, progress: 0 };
    next = addXp(next, workers, XP_PER_COLLECT);
  }
  next = { ...next, runtime };
  const added = addResource(next, resource, produced);
  next = { ...added.data, resources: { ...added.data.resources, codos: added.data.resources.codos + codos } };
  return ok({ data: next, summary: { resource, stored: Math.round(added.stored), codos, rooms: readyRooms.length } });
}

export function canRush(data: GameData, roomId: string): Result<{ room: Room; workers: Dweller[]; failChance: number }> {
  const room = data.grid.rooms[roomId];
  if (!room) return fail('La sala no existe.');
  if (!ROOM_DEFS[room.type].produces) return fail('Esta sala no produce recursos.');
  const runtime = getRuntime(data, roomId);
  if (runtime.incident) return fail('Hay un incidente en la sala.');
  if (!runtime.powered) return fail('La sala no tiene energía.');
  if (runtime.ready) return fail('Recolecta primero lo producido.');
  const workers = dwellersInRoom(data, roomId);
  if (workers.length === 0) return fail('Asigna habitantes para usar el Modo Exprés.');
  return ok({ room, workers, failChance: rushFailChance(room, runtime, workers) });
}

export type RushOutcome =
  | { success: true; resource: VitalResource; stored: number; codos: number }
  | { success: false; incident: IncidentKind };

export function rushRoom(data: GameData, roomId: string, rng: Rng): Result<{ data: GameData; outcome: RushOutcome }> {
  const check = canRush(data, roomId);
  if (!check.ok) return check;
  const { room, workers, failChance } = check.value;
  const runtime = getRuntime(data, roomId);
  const heated: RoomRuntime = { ...runtime, rushHeat: runtime.rushHeat + 1 };

  if (rng() < failChance) {
    const kind: IncidentKind = rng() < 0.5 ? 'fire' : 'roaches';
    const hp = INCIDENT_HP_PER_BLOCK * room.blocks;
    const next = { ...data, runtime: { ...data.runtime, [roomId]: { ...heated, incident: { kind, hp, maxHp: hp } } } };
    return ok({ data: next, outcome: { success: false, incident: kind } });
  }

  const resource = ROOM_DEFS[room.type].produces!;
  // Éxito: produce el ciclo completo al instante, con bonus garantizado de Codos.
  const codos = rollCodos(rng, workers, room.blocks) + randomInt(rng, 10, 25) * room.blocks;
  let next: GameData = { ...data, runtime: { ...data.runtime, [roomId]: { ...heated, progress: 0 } } };
  next = addXp(next, workers, XP_PER_RUSH);
  const added = addResource(next, resource, cycleYield(room));
  next = { ...added.data, resources: { ...added.data.resources, codos: added.data.resources.codos + codos } };
  return ok({ data: next, outcome: { success: true, resource, stored: Math.round(added.stored), codos } });
}
