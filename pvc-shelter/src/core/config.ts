import type { PatronStat, RoomBlocks, RoomLevel, RoomType } from './types';

// Dimensiones del subsuelo (en celdas). Una sala simple ocupa BLOCK_CELLS celdas;
// un ascensor ocupa 1.
export const GRID_FLOORS = 25;
export const GRID_COLS = 26;
export const BLOCK_CELLS = 3;
export const MAX_ROOM_LEVEL: RoomLevel = 3;
export const MAX_MERGE_BLOCKS: RoomBlocks = 3;

/** Habitantes por bloque (Sprint 3: 1 bloque = 2, 2 = 4, 3 = 6). */
export const DWELLERS_PER_BLOCK = 2;

/** Multiplicador de producción por tamaño: fusionar rinde más que salas sueltas. */
export const MERGE_EFFICIENCY: Record<RoomBlocks, number> = { 1: 1, 2: 2.2, 3: 3.5 };
export const LEVEL_EFFICIENCY: Record<RoomLevel, number> = { 1: 1, 2: 1.5, 3: 2 };

export const STARTING_RESOURCES = { codos: 3000, cinta: 5 };

/** Pisos libres de rocas bajo la superficie. */
export const ROCK_FREE_FLOORS = 2;

export interface RoomDef {
  type: RoomType;
  name: string;
  description: string;
  /** Ancho de un bloque en celdas. */
  cellsPerBlock: number;
  buildable: boolean;
  demolishable: boolean;
  /** Se fusiona con vecinos del mismo tipo y nivel. */
  mergeable: boolean;
  /** Nivel máximo de mejora (1 = no mejorable). */
  maxLevel: RoomLevel;
  stat: PatronStat | null;
  /** Costo del primer bloque; cada bloque existente del mismo tipo suma costIncrement. */
  baseCost: number;
  costIncrement: number;
  /** Costo por bloque para subir a nivel 2 y 3. */
  upgradeCosts: { 2: number; 3: number };
  /** Colores para el render (hex). */
  color: number;
  accent: number;
}

export const ROOM_DEFS: Record<RoomType, RoomDef> = {
  entrance: {
    type: 'entrance',
    name: 'Puerta del Búnker',
    description: 'Compuerta de bidones y lona. Se puede reforzar para resistir asaltos.',
    cellsPerBlock: BLOCK_CELLS,
    buildable: false,
    demolishable: false,
    mergeable: false,
    maxLevel: 3,
    stat: null,
    baseCost: 0,
    costIncrement: 0,
    upgradeCosts: { 2: 500, 3: 1500 },
    color: 0x5b6470,
    accent: 0xf2c94c,
  },
  elevator: {
    type: 'elevator',
    name: 'Ascensor de Poleas',
    description: 'Conecta pisos verticalmente. No consume energía.',
    cellsPerBlock: 1,
    buildable: true,
    demolishable: true,
    mergeable: false,
    maxLevel: 1,
    stat: null,
    baseCost: 100,
    costIncrement: 0,
    upgradeCosts: { 2: 0, 3: 0 },
    color: 0x3a3f47,
    accent: 0xb0b7c3,
  },
  power: {
    type: 'power',
    name: 'Generador a Pedales',
    description: 'Produce Energía. Usa Poderío (P).',
    cellsPerBlock: BLOCK_CELLS,
    buildable: true,
    demolishable: true,
    mergeable: true,
    maxLevel: 3,
    stat: 'P',
    baseCost: 100,
    costIncrement: 50,
    upgradeCosts: { 2: 300, 3: 900 },
    color: 0x8a6d1f,
    accent: 0xffd34d,
  },
  food: {
    type: 'food',
    name: 'Cultivo Hidropónico',
    description: 'Produce Comida en tubos de PVC. Usa Astucia (A).',
    cellsPerBlock: BLOCK_CELLS,
    buildable: true,
    demolishable: true,
    mergeable: true,
    maxLevel: 3,
    stat: 'A',
    baseCost: 100,
    costIncrement: 50,
    upgradeCosts: { 2: 300, 3: 900 },
    color: 0x2f6b3a,
    accent: 0x7ee08a,
  },
  water: {
    type: 'water',
    name: 'Filtro de Bidones',
    description: 'Produce Agua. Usa Ñeque (N).',
    cellsPerBlock: BLOCK_CELLS,
    buildable: true,
    demolishable: true,
    mergeable: true,
    maxLevel: 3,
    stat: 'N',
    baseCost: 100,
    costIncrement: 50,
    upgradeCosts: { 2: 300, 3: 900 },
    color: 0x22577a,
    accent: 0x6ec6ff,
  },
  living: {
    type: 'living',
    name: 'Sala de Descanso',
    description: 'Aumenta la población máxima y permite la reproducción. Usa Optimismo (O).',
    cellsPerBlock: BLOCK_CELLS,
    buildable: true,
    demolishable: true,
    mergeable: true,
    maxLevel: 3,
    stat: 'O',
    baseCost: 100,
    costIncrement: 50,
    upgradeCosts: { 2: 300, 3: 900 },
    color: 0x7a3b5c,
    accent: 0xff9ecf,
  },
};

export const BUILDABLE_TYPES: RoomType[] = (Object.keys(ROOM_DEFS) as RoomType[]).filter(
  (t) => ROOM_DEFS[t].buildable,
);
