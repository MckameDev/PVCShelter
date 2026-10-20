import {
  DWELLER_BASE_DPS,
  DWELLER_DPS_PER_P,
  ENERGY_RESERVE_SECONDS,
  FOOD_PER_DWELLER,
  HP_REGEN,
  HUNGER_DAMAGE,
  INCIDENT_DPS_PER_BLOCK,
  INCIDENT_REWARD_PER_BLOCK,
  INTOX_RECOVERY,
  ROOM_DEFS,
  RUSH_HEAT_DECAY_SECONDS,
  THIRST_INTOX,
  WATER_PER_DWELLER,
} from './config';
import { buildOccupancy, roomNeighborIds } from './GridManager';
import { cycleTime, getRuntime } from './Production';
import type { Dweller, GameData, GridState, IncidentKind, Room, RoomRuntime } from './types';

// Simulación por ticks. Función pura y determinista (sin RNG ni reloj): el
// mismo estado + el mismo dt da siempre el mismo resultado. Eso permite
// testearla y reutilizarla para el progreso offline del Sprint 8.

/** Paso fijo de simulación en segundos. */
export const SIM_STEP = 0.25;

export type SimEvent =
  | { type: 'dweller-died'; name: string }
  | { type: 'incident-resolved'; roomId: string; kind: IncidentKind; codos: number }
  | { type: 'shortage'; resource: 'food' | 'water' | 'energy' };

// ---------------------------------------------------------------------------
// Energía
// ---------------------------------------------------------------------------

const distanceCache = new WeakMap<GridState, Map<string, number>>();

/** Saltos desde cada sala hasta el generador más cercano (BFS multi-origen). Infinity si no hay ruta. */
export function distancesToGenerators(grid: GridState): Map<string, number> {
  const cached = distanceCache.get(grid);
  if (cached) return cached;

  const dist = new Map<string, number>();
  const occ = buildOccupancy(grid);
  const queue: string[] = [];
  for (const room of Object.values(grid.rooms)) {
    if (ROOM_DEFS[room.type].produces === 'energy') {
      dist.set(room.id, 0);
      queue.push(room.id);
    }
  }
  for (let i = 0; i < queue.length; i++) {
    const room = grid.rooms[queue[i]];
    const d = dist.get(room.id)!;
    for (const id of roomNeighborIds(grid, occ, room)) {
      if (!dist.has(id)) {
        dist.set(id, d + 1);
        queue.push(id);
      }
    }
  }
  for (const id of Object.keys(grid.rooms)) if (!dist.has(id)) dist.set(id, Infinity);
  distanceCache.set(grid, dist);
  return dist;
}

export function roomEnergyDraw(room: Room): number {
  return ROOM_DEFS[room.type].energyDraw * room.blocks;
}

/** Consumidores ordenados del más cercano al más lejano de un generador. */
function energyConsumers(grid: GridState): Room[] {
  const dist = distancesToGenerators(grid);
  return Object.values(grid.rooms)
    .filter((r) => roomEnergyDraw(r) > 0)
    .sort((a, b) => dist.get(a.id)! - dist.get(b.id)! || a.floor - b.floor || a.col - b.col);
}

/** Energía mínima para mantener todas las salas encendidas. */
export function requiredEnergy(grid: GridState): number {
  return energyConsumers(grid).reduce((sum, r) => sum + roomEnergyDraw(r), 0) * ENERGY_RESERVE_SECONDS;
}

/**
 * Decide qué salas tienen energía: cada consumidor, en orden de cercanía,
 * necesita que el stock cubra la reserva acumulada hasta él. Si el stock baja
 * del mínimo, se apagan primero las más lejanas.
 */
