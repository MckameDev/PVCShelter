import type { IncidentKind, PatronStat, ProducedResource, Rarity, RaidKind, RoomBlocks, RoomLevel, RoomType } from './types';

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

export type RoomCategory = 'core' | 'resources' | 'health' | 'utility' | 'training' | 'crafting';

export const CATEGORY_NAMES: Record<RoomCategory, string> = {
  core: 'Básicas',
  resources: 'Recursos',
  health: 'Salud',
  utility: 'Utilidad',
  training: 'Entrenamiento',
  crafting: 'Fabricación',
};

export interface RoomDef {
  type: RoomType;
  name: string;
  description: string;
  category: RoomCategory;
  /** Habitantes vivos necesarios para poder construirla. */
  unlockPopulation: number;
  /** Ancho de un bloque en celdas. */
  cellsPerBlock: number;
  buildable: boolean;
  demolishable: boolean;
  /** Se fusiona con vecinos del mismo tipo y nivel. */
  mergeable: boolean;
  /** Nivel máximo de mejora (1 = no mejorable). */
  maxLevel: RoomLevel;
  /** Stat P.A.T.R.O.N. que usa la sala (producir, transmitir o entrenar). */
  stat: PatronStat | null;
  /** Stat que entrena (solo salas de entrenamiento). */
  trains: PatronStat | null;
  /** Costo del primer bloque; cada bloque existente del mismo tipo suma costIncrement. */
  baseCost: number;
  costIncrement: number;
  /** Costo por bloque para subir a nivel 2 y 3. */
  upgradeCosts: { 2: number; 3: number };
  /** Recurso que produce por ciclo, o null si no produce. */
  produces: ProducedResource | null;
  /**
   * Duración base de un ciclo con la sala llena de habitantes de stat
   * REFERENCE_STAT (producción, o transmisión en la radio). 0 = sin ciclo.
   */
  cycleSeconds: number;
  /** Unidades por ciclo de una sala simple nivel 1 (se multiplica por roomEfficiency). */
  baseYield: number;
  /** Energía consumida por segundo y por bloque (generadores y ascensores no consumen). */
  energyDraw: number;
  /** Colores para el render (hex). */
  color: number;
  accent: number;
}

/** Valores comunes; cada sala sobrescribe lo que necesita. */
const DEFAULTS = {
  category: 'resources',
  unlockPopulation: 0,
  cellsPerBlock: BLOCK_CELLS,
  buildable: true,
  demolishable: true,
  mergeable: true,
  maxLevel: 3,
  stat: null,
  trains: null,
  baseCost: 100,
  costIncrement: 50,
  upgradeCosts: { 2: 300, 3: 900 },
  produces: null,
  cycleSeconds: 0,
  baseYield: 0,
  energyDraw: 0.03,
} as const satisfies Partial<RoomDef>;

type RoomSpec = Partial<RoomDef> & Pick<RoomDef, 'name' | 'description' | 'color' | 'accent'>;
const room = (type: RoomType, spec: RoomSpec): RoomDef => ({ ...DEFAULTS, type, ...spec });

const TRAINING_COLORS: Record<PatronStat, [number, number]> = {
  P: [0x6b3a2a, 0xff8a5c],
  A: [0x2a4a6b, 0x8ab8ff],
  T: [0x4a5a2a, 0xb8e05c],
  R: [0x5c4a1f, 0xffc94d],
  O: [0x6b2a5c, 0xff8ad8],
  N: [0x2a5c5c, 0x5cffe0],
};

const trainingRoom = (stat: PatronStat, name: string, gear: string, unlockPopulation: number): RoomDef =>
  room(`train-${stat}`, {
    name,
    description: `Se entrena ${gear}. Sube un punto el stat ${stat} de quienes están dentro, hasta 10.`,
    category: 'training',
    unlockPopulation,
    stat,
    trains: stat,
    baseCost: 400,
    costIncrement: 100,
    upgradeCosts: { 2: 800, 3: 2000 },
    energyDraw: 0.04,
    color: TRAINING_COLORS[stat][0],
    accent: TRAINING_COLORS[stat][1],
  });

