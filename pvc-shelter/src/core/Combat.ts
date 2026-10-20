import { DWELLER_BASE_DPS, DWELLER_DPS_PER_P, INCIDENT_DEFS } from './config';
import { isAdult } from './Dwellers';
import { effectiveStat, petBonus, weaponDamage } from './Equipment';
import type { Dweller, Enemy, Incident, IncidentKind, Rng, Room } from './types';

// Reglas de combate compartidas por incidentes y asaltos.

/** Daño por segundo de un habitante: base + Poderío + arma, potenciado por mascotas de combate. */
export function dwellerDps(d: Dweller): number {
  return (DWELLER_BASE_DPS + effectiveStat(d, 'P') * DWELLER_DPS_PER_P + weaponDamage(d)) * (1 + petBonus(d, 'damage'));
}

/** Quién pelea: adultos vivos que no estén embarazadas (ellas huyen). */
export const canFight = (d: Dweller) => d.alive && isAdult(d) && !d.pregnancy;

/** Reparte `total` de daño a partes iguales entre los defensores (acumula en `damage`). */
export function splitDamage(defenders: Dweller[], total: number, damage: Map<string, number>): void {
  if (defenders.length === 0) return;
  const share = total / defenders.length;
  for (const d of defenders) damage.set(d.id, (damage.get(d.id) ?? 0) + share);
}

/** Aplica daño concentrando el fuego en el primer enemigo vivo; el sobrante pasa al siguiente. */
export function damageEnemies(enemies: Enemy[], amount: number): Enemy[] {
  let left = amount;
  return enemies.map((e) => {
    if (e.hp <= 0 || left <= 0) return e;
    const dealt = Math.min(e.hp, left);
    left -= dealt;
    return { ...e, hp: e.hp - dealt };
  });
}

export const aliveEnemies = (enemies: Enemy[]) => enemies.filter((e) => e.hp > 0);

export function createIncident(kind: IncidentKind, room: Room): Incident {
  const hp = INCIDENT_DEFS[kind].hpPerBlock * room.blocks;
  return { kind, hp, maxHp: hp, spread: 0 };
}

/** Elige un tipo de incidente posible para la sala (los topos solo en pisos hondos). */
export function pickIncidentKind(rng: Rng, room: Room): IncidentKind {
  const kinds = (Object.keys(INCIDENT_DEFS) as IncidentKind[]).filter((k) => room.floor >= INCIDENT_DEFS[k].minFloor);
  return kinds[Math.floor(rng() * kinds.length)];
}
