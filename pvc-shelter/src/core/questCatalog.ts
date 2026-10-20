import type { LootSpot } from './types';

// Catálogo de misiones de la Oficina del Capataz. Cada misión es un edificio
// que se recorre sala por sala; algunas salas tienen enemigos y/o botín.

export interface QuestRoomDef {
  name: string;
  enemies?: { name: string; hp: number; dps: number }[];
  spots?: Omit<LootSpot, 'id'>[];
}

export interface QuestDef {
  id: string;
  name: string;
  description: string;
  /** Segundos de viaje de ida (la vuelta tarda lo mismo). */
  travelSeconds: number;
  recommendedLevel: number;
  /** Codos por completar la misión. */
  rewardCodos: number;
  rooms: QuestRoomDef[];
}

const rats = (n: number, hp = 25) => Array.from({ length: n }, () => ({ name: 'Rata mutante', hp, dps: 2 }));
const raiders = (n: number, hp = 40) => Array.from({ length: n }, () => ({ name: 'Saqueador', hp, dps: 3 }));
const dogs = (n: number) => Array.from({ length: n }, () => ({ name: 'Perro salvaje', hp: 25, dps: 3 }));
const mutants = (n: number, hp = 85) => Array.from({ length: n }, () => ({ name: 'Mutante', hp, dps: 5 }));

export const QUESTS: QuestDef[] = [
  {
    id: 'hardware-store',
    name: 'Ferretería Abandonada',
    description: 'Una ferretería saqueada a medias. Dicen que el encargado guardaba planos en la oficina.',
    travelSeconds: 60,
    recommendedLevel: 1,
    rewardCodos: 150,
    rooms: [
      { name: 'Entrada con persiana rota', enemies: rats(2), spots: [{ label: 'Caja registradora', codos: 40 }] },
      { name: 'Pasillo de tornillería', spots: [{ label: 'Cajón de tornillos', junk: { common: 3 } }] },
      { name: 'Almacén trasero', enemies: raiders(2), spots: [{ label: 'Llave inglesa oxidada', item: 'wrench' }] },
      {
        name: 'Oficina del encargado',
        enemies: [{ name: 'Jefe saqueador', hp: 70, dps: 4 }],
        spots: [
          { label: 'Plano enrollado', recipe: 'potato-cannon' },
          { label: 'Caja fuerte', codos: 120 },
        ],
      },
    ],
  },
  {
    id: 'landfill',
    name: 'Vertedero Municipal',
    description: 'Montañas de basura, perros hambrientos y alguna joya entre los desechos.',
    travelSeconds: 120,
    recommendedLevel: 3,
    rewardCodos: 300,
    rooms: [
      { name: 'Montaña de bolsas', enemies: dogs(3), spots: [{ label: 'Chatarra brillante', junk: { common: 4, rare: 1 } }] },
      { name: 'Grúa abandonada', spots: [{ label: 'Caja de herramientas', item: 'nail-gun' }] },
      { name: 'Fosa de neumáticos', enemies: rats(3, 30) },
      {
        name: 'Caseta del guarda',
        enemies: raiders(2, 45),
        spots: [
          { label: 'Plano de bata', recipe: 'tarp-lab-coat' },
          { label: 'Hucha', codos: 150 },
        ],
      },
      { name: 'Compactadora', enemies: [{ name: 'Perro alfa', hp: 90, dps: 5 }], spots: [{ label: 'Chatarra rara', junk: { rare: 3 } }] },
    ],
  },
  {
    id: 'treatment-plant',
    name: 'Planta de Tratamiento',
    description: 'La vieja depuradora de la ciudad. Mutantes, lodo y los mejores planos del Yermo.',
    travelSeconds: 180,
    recommendedLevel: 6,
    rewardCodos: 600,
    rooms: [
      { name: 'Compuerta', enemies: mutants(2) },
      { name: 'Sala de bombas', spots: [{ label: 'Válvulas de latón', junk: { common: 3, rare: 2 } }] },
      {
        name: 'Tanques de lodo',
        enemies: [
          { name: 'Topo gigante', hp: 90, dps: 4 },
          { name: 'Topo gigante', hp: 90, dps: 4 },
        ],
        spots: [{ label: 'Overol abandonado', item: 'plumber-suit' }],
      },
      { name: 'Laboratorio', spots: [{ label: 'Plano de armadura', recipe: 'pvc-armor' }] },
      { name: 'Control central', enemies: mutants(2, 90), spots: [{ label: 'Caja de seguridad', codos: 300 }] },
      {
        name: 'Depósito del jefe',
        enemies: [{ name: 'Mutante colosal', hp: 220, dps: 8 }],
        spots: [
          { label: 'Plano legendario', recipe: 'pipe-crossbow' },
          { label: 'Chatarra legendaria', junk: { legendary: 2 } },
        ],
      },
    ],
  },
];

export const questById = (id: string) => QUESTS.find((q) => q.id === id);
