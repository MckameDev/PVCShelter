import type { ItemKind, PatronStats, PetBonus, Rarity } from './types';

// Catálogo de objetos. Los planos (recetas) se refieren a estos ids.

export interface ItemDef {
  id: string;
  kind: ItemKind;
  name: string;
  rarity: Rarity;
  description: string;
  /** Armas: daño por segundo mínimo y máximo (se usa la media en combate). */
  damage?: [number, number];
  /** Atuendos: puntos que suman a los stats (pueden pasar de 10). */
  stats?: Partial<PatronStats>;
  /** Atuendos: color del mono en el canvas. */
  color?: number;
  /** Mascotas: bono pasivo (0.15 = +15%). */
  pet?: { bonus: PetBonus; amount: number };
}

export const ITEMS: Record<string, ItemDef> = {
  // --- Armas ---------------------------------------------------------------
  'lead-pipe': { id: 'lead-pipe', kind: 'weapon', name: 'Tubo de Plomo', rarity: 'common', damage: [1, 3], description: 'Un clásico. Pesa y pega.' },
  wrench: { id: 'wrench', kind: 'weapon', name: 'Llave Inglesa', rarity: 'common', damage: [2, 4], description: 'Sirve para ajustar tuercas y cuentas.' },
  'nail-gun': { id: 'nail-gun', kind: 'weapon', name: 'Pistola de Clavos', rarity: 'rare', damage: [4, 7], description: 'Dispara clavos de 3 pulgadas.' },
  'potato-cannon': { id: 'potato-cannon', kind: 'weapon', name: 'Lanzapapas de PVC', rarity: 'rare', damage: [6, 9], description: 'Tubo de 110 mm y un mechero.' },
  'pipe-crossbow': { id: 'pipe-crossbow', kind: 'weapon', name: 'Ballesta de Cañería', rarity: 'legendary', damage: [9, 14], description: 'Arco de PVC curvado al calor.' },
  'drum-bazooka': { id: 'drum-bazooka', kind: 'weapon', name: 'Bazuca de Bidón', rarity: 'legendary', damage: [13, 19], description: 'No preguntes qué lleva dentro.' },

  // --- Atuendos -----------------------------------------------------------
  'work-overall': { id: 'work-overall', kind: 'outfit', name: 'Mono Remendado', rarity: 'common', stats: { T: 1 }, color: 0x5a7a4a, description: 'Más parches que tela.' },
  'tape-vest': { id: 'tape-vest', kind: 'outfit', name: 'Chaleco de Cinta', rarity: 'common', stats: { P: 2 }, color: 0x9aa0a6, description: 'Cinta americana trenzada.' },
  'plumber-suit': { id: 'plumber-suit', kind: 'outfit', name: 'Overol de Fontanero', rarity: 'rare', stats: { P: 1, T: 1, N: 2 }, color: 0x2f5fa8, description: 'Con bolsillos para todo.' },
  'tarp-lab-coat': { id: 'tarp-lab-coat', kind: 'outfit', name: 'Bata de Lona', rarity: 'rare', stats: { A: 3, R: 1 }, color: 0xe8e8e8, description: 'Blanca de lejos.' },
  'gala-tarp': { id: 'gala-tarp', kind: 'outfit', name: 'Traje de Gala de Lona', rarity: 'legendary', stats: { O: 4, R: 2 }, color: 0x7a2f8a, description: 'Para las fiestas del búnker.' },
  'pvc-armor': { id: 'pvc-armor', kind: 'outfit', name: 'Armadura de PVC', rarity: 'legendary', stats: { P: 3, T: 3, N: 2 }, color: 0xc9ccd1, description: 'Placas de tubo aplanado.' },

  // --- Mascotas (no se fabrican) -------------------------------------------
  parrot: { id: 'parrot', kind: 'pet', name: 'Loro Reciclador', rarity: 'rare', pet: { bonus: 'production', amount: 0.15 }, description: '+15% velocidad de producción en su sala.' },
  dog: { id: 'dog', kind: 'pet', name: 'Perro Guardián', rarity: 'rare', pet: { bonus: 'damage', amount: 0.25 }, description: '+25% de daño en combate.' },
  cat: { id: 'cat', kind: 'pet', name: 'Gato de Taller', rarity: 'rare', pet: { bonus: 'xp', amount: 0.2 }, description: '+20% de experiencia.' },
  turtle: { id: 'turtle', kind: 'pet', name: 'Tortuga Paciente', rarity: 'common', pet: { bonus: 'training', amount: 0.2 }, description: '+20% velocidad de entrenamiento.' },
};

export const RARITY_NAMES: Record<Rarity, string> = { common: 'Común', rare: 'Rara', legendary: 'Legendaria' };
export const KIND_NAMES: Record<ItemKind, string> = { weapon: 'Arma', outfit: 'Atuendo', pet: 'Mascota' };

/** Resumen corto del efecto de un objeto para la UI. */
export function itemSummary(def: ItemDef): string {
  if (def.damage) return `Daño ${def.damage[0]}-${def.damage[1]}`;
  if (def.stats) {
    return Object.entries(def.stats)
      .map(([k, v]) => `+${v} ${k}`)
      .join(' ');
  }
  if (def.pet) return def.description;
  return '';
}