export const ROOM_DEFS: Record<RoomType, RoomDef> = {
  entrance: room('entrance', {
    name: 'Puerta del Búnker',
    description: 'Compuerta de bidones y lona. Se puede reforzar para resistir asaltos.',
    category: 'core',
    buildable: false,
    demolishable: false,
    mergeable: false,
    baseCost: 0,
    costIncrement: 0,
    upgradeCosts: { 2: 500, 3: 1500 },
    energyDraw: 0,
    color: 0x5b6470,
    accent: 0xf2c94c,
  }),
  elevator: room('elevator', {
    name: 'Ascensor de Poleas',
    description: 'Conecta pisos verticalmente. No consume energía.',
    category: 'core',
    cellsPerBlock: 1,
    mergeable: false,
    maxLevel: 1,
    costIncrement: 0,
    upgradeCosts: { 2: 0, 3: 0 },
    energyDraw: 0,
    color: 0x3a3f47,
    accent: 0xb0b7c3,
  }),
  power: room('power', {
    name: 'Generador a Pedales',
    description: 'Produce Energía. Usa Poderío (P).',
    stat: 'P',
    produces: 'energy',
    cycleSeconds: 30,
    baseYield: 12,
    energyDraw: 0,
    color: 0x8a6d1f,
    accent: 0xffd34d,
  }),
  food: room('food', {
    name: 'Cultivo Hidropónico',
    description: 'Produce Comida en tubos de PVC. Usa Astucia (A).',
    stat: 'A',
    produces: 'food',
    cycleSeconds: 30,
    baseYield: 10,
    color: 0x2f6b3a,
    accent: 0x7ee08a,
  }),
  water: room('water', {
    name: 'Filtro de Bidones',
    description: 'Produce Agua. Usa Ñeque (N).',
    stat: 'N',
    produces: 'water',
    cycleSeconds: 30,
    baseYield: 10,
    color: 0x22577a,
    accent: 0x6ec6ff,
  }),
  living: room('living', {
    name: 'Sala de Descanso',
    description: 'Aumenta la población máxima y permite la reproducción. Usa Optimismo (O).',
    category: 'core',
    stat: 'O',
    energyDraw: 0.015,
    color: 0x7a3b5c,
    accent: 0xff9ecf,
  }),

  // --- Sprint 4 -------------------------------------------------------------
  storage: room('storage', {
    name: 'Almacén de Trastos',
    description: 'Estanterías de palets: aumenta el límite del inventario de objetos.',
    category: 'utility',
    unlockPopulation: 8,
    baseCost: 150,
    energyDraw: 0.01,
    color: 0x5c4a32,
    accent: 0xd9a066,
  }),
  medbay: room('medbay', {
    name: 'Enfermería',
    description: 'Produce Vendas Caseras que curan HP. Usa Astucia (A).',
    category: 'health',
    unlockPopulation: 12,
    stat: 'A',
    produces: 'stimpaks',
    cycleSeconds: 60,
    baseYield: 1,
    baseCost: 400,
    costIncrement: 100,
    upgradeCosts: { 2: 800, 3: 2000 },
    energyDraw: 0.04,
    color: 0x8a2f2f,
    accent: 0xff6b6b,
  }),
  detox: room('detox', {
    name: 'Planta Depuradora',
    description: 'Produce Desintoxicantes que curan el daño por agua sucia. Usa Ñeque (N).',
    category: 'health',
    unlockPopulation: 14,
    stat: 'N',
    produces: 'radaways',
    cycleSeconds: 60,
    baseYield: 1,
    baseCost: 400,
    costIncrement: 100,
    upgradeCosts: { 2: 800, 3: 2000 },
    energyDraw: 0.04,
    color: 0x55632a,
    accent: 0xc6ff4d,
  }),
  radio: room('radio', {
    name: 'Antena de Radio Casera',
    description: 'Sube la felicidad global y puede atraer nuevos habitantes del exterior. Usa Optimismo (O).',
    category: 'utility',
    unlockPopulation: 16,
    stat: 'O',
    cycleSeconds: 120,
    baseCost: 600,
    costIncrement: 200,
    upgradeCosts: { 2: 1200, 3: 3000 },
    energyDraw: 0.05,
    color: 0x3d2d5c,
    accent: 0xc58cff,
  }),
  barracks: room('barracks', {
    name: 'Barracones',
    description: 'Literas apiladas: aumentan la población máxima (hasta 200).',
    category: 'utility',
    unlockPopulation: 20,
    baseCost: 500,
    costIncrement: 150,
    upgradeCosts: { 2: 1000, 3: 2500 },
    energyDraw: 0.02,
    color: 0x4a4f5c,
    accent: 0x9fb4d9,
  }),
  'train-P': trainingRoom('P', 'Gimnasio de Poderío', 'levantando bidones llenos', 24),
  'train-A': trainingRoom('A', 'Aula de Astucia', 'con manuales de fontanería', 26),
  'train-T': trainingRoom('T', 'Pista de Tenacidad', 'corriendo en una cinta de rodillos', 28),
  'train-N': trainingRoom('N', 'Campo de Ñeque', 'tirando dardos a una diana de lona', 30),
  'train-R': trainingRoom('R', 'Mesa de Rebusque', 'jugando a las cartas', 32),
  'train-O': trainingRoom('O', 'Teatrito de Optimismo', 'actuando en un escenario de cajas', 34),

  // --- Sprint 5 -------------------------------------------------------------
  'weapon-workshop': room('weapon-workshop', {
    name: 'Taller de Armas Caseras',
    description: 'Fabrica armas con planos, chatarra y Codos. Usa Poderío (P).',
    category: 'crafting',
    unlockPopulation: 32,
    stat: 'P',
    baseCost: 600,
    costIncrement: 200,
    upgradeCosts: { 2: 1200, 3: 3000 },
    energyDraw: 0.05,
    color: 0x4a3a2a,
    accent: 0xff7a3d,
  }),
  'outfit-workshop': room('outfit-workshop', {
    name: 'Taller de Costura',
    description: 'Fabrica atuendos con planos, chatarra y Codos. Usa Tenacidad (T).',
    category: 'crafting',
    unlockPopulation: 40,
    stat: 'T',
    baseCost: 600,
    costIncrement: 200,
    upgradeCosts: { 2: 1200, 3: 3000 },
    energyDraw: 0.05,
    color: 0x3d4a6b,
    accent: 0x9fd0ff,
  }),
  barber: room('barber', {
    name: 'Peluquería La Tijera',
    description: 'Permite cambiar la apariencia de los habitantes desde su ficha.',
    category: 'utility',
    unlockPopulation: 50,
    mergeable: false,
    maxLevel: 1,
    baseCost: 500,
    costIncrement: 0,
    energyDraw: 0.02,
    color: 0x6b2a3a,
    accent: 0xff5c8a,
  }),
};


