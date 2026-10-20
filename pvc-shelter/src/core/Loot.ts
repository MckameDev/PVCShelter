import { LOG_LIMIT, SCRAP_YIELD } from './config';
import { freeSlots } from './Inventory';
import { ITEMS, RARITY_NAMES } from './items';
import type { GameData, Item, LogEntry, Loot, Rarity } from './types';

// Botín traído del exterior (Yermo y misiones) y registro de eventos.

export const emptyLoot = (): Loot => ({ codos: 0, items: [], junk: { common: 0, rare: 0, legendary: 0 }, recipes: [] });

/** Añade una entrada al registro conservando solo las más recientes. */
export function pushLog(log: LogEntry[], entry: LogEntry): LogEntry[] {
  const next = [...log, entry];
  return next.length > LOG_LIMIT ? next.slice(next.length - LOG_LIMIT) : next;
}

export function lootSummary(loot: Loot): string {
  const parts: string[] = [];
  if (loot.codos > 0) parts.push(`${Math.round(loot.codos)} Codos`);
  if (loot.items.length > 0) parts.push(`${loot.items.length} objeto${loot.items.length > 1 ? 's' : ''}`);
  const junk = (Object.entries(loot.junk) as [Rarity, number][]).filter(([, n]) => n > 0);
  if (junk.length > 0) parts.push(`chatarra ${junk.map(([r, n]) => `${n} ${RARITY_NAMES[r].toLowerCase()}`).join(', ')}`);
  if (loot.recipes.length > 0) parts.push(`${loot.recipes.length} plano${loot.recipes.length > 1 ? 's' : ''}`);
  return parts.length > 0 ? parts.join(' · ') : 'nada';
}

/**
 * Entrega el botín al búnker. Los objetos que no quepan en el inventario se
 * desguazan automáticamente (se informa cuántos en `scrapped`).
 */
export function applyLoot(data: GameData, loot: Loot): { data: GameData; scrapped: number } {
  const junk = { ...data.inventory.junk };
  for (const [r, n] of Object.entries(loot.junk) as [Rarity, number][]) junk[r] += n;

  const items: Record<string, Item> = { ...data.inventory.items };
  let nextItemId = data.inventory.nextItemId;
  let slots = freeSlots(data);
  let scrapped = 0;
  for (const defId of loot.items) {
    if (slots > 0) {
      const id = `item-${nextItemId++}`;
      items[id] = { id, defId };
      slots--;
    } else {
      scrapped++;
      for (const [r, n] of Object.entries(SCRAP_YIELD[ITEMS[defId].rarity]) as [Rarity, number][]) junk[r] += n;
    }
  }
  const recipes = [...new Set([...data.inventory.recipes, ...loot.recipes])];
  return {
    data: {
      ...data,
      resources: { ...data.resources, codos: data.resources.codos + Math.round(loot.codos) },
      inventory: { ...data.inventory, items, junk, recipes, nextItemId },
    },
    scrapped,
  };
}