export function allocatePower(grid: GridState, stock: number): Set<string> {
  const powered = new Set<string>();
  let cumulative = 0;
  for (const room of energyConsumers(grid)) {
    cumulative += roomEnergyDraw(room) * ENERGY_RESERVE_SECONDS;
    if (stock > 0 && stock >= cumulative) powered.add(room.id);
  }
  return powered;
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

function consume(stock: number, need: number): { stock: number; shortage: number } {
  if (need <= 0) return { stock, shortage: 0 };
  if (stock >= need) return { stock: stock - need, shortage: 0 };
  return { stock: 0, shortage: 1 - stock / need };
}

export function simulate(data: GameData, dt: number): { data: GameData; events: SimEvent[] } {
  const events: SimEvent[] = [];
  const { grid } = data;
  const resources = { ...data.resources };
  const runtime: Record<string, RoomRuntime> = {};
  const dwellers: Record<string, Dweller> = {};
  for (const [id, d] of Object.entries(data.dwellers)) dwellers[id] = { ...d };

  const alive = Object.values(dwellers).filter((d) => d.alive);
  const workersByRoom = new Map<string, Dweller[]>();
  for (const d of alive) {
    if (d.roomId) workersByRoom.set(d.roomId, [...(workersByRoom.get(d.roomId) ?? []), d]);
  }

  // 1. Energía: reparto por distancia y consumo de las salas encendidas.
  const powered = allocatePower(grid, resources.energy);
  let drain = 0;
  for (const room of Object.values(grid.rooms)) {
    const draw = roomEnergyDraw(room);
    const isPowered = draw === 0 || powered.has(room.id);
    if (draw > 0 && isPowered) drain += draw * dt;
    const prev = getRuntime(data, room.id);
    runtime[room.id] = {
      ...prev,
      powered: isPowered,
      rushHeat: Math.max(0, prev.rushHeat - dt / RUSH_HEAT_DECAY_SECONDS),
    };
  }
  const hadEnergy = resources.energy > 0;
  resources.energy = Math.max(0, resources.energy - drain);
  if (hadEnergy && resources.energy === 0 && drain > 0) events.push({ type: 'shortage', resource: 'energy' });

  // 2. Comida y agua por habitante vivo.
  const hadFood = resources.food > 0;
  const hadWater = resources.water > 0;
  const food = consume(resources.food, alive.length * FOOD_PER_DWELLER * dt);
  const water = consume(resources.water, alive.length * WATER_PER_DWELLER * dt);
  resources.food = food.stock;
  resources.water = water.stock;
  if (hadFood && food.shortage > 0) events.push({ type: 'shortage', resource: 'food' });
  if (hadWater && water.shortage > 0) events.push({ type: 'shortage', resource: 'water' });

  // 3. Incidentes: los habitantes de la sala lo combaten y reciben daño repartido.
  const damage = new Map<string, number>();
  for (const room of Object.values(grid.rooms)) {
    const rt = runtime[room.id];
    if (!rt.incident) continue;
    const workers = workersByRoom.get(room.id) ?? [];
    const dps = workers.reduce((sum, w) => sum + DWELLER_BASE_DPS + w.stats.P * DWELLER_DPS_PER_P, 0);
    const hp = rt.incident.hp - dps * dt;
    if (workers.length > 0) {
      const share = (INCIDENT_DPS_PER_BLOCK * room.blocks * dt) / workers.length;
      for (const w of workers) damage.set(w.id, (damage.get(w.id) ?? 0) + share);
    }
    if (hp <= 0) {
      const codos = INCIDENT_REWARD_PER_BLOCK * room.blocks;
      resources.codos += codos;
      runtime[room.id] = { ...rt, incident: null };
      events.push({ type: 'incident-resolved', roomId: room.id, kind: rt.incident.kind, codos });
    } else {
      runtime[room.id] = { ...rt, incident: { ...rt.incident, hp } };
    }
  }

  // 4. Salud: hambre quita HP, sed intoxica; con ambos cubiertos se recupera despacio.
  for (const d of alive) {
    const dw = dwellers[d.id];
    if (water.shortage > 0) dw.intox += THIRST_INTOX * water.shortage * dt;
    else dw.intox -= INTOX_RECOVERY * dt;
    dw.intox = Math.min(dw.maxHp, Math.max(0, dw.intox));

    if (food.shortage > 0) dw.hp -= HUNGER_DAMAGE * food.shortage * dt;
    else if (water.shortage === 0) dw.hp += HP_REGEN * dt;
    dw.hp -= damage.get(d.id) ?? 0;
    dw.hp = Math.min(dw.maxHp - dw.intox, dw.hp);

    if (dw.hp <= 0) {
      dw.hp = 0;
      dw.alive = false;
      dw.roomId = null;
      events.push({ type: 'dweller-died', name: dw.name });
    }
  }

  // 5. Producción: avanza solo con energía, sin incidente y sin cosecha pendiente.
  for (const room of Object.values(grid.rooms)) {
    const rt = runtime[room.id];
    if (!ROOM_DEFS[room.type].produces || rt.ready || rt.incident || !rt.powered) continue;
    const workers = (workersByRoom.get(room.id) ?? []).filter((w) => dwellers[w.id].alive);
    const t = cycleTime(room, workers);
    if (t === null) continue;
    const progress = rt.progress + dt;
    runtime[room.id] = progress >= t ? { ...rt, progress: t, ready: true } : { ...rt, progress };
  }

  return { data: { ...data, resources, runtime, dwellers, time: data.time + dt }, events };
}

/** Avanza `seconds` en pasos fijos de SIM_STEP. Devuelve el resto no simulado. */
export function advance(data: GameData, seconds: number): { data: GameData; events: SimEvent[]; remainder: number } {
  let current = data;
  const events: SimEvent[] = [];
  let left = seconds;
  while (left >= SIM_STEP) {
    const res = simulate(current, SIM_STEP);
    current = res.data;
    events.push(...res.events);
    left -= SIM_STEP;
  }
  return { data: current, events, remainder: left };
}