export const BUILDABLE_TYPES: RoomType[] = (Object.keys(ROOM_DEFS) as RoomType[]).filter(
  (t) => ROOM_DEFS[t].buildable,
);


// ---------------------------------------------------------------------------
// Sprint 2: economía de recursos vitales
// ---------------------------------------------------------------------------

export const STARTING_RESOURCES = { codos: 3000, cinta: 5, energy: 80, food: 80, water: 80, stimpaks: 2, radaways: 1 };
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

// Combate: daño por segundo de un habitante = base + Poderío (P) × factor + arma.
export const DWELLER_BASE_DPS = 1;
export const DWELLER_DPS_PER_P = 0.2;
export const INCIDENT_REWARD_PER_BLOCK = 15;


// ---------------------------------------------------------------------------
// Sprint 3: habitantes, niveles, felicidad y reproducción
// ---------------------------------------------------------------------------

export const MAX_DWELLER_LEVEL = 50;
/** XP necesaria para pasar del nivel n al n+1: XP_LEVEL_BASE × n^XP_LEVEL_EXP. */
export const XP_LEVEL_BASE = 40;
export const XP_LEVEL_EXP = 1.4;
/** XP por segundo trabajando = stat de la sala × este factor (0.1 a 1 XP/s). */
export const XP_PER_STAT_SECOND = 0.1;
/** Codos al subir de nivel = nivel nuevo × este factor. */
export const LEVEL_UP_CODOS = 10;
/** HP máximo ganado al subir de nivel: base + Tenacidad (T) × factor. */
export const LEVEL_UP_HP_BASE = 2;
export const LEVEL_UP_HP_PER_T = 0.5;

