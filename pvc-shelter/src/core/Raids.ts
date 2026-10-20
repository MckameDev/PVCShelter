import {
  DOOR_HP,
  RAID_BASE_ENEMIES,
  RAID_CHANCE,
  RAID_CHECK_SECONDS,
  RAID_DEFS,
  RAID_MAX_ENEMIES,
  RAID_MIN_POPULATION,
  RAID_POPULATION_PER_ENEMY,
  RAID_REWARD_PER_ENEMY,
  RAID_STEAL_FOOD,
  RAID_STEAL_SECONDS,
  RAID_STEAL_WATER,
} from './config';
import { aliveEnemies, damageEnemies, dwellerDps, splitDamage } from './Combat';
import { getConnectedRoomIds } from './GridManager';
import type { IncidentContext } from './Incidents';
import { createRng, hashString } from './random';
import type { GridState, Raid, RaidKind, RoomLevel } from './types';

// Asaltos externos: rompen la puerta (los guardias de la entrada disparan
// mientras tanto) y luego recorren el búnker sala por sala robando hasta que
// los eliminan o se les acaba el recorrido.

export type RaidEvent =
  | { type: 'raid-started'; kind: RaidKind; enemies: number }
  | { type: 'door-breached'; kind: RaidKind }
  | { type: 'raid-repelled'; kind: RaidKind; codos: number }
  | { type: 'raid-left'; kind: RaidKind; loot: Raid['loot'] };

/** El contexto de incidentes sirve tal cual: los asaltos usan las mismas piezas. */
export type RaidContext = Omit<IncidentContext, 'events'> & { events: RaidEvent[] };

export function enemyCount(population: number): number {
  return Math.min(RAID_MAX_ENEMIES, RAID_BASE_ENEMIES + Math.floor(population / RAID_POPULATION_PER_ENEMY));
}

export function createRaid(kind: RaidKind, count: number, doorLevel: RoomLevel): Raid {
  const def = RAID_DEFS[kind];
  const enemies = Array.from({ length: count }, (_, i) => ({ id: `enemy-${i + 1}`, hp: def.enemyHp, maxHp: def.enemyHp, dps: def.enemyDps }));
  return {
    kind,
    enemies,
    phase: 'door',
    doorHp: DOOR_HP[doorLevel],
    doorMaxHp: DOOR_HP[doorLevel],
    route: [],
    step: 0,
    stealTimer: 0,
    loot: { codos: 0, food: 0, water: 0 },
  };
}

/** Recorrido dentro del búnker: piso a piso y de izquierda a derecha, sin ascensores. */
export function raidRoute(grid: GridState): string[] {
  const connected = getConnectedRoomIds(grid);
  return Object.values(grid.rooms)
    .filter((r) => r.type !== 'elevator' && connected.has(r.id))
    .sort((a, b) => a.floor - b.floor || a.col - b.col)
    .map((r) => r.id);
}

/** Sala donde están los asaltantes (null mientras golpean la puerta). */
export function raidRoomId(raid: Raid | null): string | null {
  return raid && raid.phase === 'inside' ? (raid.route[raid.step] ?? null) : null;
}

export function maybeStartRaid(ctx: RaidContext, population: number, dt: number): Raid | null {
  const bucket = Math.floor((ctx.time + dt) / RAID_CHECK_SECONDS);
  if (bucket === Math.floor(ctx.time / RAID_CHECK_SECONDS) || population < RAID_MIN_POPULATION) return null;
  const rng = createRng((ctx.seed ^ hashString(`raid@${bucket}`)) >>> 0);
  if (rng() >= RAID_CHANCE) return null;

  const kinds = (Object.keys(RAID_DEFS) as RaidKind[]).filter((k) => population >= RAID_DEFS[k].minPopulation);
  const kind = kinds[Math.floor(rng() * kinds.length)];
  const entrance = Object.values(ctx.grid.rooms).find((r) => r.type === 'entrance');
  const raid = createRaid(kind, enemyCount(population), entrance?.level ?? 1);
  ctx.events.push({ type: 'raid-started', kind, enemies: raid.enemies.length });
  return raid;
}

/** Avanza el asalto `dt` segundos. Devuelve el asalto actualizado, o null si terminó. */
export function updateRaid(raid: Raid, ctx: RaidContext, dt: number): Raid | null {
  const def = RAID_DEFS[raid.kind];
  let next: Raid = { ...raid, enemies: raid.enemies, loot: { ...raid.loot } };
  const enemyDps = aliveEnemies(next.enemies).reduce((sum, e) => sum + e.dps, 0);

  if (next.phase === 'door') {
    // Los guardias de la entrada disparan mientras los asaltantes golpean la puerta.
    const entrance = Object.values(ctx.grid.rooms).find((r) => r.type === 'entrance');
    const guards = entrance ? ctx.defenders(entrance.id) : [];
    next.enemies = damageEnemies(next.enemies, guards.reduce((s, d) => s + dwellerDps(d), 0) * dt);
    next.doorHp = Math.max(0, next.doorHp - enemyDps * dt);
    if (aliveEnemies(next.enemies).length > 0 && next.doorHp === 0) {
      next = { ...next, phase: 'inside', route: raidRoute(ctx.grid), step: 0, stealTimer: 0 };
      ctx.events.push({ type: 'door-breached', kind: next.kind });
    }
  } else {
    // Saltar salas que ya no existen (demolidas durante el asalto).
    while (next.step < next.route.length && !ctx.grid.rooms[next.route[next.step]]) next.step++;
    const roomId = next.route[next.step];
    const defenders = roomId ? ctx.defenders(roomId) : [];
    if (defenders.length > 0) {
      next.enemies = damageEnemies(next.enemies, defenders.reduce((s, d) => s + dwellerDps(d), 0) * dt);
      splitDamage(defenders, enemyDps * dt, ctx.damage);
      next.stealTimer = 0;
    } else if (roomId) {
      next.stealTimer += dt;
      if (next.stealTimer >= RAID_STEAL_SECONDS) {
        const thieves = aliveEnemies(next.enemies).length;
        const codos = Math.min(ctx.resources.codos, def.stealCodos * thieves);
        const food = Math.min(ctx.resources.food, RAID_STEAL_FOOD * thieves);
        const water = Math.min(ctx.resources.water, RAID_STEAL_WATER * thieves);
        ctx.resources.codos -= codos;
        ctx.resources.food -= food;
        ctx.resources.water -= water;
        next.loot = { codos: next.loot.codos + codos, food: next.loot.food + food, water: next.loot.water + water };
        next.step++;
        next.stealTimer = 0;
      }
    }
  }

  if (aliveEnemies(next.enemies).length === 0) {
    const codos = RAID_REWARD_PER_ENEMY * next.enemies.length;
    ctx.resources.codos += codos;
    ctx.events.push({ type: 'raid-repelled', kind: next.kind, codos });
    return null;
  }
  if (next.phase === 'inside' && next.step >= next.route.length) {
    ctx.events.push({ type: 'raid-left', kind: next.kind, loot: next.loot });
    return null;
  }
  return next;
}
