import {
  CHILDHOOD_SECONDS,
  DWELLER_BASE_HP,
  LEVEL_EFFICIENCY,
  MAX_DWELLER_LEVEL,
  POPULATION_BASE,
  POPULATION_HARD_CAP,
  POPULATION_PER_BARRACKS_BLOCK,
  POPULATION_PER_LIVING_BLOCK,
  ROOM_DEFS,
  START_HAPPINESS,
  XP_LEVEL_BASE,
  XP_LEVEL_EXP,
} from './config';
import { roomCapacity } from './Economy';
import { randomInt } from './random';
import { fail, ok } from './types';
import type { Dweller, GameData, GridState, PatronStat, PatronStats, Result, Rng } from './types';

// Habitantes: creación, parentesco, niveles, población y asignación a salas.

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
const clampStat = (v: number) => Math.min(10, Math.max(1, Math.round(v)));

function baseDweller(id: string, name: string, sex: Dweller['sex'], stats: PatronStats): Dweller {
  return {
    id,
    name,
    sex,
    stats,
    level: 1,
    xp: 0,
    hp: DWELLER_BASE_HP,
    maxHp: DWELLER_BASE_HP,
    intox: 0,
    roomId: null,
    alive: true,
    happiness: START_HAPPINESS,
    parents: null,
    childTime: 0,
    pregnancy: null,
    courtship: null,
    training: 0,
    equipment: { weapon: null, outfit: null, pet: null },
    appearance: null,
    location: 'bunker',
  };
}

export function createDweller(rng: Rng, id: string, sex: Dweller['sex'] = rng() < 0.5 ? 'M' : 'F'): Dweller {
  const stats = Object.fromEntries(PATRON_KEYS.map((k) => [k, randomInt(rng, 1, 3)])) as PatronStats;
  // Una especialidad para que asignar a la sala correcta importe.
  const specialty = pick(rng, PATRON_KEYS);
  stats[specialty] = clampStat(stats[specialty] + randomInt(rng, 2, 4));
  return baseDweller(id, `${pick(rng, sex === 'M' ? NAMES_M : NAMES_F)} ${pick(rng, SURNAMES)}`, sex, stats);
}

/** Hijo de una pareja: hereda parte de los stats de sus padres y el apellido del padre. */
export function createChild(rng: Rng, id: string, father: Dweller, mother: Dweller): Dweller {
  const sex: Dweller['sex'] = rng() < 0.5 ? 'M' : 'F';
  const stats = Object.fromEntries(
    PATRON_KEYS.map((k) => [k, clampStat((father.stats[k] + mother.stats[k]) / 4 + randomInt(rng, 0, 2))]),
  ) as PatronStats;
  const surname = father.name.split(' ').slice(1).join(' ') || pick(rng, SURNAMES);
  const child = baseDweller(id, `${pick(rng, sex === 'M' ? NAMES_M : NAMES_F)} ${surname}`, sex, stats);
  return { ...child, parents: [father.id, mother.id], childTime: CHILDHOOD_SECONDS, happiness: 75 };
}

/** Población inicial equilibrada en sexos (necesario para la reproducción). */
export function generateDwellers(rng: Rng, count: number, firstId: number) {
  const dwellers: Record<string, Dweller> = {};
  let nextId = firstId;
  for (let i = 0; i < count; i++) {
    const id = `dweller-${nextId++}`;
    dwellers[id] = createDweller(rng, id, i % 2 === 0 ? 'M' : 'F');
  }
  return { dwellers, nextId };
}

export const isAdult = (d: Dweller) => d.childTime <= 0;

/** Padres/hijos o hermanos (comparten algún progenitor). */
export function areRelated(a: Dweller, b: Dweller): boolean {
  if (a.parents?.includes(b.id) || b.parents?.includes(a.id)) return true;
  return !!a.parents && !!b.parents && a.parents.some((p) => b.parents!.includes(p));
}

/** HP máximo menos la intoxicación (barra roja). */
export function effectiveMaxHp(d: Dweller): number {
  return Math.max(0, d.maxHp - d.intox);
}

/** XP necesaria para pasar del nivel actual al siguiente (Infinity en el máximo). */
export function xpToNextLevel(level: number): number {
  if (level >= MAX_DWELLER_LEVEL) return Infinity;
  return Math.round(XP_LEVEL_BASE * level ** XP_LEVEL_EXP);
}

/** El stat más alto del habitante (para saber si está en su "sala adecuada"). */
export function bestStatValue(d: Dweller): number {
  return Math.max(...PATRON_KEYS.map((k) => d.stats[k]));
}

export function dwellersInRoom(data: Pick<GameData, 'dwellers'>, roomId: string): Dweller[] {
  return Object.values(data.dwellers).filter((d) => d.alive && d.roomId === roomId);
}

export function livingCount(data: Pick<GameData, 'dwellers'>): number {
  return Object.values(data.dwellers).filter((d) => d.alive).length;
}

/** Población máxima según Salas de Descanso y Barracones (tope absoluto de 200). */
export function populationCap(grid: GridState): number {
  let cap = POPULATION_BASE;
  for (const room of Object.values(grid.rooms)) {
    const perBlock =
      room.type === 'living' ? POPULATION_PER_LIVING_BLOCK : room.type === 'barracks' ? POPULATION_PER_BARRACKS_BLOCK : 0;
    cap += perBlock * room.blocks * LEVEL_EFFICIENCY[room.level];
  }
  return Math.min(POPULATION_HARD_CAP, Math.floor(cap));
}

/** Media de felicidad de los adultos vivos, de 0 a 1. */
export function globalHappiness(data: Pick<GameData, 'dwellers'>): number {
  const adults = Object.values(data.dwellers).filter((d) => d.alive && isAdult(d));
  if (adults.length === 0) return 0.5;
  return adults.reduce((sum, d) => sum + d.happiness, 0) / adults.length / 100;
}

/** Asigna a una sala, o la deja sin asignar si roomId es null. */
export function assignDweller(data: GameData, dwellerId: string, roomId: string | null): Result<GameData> {
  const dweller = data.dwellers[dwellerId];
  if (!dweller) return fail('El habitante no existe.');
  if (!dweller.alive) return fail(`${dweller.name} ya no está con nosotros.`);
  if (dweller.location !== 'bunker') return fail(`${dweller.name} está fuera del búnker.`);
  if (dweller.roomId === roomId) return ok(data);

  if (roomId !== null) {
    if (!isAdult(dweller)) return fail(`${dweller.name} es un niño: aún no puede trabajar.`);
    const room = data.grid.rooms[roomId];
    if (!room) return fail('La sala no existe.');
    const capacity = roomCapacity(room);
    if (capacity === 0) return fail(`Nadie puede trabajar en ${ROOM_DEFS[room.type].name}.`);
    if (dwellersInRoom(data, roomId).length >= capacity) return fail('La sala está llena.');
    if (dweller.pregnancy && data.runtime[roomId]?.incident) {
      return fail(`${dweller.name} está embarazada y no entrará a una sala con un incidente.`);
    }
  }
  // Cambiar de sala interrumpe un cortejo y un entrenamiento en curso.
  return ok({ ...data, dwellers: { ...data.dwellers, [dwellerId]: { ...dweller, roomId, courtship: null, training: 0 } } });

}
