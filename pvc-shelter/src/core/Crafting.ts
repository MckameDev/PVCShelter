import { CRAFT_COSTS, MIN_CYCLE_FACTOR, REFERENCE_STAT, ROOM_DEFS } from './config';
import { roomCapacity } from './Economy';
import { effectiveStat } from './Equipment';
import { addItem } from './Inventory';
import { ITEMS } from './items';
import type { ItemDef } from './items';
import { getRuntime } from './Production';
import { fail, ok } from './types';
import type { Dweller, GameData, Item, ItemKind, Rarity, Result, Room, RoomType } from './types';

// Fabricación en talleres: plano conocido + chatarra + Codos -> objeto tras un tiempo.

export const WORKSHOP_KIND: Partial<Record<RoomType, ItemKind>> = {
  'weapon-workshop': 'weapon',
  'outfit-workshop': 'outfit',
};

export function craftCost(def: ItemDef) {
  return CRAFT_COSTS[def.rarity];
}

/** Segundos de fabricación con los trabajadores actuales, o null si no hay nadie. */
export function craftTime(room: Room, defId: string, workers: Dweller[]): number | null {
  const stat = ROOM_DEFS[room.type].stat;
  if (!stat || workers.length === 0) return null;
  const sum = workers.reduce((s, w) => s + effectiveStat(w, stat), 0);
  if (sum <= 0) return null;
  const base = craftCost(ITEMS[defId]).seconds;
  return Math.max((base * roomCapacity(room) * REFERENCE_STAT) / sum, base * MIN_CYCLE_FACTOR);
}

/** Planos conocidos que se fabrican en este taller. */
export function workshopRecipes(data: GameData, room: Room): ItemDef[] {
  const kind = WORKSHOP_KIND[room.type];
  return data.inventory.recipes.map((id) => ITEMS[id]).filter((def) => def && def.kind === kind);
}

export function canStartCraft(data: GameData, roomId: string, defId: string): Result<ItemDef> {
  const room = data.grid.rooms[roomId];
  const def = ITEMS[defId];
  if (!room || !def) return fail('Taller u objeto no válido.');
  const kind = WORKSHOP_KIND[room.type];
  if (!kind) return fail('Esta sala no es un taller.');
  if (def.kind !== kind) return fail(`${def.name} no se fabrica en este taller.`);
  if (!data.inventory.recipes.includes(defId)) return fail(`Aún no conoces el plano de ${def.name}.`);
  const rt = getRuntime(data, roomId);
  if (rt.craft) return fail('El taller ya está fabricando algo.');
  if (rt.incident) return fail('Hay un incidente en el taller.');

  const cost = craftCost(def);
  if (data.resources.codos < cost.codos) return fail(`Faltan Codos de PVC (necesitas ${cost.codos}).`);
  for (const [rarity, amount] of Object.entries(cost.junk) as [Rarity, number][]) {
    if (data.inventory.junk[rarity] < amount) return fail('No tienes suficiente chatarra.');
  }
  return ok(def);
}

/** Paga materiales y empieza a fabricar. El progreso lo avanza la simulación. */
export function startCraft(data: GameData, roomId: string, defId: string): Result<GameData> {
  const check = canStartCraft(data, roomId, defId);
  if (!check.ok) return check;
  const cost = craftCost(check.value);
  const junk = { ...data.inventory.junk };
  for (const [rarity, amount] of Object.entries(cost.junk) as [Rarity, number][]) junk[rarity] -= amount;
  return ok({
    ...data,
    resources: { ...data.resources, codos: data.resources.codos - cost.codos },
    inventory: { ...data.inventory, junk },
    runtime: { ...data.runtime, [roomId]: { ...getRuntime(data, roomId), craft: { defId, progress: 0 }, ready: false } },
  });
}

/** Recoge el objeto terminado (necesita sitio en el inventario). */
export function collectCraft(data: GameData, roomId: string): Result<{ data: GameData; item: Item }> {
  const rt = getRuntime(data, roomId);
  if (!rt.craft || !rt.ready) return fail('No hay nada terminado en este taller.');
  const added = addItem(data, rt.craft.defId);
  if (!added.ok) return added;
  const next = added.value.data;
  return ok({
    data: { ...next, runtime: { ...next.runtime, [roomId]: { ...rt, craft: null, ready: false } } },
    item: added.value.item,
  });
}
