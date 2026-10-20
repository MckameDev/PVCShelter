import { createDweller, livingCount, PATRON_KEYS, populationCap } from './Dwellers';
import { storageCap } from './Economy';
import { ITEMS } from './items';
import { applyLoot, emptyLoot } from './Loot';
import { randomInt } from './random';
import { fail, ok } from './types';
import type { BoxKind, Dweller, GameData, Item, MedResource, PatronStats, Rarity, Result, Rng, VitalResource } from './types';

// Cajas de Herramientas: 5 cartas aleatorias. Las raras traen SIEMPRE una
// mascota y son la única forma de conseguirlas; las comunes nunca la traen.

export type Card =
  | { kind: 'codos'; amount: number; note?: string }
  | { kind: 'cinta'; amount: number }
  | { kind: 'resource'; resource: VitalResource; amount: number }
  | { kind: 'med'; med: MedResource; amount: number }
  | { kind: 'junk'; rarity: Rarity; amount: number }
  | { kind: 'item'; defId: string }
  | { kind: 'pet'; defId: string }
  | { kind: 'dweller'; dwellerId: string; name: string; rarity: 'rare' | 'legendary' };

export const CARDS_PER_BOX = 5;
/** Codos que se dan en lugar de un habitante si la población está llena. */
const DWELLER_FALLBACK_CODOS = 500;

type CardKind = Card['kind'];
const WEIGHTS: Record<BoxKind, Partial<Record<CardKind, number>>> = {
  common: { codos: 30, resource: 22, med: 15, junk: 15, item: 15, dweller: 3 },
  rare: { codos: 20, resource: 10, med: 15, junk: 15, item: 30, dweller: 8, cinta: 2 },
};
const ITEM_RARITY: Record<BoxKind, Record<Rarity, number>> = {
  common: { common: 70, rare: 25, legendary: 5 },
  rare: { common: 30, rare: 50, legendary: 20 },
};
const LEGENDARY_NAMES = ['Pili la Fontanera', 'Don Teflón', 'Abuela Silicona', 'El Gran Codo', 'Capitana Manguera', 'Rulo el Soldador'];

function weighted<K extends string>(rng: Rng, weights: Partial<Record<K, number>>): K {
  const entries = Object.entries(weights) as [K, number][];
  let roll = rng() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [key, w] of entries) {
    if ((roll -= w) < 0) return key;
  }
  return entries[entries.length - 1][0];
}

const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)];

/** Habitante especial: raro (stats 3-6) o legendario (6-9, con una especialidad a 10). */
function specialDweller(rng: Rng, id: string, rarity: 'rare' | 'legendary'): Dweller {
  const base = createDweller(rng, id);
  const [min, max] = rarity === 'legendary' ? [6, 9] : [3, 6];
  const stats = Object.fromEntries(PATRON_KEYS.map((k) => [k, randomInt(rng, min, max)])) as PatronStats;
  stats[pick(rng, PATRON_KEYS)] = rarity === 'legendary' ? 10 : 8;
  const name = rarity === 'legendary' ? pick(rng, LEGENDARY_NAMES) : base.name;
  return { ...base, name, stats, happiness: 80 };
}

/** Abre una caja: descuenta la caja, genera 5 cartas y aplica su contenido. */
export function openBox(data: GameData, kind: BoxKind, rng: Rng): Result<{ data: GameData; cards: Card[] }> {
  if (data.boxes[kind] < 1) return fail('No tienes cajas de ese tipo.');

  const cards: Card[] = [];
  const resources = { ...data.resources };
  const dwellers = { ...data.dwellers };
  let nextDwellerId = data.nextDwellerId;
  const loot = emptyLoot();
  const pets: Item[] = [];
  let nextItemId = data.inventory.nextItemId;
  let population = livingCount(data);
  const cap = populationCap(data.grid);

  const kinds: CardKind[] = [];
  if (kind === 'rare') kinds.push('pet');
  while (kinds.length < CARDS_PER_BOX) kinds.push(weighted(rng, WEIGHTS[kind]));

  for (const cardKind of kinds) {
    switch (cardKind) {
      case 'codos': {
        const amount = kind === 'rare' ? randomInt(rng, 200, 800) : randomInt(rng, 50, 300);
        resources.codos += amount;
        cards.push({ kind: 'codos', amount });
        break;
      }
      case 'cinta': {
        const amount = randomInt(rng, 1, 3);
        resources.cinta += amount;
        cards.push({ kind: 'cinta', amount });
        break;
      }
      case 'resource': {
        const resource = pick(rng, ['energy', 'food', 'water'] as const);
        const amount = randomInt(rng, 50, 150);
        resources[resource] = Math.min(storageCap(data.grid, resource), resources[resource] + amount);
        cards.push({ kind: 'resource', resource, amount });
        break;
      }
      case 'med': {
        const med = pick(rng, ['stimpaks', 'radaways'] as const);
        const amount = randomInt(rng, 1, 3);
        resources[med] = Math.min(storageCap(data.grid, med), resources[med] + amount);
        cards.push({ kind: 'med', med, amount });
        break;
      }
      case 'junk': {
        const rarity: Rarity = kind === 'rare' ? (rng() < 0.25 ? 'legendary' : 'rare') : rng() < 0.3 ? 'rare' : 'common';
        const amount = rarity === 'legendary' ? 1 : randomInt(rng, 2, 4);
        loot.junk[rarity] += amount;
        cards.push({ kind: 'junk', rarity, amount });
        break;
      }
      case 'item': {
        const rarity = weighted(rng, ITEM_RARITY[kind]);
        const options = Object.values(ITEMS).filter((i) => i.kind !== 'pet' && i.rarity === rarity);
        const def = pick(rng, options);
        loot.items.push(def.id);
        cards.push({ kind: 'item', defId: def.id });
        break;
      }
      case 'pet': {
        const def = pick(
          rng,
          Object.values(ITEMS).filter((i) => i.kind === 'pet'),
        );
        pets.push({ id: `item-${nextItemId++}`, defId: def.id });
        cards.push({ kind: 'pet', defId: def.id });
        break;
      }
      case 'dweller': {
        if (population >= cap) {
          resources.codos += DWELLER_FALLBACK_CODOS;
          cards.push({ kind: 'codos', amount: DWELLER_FALLBACK_CODOS, note: 'Un habitante quería unirse, pero no hay sitio.' });
          break;
        }
        const rarity = kind === 'rare' && rng() < 0.35 ? 'legendary' : 'rare';
        const id = `dweller-${nextDwellerId++}`;
        const dweller = specialDweller(rng, id, rarity);
        dwellers[id] = dweller;
        population++;
        cards.push({ kind: 'dweller', dwellerId: id, name: dweller.name, rarity });
        break;
      }
    }
  }

  // Las mascotas no ocupan plaza obligatoria: siempre entran (son el premio de la caja rara).
  let next: GameData = {
    ...data,
    resources,
    dwellers,
    nextDwellerId,
    boxes: { ...data.boxes, [kind]: data.boxes[kind] - 1 },
    inventory: { ...data.inventory, nextItemId, items: { ...data.inventory.items, ...Object.fromEntries(pets.map((p) => [p.id, p])) } },
  };
  // Armas/atuendos y chatarra: si el inventario está lleno, los objetos se desguazan.
  next = applyLoot(next, loot).data;
  return ok({ data: next, cards });
}
