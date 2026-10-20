import { REVIVE_COST_BASE, REVIVE_COST_PER_LEVEL } from './config';
import { livingCount, populationCap } from './Dwellers';
import { freeSlots } from './Inventory';
import { fail, ok } from './types';
import type { Dweller, GameData, Item, Result } from './types';

// Muerte y resurrección: revivir pagando Codos o expulsar definitivamente.

export function reviveCost(d: Dweller): number {
  return REVIVE_COST_BASE + d.level * REVIVE_COST_PER_LEVEL;
}

export function canRevive(data: GameData, dwellerId: string): Result<number> {
  const d = data.dwellers[dwellerId];
  if (!d) return fail('El habitante no existe.');
  if (d.alive) return fail(`${d.name} está vivo.`);
  if (livingCount(data) >= populationCap(data.grid)) return fail('No hay sitio: la población está al máximo.');
  const cost = reviveCost(d);
  if (data.resources.codos < cost) return fail(`Faltan Codos de PVC (necesitas ${cost}).`);
  return ok(cost);
}

/** Revive con la salud completa y sin intoxicación; conserva su equipo. */
export function reviveDweller(data: GameData, dwellerId: string): Result<GameData> {
  const check = canRevive(data, dwellerId);
  if (!check.ok) return check;
  const d = data.dwellers[dwellerId];
  return ok({
    ...data,
    resources: { ...data.resources, codos: data.resources.codos - check.value },
    dwellers: { ...data.dwellers, [dwellerId]: { ...d, alive: true, hp: d.maxHp, intox: 0, roomId: null } },
  });
}

/**
 * Expulsa a un habitante fallecido. Su equipo vuelve al inventario mientras
 * haya sitio; lo que no quepa se pierde (se informa en `lost`).
 */
export function expelDweller(data: GameData, dwellerId: string): Result<{ data: GameData; lost: number }> {
  const d = data.dwellers[dwellerId];
  if (!d) return fail('El habitante no existe.');
  if (d.alive) return fail('Solo se puede expulsar a habitantes fallecidos.');

  const gear = Object.values(d.equipment).filter((i): i is Item => i !== null);
  let slots = freeSlots(data);
  const items = { ...data.inventory.items };
  let lost = 0;
  for (const item of gear) {
    if (slots > 0) {
      items[item.id] = item;
      slots--;
    } else {
      lost++;
    }
  }
  const dwellers = { ...data.dwellers };
  delete dwellers[dwellerId];
  return ok({ data: { ...data, dwellers, inventory: { ...data.inventory, items } }, lost });
}
