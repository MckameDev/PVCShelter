import {
  INCIDENT_DEFS,
  INCIDENT_REWARD_PER_BLOCK,
  INCIDENT_SPREAD_SECONDS,
  PASSIVE_INCIDENT_BURNOUT_SECONDS,
  PASSIVE_INCIDENT_WEIGHT,
  RANDOM_INCIDENT_CHANCE,
  RANDOM_INCIDENT_CHECK_SECONDS,
  RANDOM_INCIDENT_MIN_POPULATION,
  REPAIR_CODOS_PER_HP,
} from './config';
import { createIncident, dwellerDps, pickIncidentKind, splitDamage } from './Combat';
import { roomCapacity } from './Economy';
import { findRoomAt, roomWidth } from './GridManager';
import { createRng, hashString } from './random';
import { fail, ok } from './types';
import type { Dweller, GameData, GridState, Incident, IncidentKind, Resources, Result, Room, RoomRuntime } from './types';

// Incidentes internos dentro de un tick: combate, consumo extra, propagación y
// aparición aleatoria. MUTAN `runtime`, `resources` y `damage` del contexto,
// que son copias creadas por `simulate` para este tick.

export type IncidentEvent =
  | { type: 'incident-started'; roomId: string; kind: IncidentKind }
  | { type: 'incident-spread'; roomId: string; kind: IncidentKind }
  | { type: 'incident-resolved'; roomId: string; kind: IncidentKind; codos: number };

export interface IncidentContext {
  grid: GridState;
  runtime: Record<string, RoomRuntime>;
  resources: Resources;
  /** Habitantes que pelean en una sala (adultos vivos, sin embarazadas). */
  defenders: (roomId: string) => Dweller[];
  /** Daño acumulado por habitante en este tick (se aplica en el paso de salud). */
  damage: Map<string, number>;
  events: IncidentEvent[];
  seed: number;
  time: number;
}

/** Salas que se tocan: a los lados en el mismo piso y encima/debajo con columnas en común. */
export function adjacentRooms(grid: GridState, room: Room): Room[] {
  const found = new Map<string, Room>();
  const w = roomWidth(room);
  const add = (r: Room | null) => {
    if (r && r.id !== room.id) found.set(r.id, r);
  };
  add(findRoomAt(grid, room.floor, room.col - 1));
  add(findRoomAt(grid, room.floor, room.col + w));
  for (let c = room.col; c < room.col + w; c++) {
    add(findRoomAt(grid, room.floor - 1, c));
    add(findRoomAt(grid, room.floor + 1, c));
  }
  return [...found.values()];
}

/** Los incidentes no prenden en ascensores ni en la puerta (la puerta tiene sus propios asaltos). */
const canHostIncident = (room: Room) => room.type !== 'entrance' && room.type !== 'elevator';

/**
 * Salas sin puestos de trabajo (Almacén, Barracones, Peluquería, Oficina):
 * nadie puede entrar a combatir, así que sus incidentes son averías que se
 * apagan solas, no se propagan y se pueden reparar pagando Codos.
 */
export const isPassiveRoom = (room: Room) => roomCapacity(room) === 0;

