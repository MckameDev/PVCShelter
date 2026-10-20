import {
  DEATH_HAPPINESS_PENALTY,
  ENERGY_RESERVE_SECONDS,
  FOOD_PER_DWELLER,
  HP_REGEN,
  HUNGER_DAMAGE,
  INTOX_RECOVERY,
  ROOM_DEFS,
  RUSH_HEAT_DECAY_SECONDS,
  THIRST_INTOX,
  WATER_PER_DWELLER,
  XP_PER_STAT_SECOND,
} from './config';
import { createDweller, globalHappiness, livingCount, populationCap } from './Dwellers';
import { buildOccupancy, roomNeighborIds } from './GridManager';
import {
  applyLevelUps,
  happinessTarget,
  radioHappinessBonus,
  recruitChance,
  updateCourtship,
  updateHappiness,
  updatePregnanciesAndGrowth,
  updateTraining,
} from './LifeCycle';
import type { LifeEvent } from './LifeCycle';
import { canFight } from './Combat';
import { craftTime, WORKSHOP_KIND } from './Crafting';
import { effectiveStat, petBonus } from './Equipment';
import { maybeStartRandomIncident, updateIncidents } from './Incidents';
import type { IncidentContext, IncidentEvent } from './Incidents';
import { maybeStartRaid, raidRoomId, updateRaid } from './Raids';
import type { RaidEvent } from './Raids';
import { cycleTime, getRuntime } from './Production';
import { createRng, hashString } from './random';
import type { Dweller, GameData, GridState, Room, RoomRuntime } from './types';

// Simulación por ticks. Función pura y determinista (sin RNG ni reloj): el
// mismo estado + el mismo dt da siempre el mismo resultado. Eso permite
// testearla y reutilizarla para el progreso offline del Sprint 8.

/** Paso fijo de simulación en segundos. */
export const SIM_STEP = 0.25;

