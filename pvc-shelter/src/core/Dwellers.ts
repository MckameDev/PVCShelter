import { DWELLER_BASE_HP, ROOM_DEFS } from './config';
import { roomCapacity } from './Economy';
import { randomInt } from './random';
import { fail, ok } from './types';
import type { Dweller, GameData, PatronStat, PatronStats, Result, Rng } from './types';

// Modelo mínimo de habitantes para el Sprint 2 (stats, HP, asignación).
// Movimiento, drag & drop, niveles y reproducción llegan en el Sprint 3.

export const PATRON_KEYS: PatronStat[] = ['P', 'A', 'T', 'R', 'O', 'N'];

export const PATRON_NAMES: Record<PatronStat, string> = {
  P: 'Poderío',
  A: 'Astucia',
  T: 'Tenacidad',
  R: 'Rebusque',
  O: 'Optimismo',
  N: 'Ñeque',
};

const NAMES_M = ['Tito', 'Rulo', 'Beto', 'Chuy', 'Nacho', 'Pepe', 'Lalo', 'Moncho', 'Kike', 'Fede'];
const NAMES_F = ['Rita', 'Nena', 'Lola', 'Chela', 'Mili', 'Tere', 'Pili', 'Cata', 'Juana', 'Vero'];
const SURNAMES = ['Codo', 'Teflón', 'Bidón', 'Manguera', 'Tarugo', 'Silicona', 'Llave', 'Abrazadera', 'Lona', 'Niple'];

const pick = <T>(rng: Rng, list: T[]): T => list[Math.floor(rng() * list.length)];

export function createDweller(rng: Rng, id: string, sex: Dweller['sex'] = rng() < 0.5 ? 'M' : 'F'): Dweller {
  const stats = Object.fromEntries(PATRON_KEYS.map((k) => [k, randomInt(rng, 1, 3)])) as PatronStats;
  // Una especialidad para que asignar a la sala correcta importe.
  const specialty = pick(rng, PATRON_KEYS);
  stats[specialty] = Math.min(10, stats[specialty] + randomInt(rng, 2, 4));
  return {
    id,
    name: `${pick(rng, sex === 'M' ? NAMES_M : NAMES_F)} ${pick(rng, SURNAMES)}`,
    sex,
    stats,
    level: 1,
    xp: 0,
    hp: DWELLER_BASE_HP,
    maxHp: DWELLER_BASE_HP,
    intox: 0,
    roomId: null,
    alive: true,
  };
}

/** Población inicial equilibrada en sexos (necesario para la reproducción del Sprint 3). */
export function generateDwellers(rng: Rng, count: number, firstId: number) {
  const dwellers: Record<string, Dweller> = {};
  let nextId = firstId;
  for (let i = 0; i < count; i++) {
    const id = `dweller-${nextId++}`;
    dwellers[id] = createDweller(rng, id, i % 2 === 0 ? 'M' : 'F');
  }
  return { dwellers, nextId };
}

/** HP máximo menos la intoxicación (barra roja). */
export function effectiveMaxHp(d: Dweller): number {
  return Math.max(0, d.maxHp - d.intox);
}

export function dwellersInRoom(data: Pick<GameData, 'dwellers'>, roomId: string): Dweller[] {
  return Object.values(data.dwellers).filter((d) => d.alive && d.roomId === roomId);
}

/** Asigna a una sala, o la deja sin asignar si roomId es null. */
export function assignDweller(data: GameData, dwellerId: string, roomId: string | null): Result<GameData> {
  const dweller = data.dwellers[dwellerId];
  if (!dweller) return fail('El habitante no existe.');
  if (!dweller.alive) return fail(`${dweller.name} ya no está con nosotros.`);
  if (dweller.roomId === roomId) return ok(data);

  if (roomId !== null) {
    const room = data.grid.rooms[roomId];
    if (!room) return fail('La sala no existe.');
    const capacity = roomCapacity(room);
    if (capacity === 0) return fail(`Nadie puede trabajar en ${ROOM_DEFS[room.type].name}.`);
    if (dwellersInRoom(data, roomId).length >= capacity) return fail('La sala está llena.');
  }
  return ok({ ...data, dwellers: { ...data.dwellers, [dwellerId]: { ...dweller, roomId } } });
}