export function updateIncidents(ctx: IncidentContext, dt: number): void {
  // Foto de las salas en llamas: lo que se propague en este tick empieza a actuar en el siguiente.
  const burning = Object.values(ctx.grid.rooms).filter((r) => ctx.runtime[r.id]?.incident);

  for (const room of burning) {
    const rt = ctx.runtime[room.id];
    const incident = rt.incident!;
    const def = INCIDENT_DEFS[incident.kind];
    const passive = isPassiveRoom(room);
    const defenders = passive ? [] : ctx.defenders(room.id);

    const fought = defenders.reduce((sum, d) => sum + dwellerDps(d), 0) * dt;
    const burnout = passive ? (incident.maxHp / PASSIVE_INCIDENT_BURNOUT_SECONDS) * dt : 0;
    const hp = incident.hp - fought - burnout;
    splitDamage(defenders, def.dpsPerBlock * room.blocks * dt, ctx.damage);
    for (const [res, perSecond] of Object.entries(def.drain) as [keyof typeof def.drain, number][]) {
      ctx.resources[res] = Math.max(0, ctx.resources[res] - perSecond * room.blocks * dt);
    }

    if (hp <= 0) {
      // Solo se recompensa lo que combatieron los habitantes, no una avería que se apagó sola.
      const codos = passive ? 0 : INCIDENT_REWARD_PER_BLOCK * room.blocks;
      ctx.resources.codos += codos;
      ctx.runtime[room.id] = { ...rt, incident: null };
      ctx.events.push({ type: 'incident-resolved', roomId: room.id, kind: incident.kind, codos });
      continue;
    }

    // Sin nadie que lo combata, el incidente termina saltando a una sala vecina
    // (salvo las averías de salas sin puestos, que se consumen en su sitio).
    let spread = defenders.length > 0 || passive ? 0 : incident.spread + dt;
    if (spread >= INCIDENT_SPREAD_SECONDS) {
      spread = 0;
      const targets = adjacentRooms(ctx.grid, room)
        .filter((r) => canHostIncident(r) && !ctx.runtime[r.id]?.incident)
        .sort((a, b) => a.id.localeCompare(b.id));
      if (targets.length > 0) {
        const rng = createRng((ctx.seed ^ hashString(`spread:${room.id}@${ctx.time}`)) >>> 0);
        const target = targets[Math.floor(rng() * targets.length)];
        ctx.runtime[target.id] = { ...ctx.runtime[target.id], incident: createIncident(incident.kind, target) };
        ctx.events.push({ type: 'incident-spread', roomId: target.id, kind: incident.kind });
      }
    }
    ctx.runtime[room.id] = { ...rt, incident: { ...incident, hp, spread } };
  }
}

/**
 * Cada RANDOM_INCIDENT_CHECK_SECONDS tira un dado (derivado del estado) para
 * iniciar un incidente. Las salas con gente pesan 1 y las salas sin puestos
 * PASSIVE_INCIDENT_WEIGHT: también se estropean, pero menos.
 */
export function maybeStartRandomIncident(ctx: IncidentContext, population: number, dt: number): void {
  const bucket = Math.floor((ctx.time + dt) / RANDOM_INCIDENT_CHECK_SECONDS);
  if (bucket === Math.floor(ctx.time / RANDOM_INCIDENT_CHECK_SECONDS)) return;
  if (population < RANDOM_INCIDENT_MIN_POPULATION) return;

  const rng = createRng((ctx.seed ^ hashString(`incident@${bucket}`)) >>> 0);
  if (rng() >= RANDOM_INCIDENT_CHANCE) return;
  const candidates = Object.values(ctx.grid.rooms)
    .filter((r) => canHostIncident(r) && !ctx.runtime[r.id]?.incident)
    .map((r) => ({ room: r, weight: isPassiveRoom(r) ? PASSIVE_INCIDENT_WEIGHT : ctx.defenders(r.id).length > 0 ? 1 : 0 }))
    .filter((c) => c.weight > 0)
    .sort((a, b) => a.room.id.localeCompare(b.room.id));
  const total = candidates.reduce((s, c) => s + c.weight, 0);
  if (total === 0) return;
  let roll = rng() * total;
  const picked = candidates.find((c) => (roll -= c.weight) < 0) ?? candidates[candidates.length - 1];
  const kind = pickIncidentKind(rng, picked.room);
  ctx.runtime[picked.room.id] = { ...ctx.runtime[picked.room.id], incident: createIncident(kind, picked.room) };
  ctx.events.push({ type: 'incident-started', roomId: picked.room.id, kind });
}

/** Costo de reparar ya una avería de una sala sin puestos. */
export function repairCost(incident: Incident): number {
  return Math.ceil(incident.hp * REPAIR_CODOS_PER_HP);
}

/** Repara al instante una avería en una sala sin puestos de trabajo. */
export function repairRoom(data: GameData, roomId: string): Result<GameData> {
  const room = data.grid.rooms[roomId];
  const incident = data.runtime[roomId]?.incident;
  if (!room || !incident) return fail('No hay ninguna avería en esta sala.');
  if (!isPassiveRoom(room)) return fail('Esta sala se arregla asignando habitantes que combatan el incidente.');
  const cost = repairCost(incident);
  if (data.resources.codos < cost) return fail(`Faltan Codos de PVC (necesitas ${cost}).`);
  return ok({
    ...data,
    resources: { ...data.resources, codos: data.resources.codos - cost },
    runtime: { ...data.runtime, [roomId]: { ...data.runtime[roomId], incident: null } },
  });
}
