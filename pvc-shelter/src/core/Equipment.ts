import { ITEMS } from './items';
import type { Dweller, PatronStat, PetBonus } from './types';

// Efectos del equipo sobre un habitante. Sin dependencias de otros módulos de
// juego para que producción, combate y ciclo de vida puedan usarlos sin ciclos.

/** Stat efectivo = base (máx. 10) + bonus del atuendo (puede superar 10). */
export function effectiveStat(d: Dweller, stat: PatronStat): number {
  const outfit = d.equipment.outfit ? ITEMS[d.equipment.outfit.defId] : undefined;
  return d.stats[stat] + (outfit?.stats?.[stat] ?? 0);
}

/** Daño medio por segundo del arma equipada (0 sin arma). */
export function weaponDamage(d: Dweller): number {
  const weapon = d.equipment.weapon ? ITEMS[d.equipment.weapon.defId] : undefined;
  return weapon?.damage ? (weapon.damage[0] + weapon.damage[1]) / 2 : 0;
}

/** Bono de la mascota para un efecto concreto (0.15 = +15%), o 0. */
export function petBonus(d: Dweller, bonus: PetBonus): number {
  const pet = d.equipment.pet ? ITEMS[d.equipment.pet.defId] : undefined;
  return pet?.pet?.bonus === bonus ? pet.pet.amount : 0;
}

/** Media del bono de mascotas de un grupo (p. ej. los trabajadores de una sala). */
export function averagePetBonus(group: Dweller[], bonus: PetBonus): number {
  if (group.length === 0) return 0;
  return group.reduce((sum, d) => sum + petBonus(d, bonus), 0) / group.length;
}
