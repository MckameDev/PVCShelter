import { SCRAP_YIELD, STARTING_INVENTORY } from './config';
import { isAdult } from './Dwellers';
import { itemCapacity } from './Economy';
import { ITEMS, KIND_NAMES } from './items';
import { fail, ok } from './types';
import type { GameData, Inventory, Item, ItemKind, Rarity, Result } from './types';

// Inventario de objetos: alta de objetos, equipar/quitar y desguace.

export function createStartingInventory(): Inventory {
  const items: Record<string, Item> = {};
  let nextItemId = 1;
  for (const defId of STARTING_INVENTORY.items) {
    const id = `item-${nextItemId++}`;
    items[id] = { id, defId };
  }
  return { items, junk: { ...STARTING_INVENTORY.junk }, recipes: [...STARTING_INVENTORY.recipes], nextItemId };
}

export function freeSlots(data: GameData): number {
  return itemCapacity(data.grid) - Object.keys(data.inventory.items).length;
}

/** Añade un objeto nuevo del catálogo al inventario, si hay sitio. */
export function addItem(data: GameData, defId: string): Result<{ data: GameData; item: Item }> {
  if (!ITEMS[defId]) return fail('Ese objeto no existe.');
  if (freeSlots(data) <= 0) return fail('El inventario está lleno: construye o mejora un Almacén, o desguaza algo.');
  const item: Item = { id: `item-${data.inventory.nextItemId}`, defId };
  const inventory: Inventory = {
    ...data.inventory,
    items: { ...data.inventory.items, [item.id]: item },
    nextItemId: data.inventory.nextItemId + 1,
  };
  return ok({ data: { ...data, inventory }, item });
}

/** Equipa un objeto del inventario; si la ranura estaba ocupada, ese objeto vuelve al inventario. */
export function equipItem(data: GameData, dwellerId: string, itemId: string): Result<GameData> {
  const dweller = data.dwellers[dwellerId];
  const item = data.inventory.items[itemId];
  if (!dweller || !dweller.alive) return fail('El habitante no está disponible.');
  if (!isAdult(dweller)) return fail('Los niños no pueden equiparse.');
  if (!item) return fail('El objeto no está en el inventario.');

  const slot: ItemKind = ITEMS[item.defId].kind;
  const items = { ...data.inventory.items };
  delete items[itemId];
  const previous = dweller.equipment[slot];
  if (previous) items[previous.id] = previous;

  return ok({
    ...data,
    inventory: { ...data.inventory, items },
    dwellers: { ...data.dwellers, [dwellerId]: { ...dweller, equipment: { ...dweller.equipment, [slot]: item } } },
  });
}

export function unequipItem(data: GameData, dwellerId: string, slot: ItemKind): Result<GameData> {
  const dweller = data.dwellers[dwellerId];
  if (!dweller) return fail('El habitante no existe.');
  const item = dweller.equipment[slot];
  if (!item) return fail(`No tiene ${KIND_NAMES[slot].toLowerCase()} equipada.`);
  if (freeSlots(data) <= 0) return fail('El inventario está lleno.');
  return ok({
    ...data,
    inventory: { ...data.inventory, items: { ...data.inventory.items, [item.id]: item } },
    dwellers: { ...data.dwellers, [dwellerId]: { ...dweller, equipment: { ...dweller.equipment, [slot]: null } } },
  });
}

/** Desguaza un arma o atuendo del inventario y devuelve la chatarra obtenida. */
export function scrapItem(data: GameData, itemId: string): Result<{ data: GameData; junk: Partial<Record<Rarity, number>> }> {
  const item = data.inventory.items[itemId];
  if (!item) return fail('El objeto no está en el inventario.');
  const def = ITEMS[item.defId];
  if (def.kind === 'pet') return fail('Las mascotas no se desguazan.');

  const gained = SCRAP_YIELD[def.rarity];
  const junk = { ...data.inventory.junk };
  for (const [rarity, amount] of Object.entries(gained) as [Rarity, number][]) junk[rarity] += amount;
  const items = { ...data.inventory.items };
  delete items[itemId];
  return ok({ data: { ...data, inventory: { ...data.inventory, items, junk } }, junk: gained });
}