/** La felicidad converge hacia su objetivo a estos puntos por segundo. */
export const HAPPINESS_RATE = 0.5;
export const START_HAPPINESS = 60;
/**
 * Bono de felicidad global (0..1) al tiempo de producción: el ciclo se divide
 * por (HAPPINESS_SPEED_MIN + h × HAPPINESS_SPEED_RANGE). Con 50% es neutro.
 */
export const HAPPINESS_SPEED_MIN = 0.75;
export const HAPPINESS_SPEED_RANGE = 0.5;

/** Cortejo con Optimismo (O) medio REFERENCE_STAT en ambos. */
export const COURTSHIP_SECONDS = 60;
export const PREGNANCY_SECONDS = 180;
export const CHILDHOOD_SECONDS = 240;

/** Población máxima: base + plazas por bloque de Sala de Descanso (× eficiencia de nivel). */
export const POPULATION_BASE = 8;
export const POPULATION_PER_LIVING_BLOCK = 4;
export const POPULATION_HARD_CAP = 200;

// ---------------------------------------------------------------------------
// Sprint 4: salud, almacenamiento, barracones, radio y entrenamiento
// ---------------------------------------------------------------------------

/** Tope de curativos: base + por bloque de la sala que los produce (× eficiencia de nivel). */
export const MED_BASE_STORAGE = 5;
export const MED_STORAGE_PER_BLOCK = 5;
export const STIMPAK_HEAL = 40;
export const RADAWAY_CURE = 40;

/** Plazas de inventario de objetos: base + por bloque de Almacén (× eficiencia de nivel). */
export const ITEM_BASE_CAPACITY = 10;
export const ITEM_CAPACITY_PER_STORAGE_BLOCK = 10;

export const POPULATION_PER_BARRACKS_BLOCK = 6;

/** Puntos de felicidad que suma cada bloque de radio con personal (× nivel), con tope. */
export const RADIO_HAPPINESS_PER_BLOCK = 5;
export const RADIO_HAPPINESS_MAX = 25;
/** Probabilidad de atraer a alguien por transmisión: base + Optimismo medio × factor. */
export const RADIO_RECRUIT_BASE = 0.3;
export const RADIO_RECRUIT_PER_O = 0.05;
export const RADIO_RECRUIT_MAX = 0.9;

/** Segundos para subir un stat de n a n+1 = TRAINING_SECONDS_PER_POINT × n (÷ eficiencia de nivel). */
export const TRAINING_SECONDS_PER_POINT = 20;
export const MAX_BASE_STAT = 10;

// ---------------------------------------------------------------------------
// Sprint 5: inventario, chatarra, fabricación y peluquería
// ---------------------------------------------------------------------------

/** Inventario inicial: algo de equipo básico para que el sistema se vea desde el principio. */
export const STARTING_INVENTORY = {
  items: ['lead-pipe', 'lead-pipe', 'work-overall', 'parrot'],
  junk: { common: 8, rare: 2, legendary: 0 } as Record<Rarity, number>,
  /** Planos conocidos al empezar; el resto se encontrará en el Yermo (Sprint 7). */
  recipes: ['lead-pipe', 'wrench', 'nail-gun', 'work-overall', 'tape-vest', 'plumber-suit'],
};

/** Costo y duración base de fabricar según la rareza del objeto. */
export const CRAFT_COSTS: Record<Rarity, { junk: Partial<Record<Rarity, number>>; codos: number; seconds: number }> = {
  common: { junk: { common: 3 }, codos: 50, seconds: 60 },
  rare: { junk: { common: 4, rare: 3 }, codos: 200, seconds: 180 },
  legendary: { junk: { common: 5, rare: 4, legendary: 2 }, codos: 800, seconds: 480 },
};

/** Chatarra obtenida al desguazar un objeto según su rareza. */
export const SCRAP_YIELD: Record<Rarity, Partial<Record<Rarity, number>>> = {
  common: { common: 2 },
  rare: { common: 1, rare: 2 },
  legendary: { rare: 2, legendary: 1 },
};

export const BARBER_COST = 50;

// ---------------------------------------------------------------------------
// Sprint 6: incidentes, asaltos, combate y muerte
// ---------------------------------------------------------------------------