export type SimEvent =
  | LifeEvent
  | IncidentEvent
  | RaidEvent
  | { type: 'dweller-died'; name: string }
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
  const life: LifeEvent[] = [];
  const { grid } = data;
  const resources = { ...data.resources };
  const runtime: Record<string, RoomRuntime> = {};
  const dwellers: Record<string, Dweller> = {};
  for (const [id, d] of Object.entries(data.dwellers)) dwellers[id] = { ...d };

  // 0. Las embarazadas huyen de las salas con incidentes o asaltantes.
  const raidRoom = raidRoomId(data.raid);
  for (const d of Object.values(dwellers)) {
    if (d.alive && d.pregnancy && d.roomId && (data.runtime[d.roomId]?.incident || d.roomId === raidRoom)) {
      d.roomId = null;
      life.push({ type: 'fled', name: d.name });
    }
  }

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

  // 2. Comida y agua por habitante vivo (los niños también comen).
  const hadFood = resources.food > 0;
  const hadWater = resources.water > 0;
  const food = consume(resources.food, alive.length * FOOD_PER_DWELLER * dt);
  const water = consume(resources.water, alive.length * WATER_PER_DWELLER * dt);
  resources.food = food.stock;
  resources.water = water.stock;
  if (hadFood && food.shortage > 0) events.push({ type: 'shortage', resource: 'food' });
  if (hadWater && water.shortage > 0) events.push({ type: 'shortage', resource: 'water' });

  // 3. Incidentes y asaltos: quienes están en la sala pelean y reciben el daño repartido.
  const damage = new Map<string, number>();
  const conflict: IncidentEvent[] = [];
  const ctx: IncidentContext = {
    grid,
    runtime,
    resources,
    defenders: (roomId) => (workersByRoom.get(roomId) ?? []).filter(canFight),
    damage,
    events: conflict,
    seed: grid.seed,
    time: data.time,
  };
  updateIncidents(ctx, dt);
  maybeStartRandomIncident(ctx, alive.length, dt);
  const raidEvents: RaidEvent[] = [];
  const raidCtx = { ...ctx, events: raidEvents };
  const raid = data.raid ? updateRaid(data.raid, raidCtx, dt) : maybeStartRaid(raidCtx, alive.length, dt);
  events.push(...conflict, ...raidEvents);
  const dangerRoom = raidRoomId(raid);

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
      // La muerte entristece a los compañeros de sala.
      for (const mate of workersByRoom.get(dw.roomId ?? '') ?? []) {
        if (mate.id !== dw.id) dwellers[mate.id].happiness = Math.max(0, dwellers[mate.id].happiness - DEATH_HAPPINESS_PENALTY);
      }
      dw.hp = 0;
      dw.alive = false;
      dw.roomId = null;
      dw.pregnancy = null;
      dw.courtship = null;
      events.push({ type: 'dweller-died', name: dw.name });
    }
  }

  // 5. Producción (con bono de felicidad global) y XP por trabajar.
  const happiness = globalHappiness({ dwellers });
  for (const room of Object.values(grid.rooms)) {
    const rt = runtime[room.id];
    const stat = ROOM_DEFS[room.type].stat;
    if (!ROOM_DEFS[room.type].produces || !stat || rt.ready || rt.incident || !rt.powered || room.id === dangerRoom) continue;
    const workers = (workersByRoom.get(room.id) ?? []).filter((w) => dwellers[w.id].alive);
    const t = cycleTime(room, workers, happiness);
    if (t === null) continue;
    const progress = rt.progress + dt;
    runtime[room.id] = progress >= t ? { ...rt, progress: t, ready: true } : { ...rt, progress };
    for (const w of workers) dwellers[w.id].xp += effectiveStat(w, stat) * XP_PER_STAT_SECOND * dt * (1 + petBonus(w, 'xp'));
  }

  // 5b. Entrenamiento y radio (salas con energía y sin incidentes).
  let nextId = data.nextDwellerId;
  for (const room of Object.values(grid.rooms)) {
    const rt = runtime[room.id];
    if (!rt.powered || rt.incident || room.id === dangerRoom) continue;
    const occupants = (workersByRoom.get(room.id) ?? []).map((w) => dwellers[w.id]).filter((d) => d.alive);

    if (ROOM_DEFS[room.type].trains) updateTraining(room, occupants, dt, life);

    // Talleres: avanza la fabricación en curso.
    if (WORKSHOP_KIND[room.type] && rt.craft && !rt.ready) {
      const t = craftTime(room, rt.craft.defId, occupants);
      if (t === null) continue;
      const progress = rt.craft.progress + dt;
      runtime[room.id] = { ...rt, craft: { ...rt.craft, progress: Math.min(progress, t) }, ready: progress >= t };
    }

    if (room.type === 'radio') {
      const t = cycleTime(room, occupants, happiness);
      if (t === null) continue;
      const progress = rt.progress + dt;
      if (progress < t) {
        runtime[room.id] = { ...rt, progress };
        continue;
      }
      runtime[room.id] = { ...rt, progress: 0 };
      // RNG derivado del estado: misma partida, mismo resultado.
      const rng = createRng((grid.seed ^ hashString(`${room.id}@${data.time}`)) >>> 0);
      if (rng() < recruitChance(occupants) && livingCount({ dwellers }) < populationCap(grid)) {
        const id = `dweller-${nextId++}`;
        dwellers[id] = createDweller(rng, id);
        life.push({ type: 'recruited', name: dwellers[id].name });
      }
    }
  }
  const radioBonus = radioHappinessBonus(Object.values(grid.rooms), runtime, (id) => (workersByRoom.get(id)?.length ?? 0) > 0);

  // 6. Niveles y felicidad individual.
  for (const d of Object.values(dwellers)) {
    if (!d.alive) continue;
    resources.codos += applyLevelUps(d, life);
    const room = d.roomId ? grid.rooms[d.roomId] : undefined;
    const target = happinessTarget(d, {
      room,
      runtime: room ? runtime[room.id] : undefined,
      inDanger: !!room && (!!runtime[room.id]?.incident || room.id === dangerRoom),
      foodShortage: food.shortage > 0,
      waterShortage: water.shortage > 0,
      radioBonus,
    });
    updateHappiness(d, target, dt);
  }

  // 7. Reproducción: cortejo en Salas de Descanso con energía y sin incidentes.
  for (const room of Object.values(grid.rooms)) {
    const rt = runtime[room.id];
    if (room.type !== 'living' || !rt.powered || rt.incident) continue;
    updateCourtship((workersByRoom.get(room.id) ?? []).map((w) => dwellers[w.id]), dt, life);
  }
  for (const d of Object.values(dwellers)) {
    // Un cortejo solo sigue vivo dentro de una Sala de Descanso.
    if (d.courtship && (!d.roomId || grid.rooms[d.roomId]?.type !== 'living')) d.courtship = null;
  }
  const nextDwellerId = updatePregnanciesAndGrowth(dwellers, grid, populationCap(grid), nextId, dt, life);


  return {
    data: { ...data, resources, runtime, dwellers, raid, nextDwellerId, time: data.time + dt },

    events: [...events, ...life],
  };
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
