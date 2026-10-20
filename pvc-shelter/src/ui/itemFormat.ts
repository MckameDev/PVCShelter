import { RARITY_NAMES } from '../core/items';
import type { Rarity } from '../core/types';

/** Color de texto por rareza. */
export const RARITY_CLASS: Record<Rarity, string> = {
  common: 'text-pvc',
  rare: 'text-sky-300',
  legendary: 'text-amber-300',
};

/** Formatea un costo de chatarra: "3 común, 2 rara". */
export function junkText(junk: Partial<Record<Rarity, number>>): string {
  return (Object.entries(junk) as [Rarity, number][])
    .map(([r, n]) => `${n} ${RARITY_NAMES[r].toLowerCase()}`)
    .join(', ');
}