export interface IncidentDef {
  name: string;
  /** Con artículo, para los avisos ("el incendio"). */
  label: string;
  hpPerBlock: number;
  /** Daño por segundo y por bloque, repartido entre los defensores de la sala. */
  dpsPerBlock: number;
  /** Consumo extra por segundo y por bloque mientras dura. */
  drain: { energy?: number; food?: number; water?: number };
  /** Piso mínimo donde puede aparecer (los topos viven en lo hondo). */
  minFloor: number;
}

export const INCIDENT_DEFS: Record<IncidentKind, IncidentDef> = {
  fire: { name: 'Incendio', label: 'el incendio', hpPerBlock: 40, dpsPerBlock: 2, drain: { energy: 0.05 }, minFloor: 0 },
  gas: { name: 'Fuga de gas', label: 'la fuga de gas', hpPerBlock: 30, dpsPerBlock: 3, drain: { energy: 0.08 }, minFloor: 0 },
  roaches: { name: 'Plaga de cucarachas', label: 'la plaga de cucarachas', hpPerBlock: 40, dpsPerBlock: 1.5, drain: { energy: 0.02, food: 0.05 }, minFloor: 0 },
  rats: { name: 'Ratas mutantes', label: 'las ratas mutantes', hpPerBlock: 60, dpsPerBlock: 2.5, drain: { food: 0.08, water: 0.04 }, minFloor: 0 },
  moles: { name: 'Topos gigantes', label: 'los topos gigantes', hpPerBlock: 90, dpsPerBlock: 3, drain: { energy: 0.04, water: 0.06 }, minFloor: 6 },
};

/** Segundos que un incidente aguanta en una sala vacía antes de propagarse a una vecina. */
export const INCIDENT_SPREAD_SECONDS = 20;
/** Cada cuánto se tira el dado de incidente aleatorio, y con qué probabilidad sale. */
export const RANDOM_INCIDENT_CHECK_SECONDS = 30;
export const RANDOM_INCIDENT_CHANCE = 0.12;
export const RANDOM_INCIDENT_MIN_POPULATION = 10;

export interface RaidDef {
  name: string;
  /** Con artículo y en plural, para los avisos. */
  label: string;
  enemyName: string;
  enemyHp: number;
  enemyDps: number;
  minPopulation: number;
  /** Codos que roba cada enemigo vivo por sala saqueada. */
  stealCodos: number;
}

export const RAID_DEFS: Record<RaidKind, RaidDef> = {
  raiders: { name: 'Saqueadores', label: 'los saqueadores', enemyName: 'Saqueador', enemyHp: 30, enemyDps: 2, minPopulation: 0, stealCodos: 40 },
  dogs: { name: 'Perros salvajes', label: 'los perros salvajes', enemyName: 'Perro salvaje', enemyHp: 20, enemyDps: 3, minPopulation: 0, stealCodos: 10 },
  mutants: { name: 'Mutantes pesados', label: 'los mutantes pesados', enemyName: 'Mutante', enemyHp: 90, enemyDps: 5, minPopulation: 30, stealCodos: 60 },
};

export const RAID_CHECK_SECONDS = 60;
export const RAID_CHANCE = 0.1;
export const RAID_MIN_POPULATION = 14;
/** Enemigos por asalto: base + 1 cada RAID_POPULATION_PER_ENEMY habitantes, hasta el máximo. */
export const RAID_BASE_ENEMIES = 2;
export const RAID_POPULATION_PER_ENEMY = 10;
export const RAID_MAX_ENEMIES = 6;
/** Resistencia de la puerta según su nivel de mejora. */
export const DOOR_HP: Record<RoomLevel, number> = { 1: 80, 2: 180, 3: 320 };
/** Puestos de guardia en la Puerta del Búnker. */
export const ENTRANCE_GUARDS = 2;
/** Segundos saqueando una sala vacía antes de pasar a la siguiente. */
export const RAID_STEAL_SECONDS = 8;
export const RAID_STEAL_FOOD = 5;
export const RAID_STEAL_WATER = 5;
export const RAID_REWARD_PER_ENEMY = 40;

/** Felicidad que pierden los compañeros de sala cuando muere alguien. */
export const DEATH_HAPPINESS_PENALTY = 20;
export const REVIVE_COST_BASE = 100;
export const REVIVE_COST_PER_LEVEL = 25;
