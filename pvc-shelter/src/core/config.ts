import type { PatronStat, RoomBlocks, RoomLevel, RoomType, VitalResource } from './types';

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
  /** Recurso que produce por ciclo, o null si no produce. */
  produces: VitalResource | null;
  /** Duración base de un ciclo con la sala llena de habitantes de stat REFERENCE_STAT. */
  cycleSeconds: number;
  /** Unidades por ciclo de una sala simple nivel 1 (se multiplica por roomEfficiency). */
  baseYield: number;
  /** Energía consumida por segundo y por bloque (generadores y ascensores no consumen). */
  energyDraw: number;
  /** Colores para el render (hex). */
  color: number;
  accent: number;
}

const NO_PRODUCTION = { produces: null, cycleSeconds: 0, baseYield: 0 } as const;

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
    ...NO_PRODUCTION,
    energyDraw: 0,
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
    ...NO_PRODUCTION,
    energyDraw: 0,
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
    produces: 'energy',
    cycleSeconds: 30,
    baseYield: 12,
    energyDraw: 0,
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
    produces: 'food',
    cycleSeconds: 30,
    baseYield: 10,
    energyDraw: 0.03,
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
    produces: 'water',
    cycleSeconds: 30,
    baseYield: 10,
    energyDraw: 0.03,
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
    ...NO_PRODUCTION,
    energyDraw: 0.015,
    color: 0x7a3b5c,
    accent: 0xff9ecf,
  },
};

export const BUILDABLE_TYPES: RoomType[] = (Object.keys(ROOM_DEFS) as RoomType[]).filter(
  (t) => ROOM_DEFS[t].buildable,
);

// ---------------------------------------------------------------------------
// Sprint 2: economía de recursos vitales
// ---------------------------------------------------------------------------

export const STARTING_RESOURCES = { codos: 3000, cinta: 5, energy: 80, food: 80, water: 80 };
export const STARTING_DWELLERS = 6;

/** Almacenamiento base de cada recurso vital; cada bloque productor de ese recurso suma más. */
export const BASE_STORAGE = 100;
export const STORAGE_PER_BLOCK = 50;

/** Consumo por habitante vivo y por segundo. */
export const FOOD_PER_DWELLER = 0.05;
export const WATER_PER_DWELLER = 0.05;

/**
 * Energía mínima requerida = consumo total × ENERGY_RESERVE_SECONDS. Por debajo,
 * se apagan primero las salas más lejanas a un generador.
 */
export const ENERGY_RESERVE_SECONDS = 120;

/** HP perdido por segundo sin comida, e intoxicación ganada por segundo sin agua. */
export const HUNGER_DAMAGE = 0.5;
export const THIRST_INTOX = 0.5;
/** Recuperación natural con comida y agua disponibles (los curativos llegan en el Sprint 4). */
export const HP_REGEN = 0.05;
export const INTOX_RECOVERY = 0.02;

export const DWELLER_BASE_HP = 100;

/** Stat media con la que una sala llena tarda exactamente cycleSeconds. */
export const REFERENCE_STAT = 5;
/** Una sala nunca produce más rápido que esta fracción de su ciclo base. */
export const MIN_CYCLE_FACTOR = 0.2;

/** Probabilidad de Codos al recolectar: por punto de Rebusque (R) de los trabajadores. */
export const CODOS_CHANCE_PER_R = 0.02;
export const CODOS_CHANCE_MAX = 0.6;

export const XP_PER_COLLECT = 5;
export const XP_PER_RUSH = 15;

// Modo Exprés (Rush)
export const RUSH_BASE_FAIL = 0.4;
export const RUSH_FAIL_PER_HEAT = 0.12;
export const RUSH_FAIL_PER_R = 0.015;
export const RUSH_FAIL_PER_ROOM_STAT = 0.02;
export const RUSH_FAIL_MIN = 0.05;
export const RUSH_FAIL_MAX = 0.95;
/** Segundos para que se enfríe un uso consecutivo de Exprés. */
export const RUSH_HEAT_DECAY_SECONDS = 120;

// Incidentes (versión mínima; propagación y combate completo en el Sprint 6)
export const INCIDENT_HP_PER_BLOCK = 40;
/** Daño por segundo que el incidente reparte entre los habitantes de la sala, por bloque. */
export const INCIDENT_DPS_PER_BLOCK = 2;
/** Daño por segundo de un habitante al incidente: base + Poderío (P) × factor. */
export const DWELLER_BASE_DPS = 1;
export const DWELLER_DPS_PER_P = 0.2;
export const INCIDENT_REWARD_PER_BLOCK = 15;
