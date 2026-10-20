import {
  COURTSHIP_SECONDS,
  HAPPINESS_RATE,
  LEVEL_UP_CODOS,
  LEVEL_UP_HP_BASE,
  LEVEL_UP_HP_PER_T,
  MAX_DWELLER_LEVEL,
  PREGNANCY_SECONDS,
  REFERENCE_STAT,
  ROOM_DEFS,
} from './config';
import { areRelated, bestStatValue, createChild, isAdult, xpToNextLevel } from './Dwellers';
import { createRng } from './random';
import type { Dweller, GridState, Room, RoomRuntime } from './types';

// Ciclo de vida de los habitantes dentro de un tick: niveles, felicidad,
// cortejo, embarazo, nacimiento y niñez. Estas funciones MUTAN las copias de
// habitantes que `simulate` crea al inicio de cada tick (nunca el estado previo).

export type LifeEvent =
  | { type: 'level-up'; name: string; level: number; codos: number }
  | { type: 'conceived'; mother: string; father: string }
  | { type: 'birth'; mother: string; child: string }
  | { type: 'grew-up'; name: string }
  | { type: 'fled'; name: string };

/** Sube de nivel mientras alcance la XP. Devuelve los Codos ganados. */
export function applyLevelUps(d: Dweller, events: LifeEvent[]): number {
  let codos = 0;
  while (d.level < MAX_DWELLER_LEVEL && d.xp >= xpToNextLevel(d.level)) {
    d.xp -= xpToNextLevel(d.level);
    d.level += 1;
    d.maxHp += LEVEL_UP_HP_BASE + d.stats.T * LEVEL_UP_HP_PER_T;
    d.hp = d.maxHp - d.intox; // subir de nivel cura, como en Fallout Shelter
    const reward = d.level * LEVEL_UP_CODOS;
    codos += reward;
    events.push({ type: 'level-up', name: d.name, level: d.level, codos: reward });
  }
  if (d.level >= MAX_DWELLER_LEVEL) d.xp = 0;
  return codos;
}

interface HappinessContext {
  room: Room | undefined;
  runtime: RoomRuntime | undefined;
  foodShortage: boolean;
  waterShortage: boolean;
}

/** Felicidad hacia la que tiende un habitante según su situación. */
export function happinessTarget(d: Dweller, ctx: HappinessContext): number {
  if (!isAdult(d)) return 75;
  let target = 50;
  if (ctx.room) {
    const stat = ROOM_DEFS[ctx.room.type].stat;
    if (stat && d.stats[stat] >= bestStatValue(d)) target += 30; // su "sala adecuada"
    else target += 10;
    if (ctx.runtime && !ctx.runtime.powered) target -= 15;
    if (ctx.runtime?.incident) target -= 25;
  } else {
    target -= 15; // sin ocupación
  }
  if (ctx.foodShortage) target -= 25;
  if (ctx.waterShortage) target -= 25;
  target -= (1 - d.hp / d.maxHp) * 30;
  return Math.min(100, Math.max(0, target));
}

export function updateHappiness(d: Dweller, target: number, dt: number): void {
  const step = HAPPINESS_RATE * dt;
  d.happiness = d.happiness < target ? Math.min(target, d.happiness + step) : Math.max(target, d.happiness - step);
}

/**
 * Cortejo en una Sala de Descanso: empareja hombres y mujeres adultos, no
 * embarazadas y sin parentesco. La velocidad depende del Optimismo (O) de ambos.
 */
export function updateCourtship(occupants: Dweller[], dt: number, events: LifeEvent[]): void {
  const adults = occupants.filter((d) => d.alive && isAdult(d));
  const men = adults.filter((d) => d.sex === 'M');
  const women = adults.filter((d) => d.sex === 'F' && !d.pregnancy);
  const taken = new Set<string>();

  for (const woman of women) {
    // Mantener la pareja actual si sigue en la sala; si no, buscar otra.
    let partner = men.find((m) => m.id === woman.courtship?.partnerId && !taken.has(m.id));
    if (!partner) {
      partner = men.find((m) => !taken.has(m.id) && !areRelated(m, woman));
      woman.courtship = partner ? { partnerId: partner.id, progress: 0 } : null;
    }
    if (!partner || !woman.courtship) continue;
    taken.add(partner.id);

    const speed = (partner.stats.O + woman.stats.O) / (2 * REFERENCE_STAT);
    woman.courtship = { ...woman.courtship, progress: woman.courtship.progress + speed * dt };
    if (woman.courtship.progress >= COURTSHIP_SECONDS) {
      woman.courtship = null;
      woman.pregnancy = { fatherId: partner.id, elapsed: 0 };
      events.push({ type: 'conceived', mother: woman.name, father: partner.name });
    }
  }
}

/**
 * Avanza embarazos y niñez. Los nacimientos esperan si la población está al
 * máximo. Devuelve el siguiente id libre de habitante.
 */
export function updatePregnanciesAndGrowth(
  dwellers: Record<string, Dweller>,
  grid: GridState,
  populationCap: number,
  nextDwellerId: number,
  dt: number,
  events: LifeEvent[],
): number {
  let nextId = nextDwellerId;
  let population = Object.values(dwellers).filter((d) => d.alive).length;

  for (const d of Object.values(dwellers)) {
    if (!d.alive) continue;

    if (d.childTime > 0) {
      d.childTime = Math.max(0, d.childTime - dt);
      if (d.childTime === 0) events.push({ type: 'grew-up', name: d.name });
    }

    if (!d.pregnancy) continue;
    const elapsed = Math.min(PREGNANCY_SECONDS, d.pregnancy.elapsed + dt);
    d.pregnancy = { ...d.pregnancy, elapsed };
    if (elapsed < PREGNANCY_SECONDS || population >= populationCap) continue;

    const father = dwellers[d.pregnancy.fatherId] ?? d;
    // RNG derivado del estado: el nacimiento es reproducible con el mismo estado.
    const rng = createRng((grid.seed ^ Math.imul(nextId, 2654435761)) >>> 0);
    const id = `dweller-${nextId++}`;
    const child = createChild(rng, id, father, d);
    dwellers[id] = child;
    population++;
    d.pregnancy = null;
    events.push({ type: 'birth', mother: d.name, child: child.name });
  }
  return nextId;
}
