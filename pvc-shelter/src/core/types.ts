// Tipos compartidos del núcleo. Todo es serializable a JSON (necesario para el
// guardado en la nube del Sprint 8), por eso no hay clases ni Maps aquí.

export type TrainingRoomType = 'train-P' | 'train-A' | 'train-T' | 'train-R' | 'train-O' | 'train-N';

export type RoomType =
  | 'entrance'
  | 'elevator'
  | 'power'
  | 'food'
  | 'water'
  | 'living'
  // Sprint 4
  | 'medbay'
  | 'detox'
  | 'storage'
  | 'barracks'
  | 'radio'
  | TrainingRoomType
  // Sprint 5
  | 'weapon-workshop'
  | 'outfit-workshop'
  | 'barber'
  // Sprint 7
  | 'overseer';

/** Letra del sistema P.A.T.R.O.N. que usa una sala para producir. */
export type PatronStat = 'P' | 'A' | 'T' | 'R' | 'O' | 'N';

export type RoomLevel = 1 | 2 | 3;
export type RoomBlocks = 1 | 2 | 3;

export interface Room {
  id: string;
  type: RoomType;
  /** Piso: 0 es la superficie (puerta del búnker), crece hacia abajo. */
  floor: number;
  /** Columna de la celda más a la izquierda que ocupa la sala. */
  col: number;
  /** Cantidad de bloques fusionados (1 = simple, 2 = doble, 3 = triple). */
  blocks: RoomBlocks;
  level: RoomLevel;
}

export interface Rock {
  id: string;
  floor: number;
  col: number;
  /** Ancho en celdas. */
  width: number;
}

export interface GridState {
  floors: number;
  cols: number;
  rooms: Record<string, Room>;
  rocks: Record<string, Rock>;
  /** Contador para ids deterministas (evita depender de crypto/Date en lógica pura). */
  nextId: number;
  /** Semilla con la que se generaron las rocas (reproducibilidad). */
  seed: number;
}

// ---------------------------------------------------------------------------
// Sprint 2: recursos, habitantes y producción
// ---------------------------------------------------------------------------

/** Recursos vitales con stock limitado por almacenamiento. */
export type VitalResource = 'energy' | 'food' | 'water';
/** Curativos: Vendas Caseras (stimpaks) y Desintoxicantes (radaway). */
export type MedResource = 'stimpaks' | 'radaways';
/** Todo lo que una sala puede producir por ciclo. */
export type ProducedResource = VitalResource | MedResource;

export interface Resources {
  /** Codos de PVC: moneda principal. */
  codos: number;
  /** Rollos de Cinta: moneda premium para acelerar procesos. */
  cinta: number;
  energy: number;
  food: number;
  water: number;
  stimpaks: number;
  radaways: number;
}

export type PatronStats = Record<PatronStat, number>;

export interface Dweller {
  id: string;
  name: string;
  sex: 'M' | 'F';
  stats: PatronStats;
  /** 1 a MAX_DWELLER_LEVEL. */
  level: number;
  /** XP acumulada dentro del nivel actual. */
  xp: number;
  hp: number;
  maxHp: number;
  /** Daño por agua contaminada: reduce el HP máximo efectivo (barra roja). */
  intox: number;
  roomId: string | null;
  alive: boolean;
  /** 0 a 100. La media de los adultos da la felicidad global. */
  happiness: number;
  /** [padre, madre] si nació en el búnker; evita parejas entre familiares. */
  parents: [string, string] | null;
  /** Segundos que le faltan para ser adulto (0 = adulto). Los niños no trabajan. */
  childTime: number;
  pregnancy: { fatherId: string; elapsed: number } | null;
  /** Cortejo en curso en la Sala de Descanso (solo se guarda en la mujer de la pareja). */
  courtship: { partnerId: string; progress: number } | null;
  /** Segundos entrenando hacia el siguiente punto del stat de su sala de entrenamiento. */
  training: number;
  /** Ranuras de equipo: los objetos equipados salen del inventario. */
  equipment: Equipment;
  /** Apariencia elegida en la Peluquería; null = la generada a partir de su id. */
  appearance: Appearance | null;
  /** Dónde está: en el búnker, explorando el Yermo o en una misión. */
  location: DwellerLocation;
}

export type DwellerLocation = 'bunker' | 'wasteland' | 'quest';

// ---------------------------------------------------------------------------
// Sprint 5: objetos, equipo, chatarra y fabricación
// ---------------------------------------------------------------------------

export type ItemKind = 'weapon' | 'outfit' | 'pet';
export type Rarity = 'common' | 'rare' | 'legendary';
export type PetBonus = 'production' | 'xp' | 'damage' | 'training';

/** Instancia concreta de un objeto del catálogo (core/items.ts). */
export interface Item {
  id: string;
  defId: string;
}

export interface Equipment {
  weapon: Item | null;
  outfit: Item | null;
  pet: Item | null;
}

export type HairStyle = 'short' | 'long' | 'mohawk' | 'bald';

export interface Appearance {
  /** Índices de las paletas de canvas/DwellerSprite. */
  skin: number;
  hair: number;
  style: HairStyle;
}

export interface Inventory {
  /** Objetos sin equipar; ocupan plazas (ver itemCapacity). */
  items: Record<string, Item>;
  junk: Record<Rarity, number>;
  /** Planos conocidos (ids de catálogo que se pueden fabricar). */
  recipes: string[];
  nextItemId: number;
}

/** Incendios y fugas de gas; plagas de cucarachas, ratas mutantes y topos. */
export type IncidentKind = 'fire' | 'gas' | 'roaches' | 'rats' | 'moles';

export interface Incident {
  kind: IncidentKind;
  hp: number;
  maxHp: number;
  /** Segundos que lleva la sala sin defensores; al llegar al umbral se propaga. */
  spread: number;
}

// ---------------------------------------------------------------------------
// Sprint 6: asaltos externos
// ---------------------------------------------------------------------------

export type RaidKind = 'raiders' | 'dogs' | 'mutants';

export interface Enemy {
  id: string;
  hp: number;
  maxHp: number;
  /** Daño por segundo que inflige mientras vive. */
  dps: number;
}

export interface Raid {
  kind: RaidKind;
  enemies: Enemy[];
  /** 'door': golpeando la puerta; 'inside': recorriendo el búnker. */
  phase: 'door' | 'inside';
  doorHp: number;
  doorMaxHp: number;
  /** Orden de salas que recorrerán dentro (fijado al romper la puerta). */
  route: string[];
  /** Índice de la sala actual dentro de `route`. */
  step: number;
  /** Segundos saqueando la sala actual cuando no hay defensores. */
  stealTimer: number;
  loot: { codos: number; food: number; water: number };
}

/** Estado dinámico de una sala (separado de Room para no mezclarlo con la geometría). */
export interface RoomRuntime {
  /** Segundos de producción acumulados en el ciclo actual. */
  progress: number;
  /** Ciclo completo esperando a que el jugador recolecte. */
  ready: boolean;
  /** Usos recientes del modo Exprés; sube el % de fallo y decae con el tiempo. */
  rushHeat: number;
  powered: boolean;
  incident: Incident | null;
  /** Fabricación en curso en un taller; `ready` indica que el objeto está terminado. */
  craft: { defId: string; progress: number } | null;
}

/** Estado completo y serializable de una partida. */
export interface GameData {
  grid: GridState;
  resources: Resources;
  dwellers: Record<string, Dweller>;
  runtime: Record<string, RoomRuntime>;
  inventory: Inventory;
  /** Asalto en curso, si lo hay. */
  raid: Raid | null;
  /** Exploradores en el Yermo, por id de habitante. */
  expeditions: Record<string, Expedition>;
  /** Misión activa de la Oficina del Capataz (una a la vez). */
  quest: ActiveQuest | null;
  /** Misiones completadas con éxito (ids del catálogo). */
  questsDone: string[];
  /** Inspector Fisgón escondido en alguna sala, si lo hay. */
  inspector: Inspector | null;

  nextDwellerId: number;

  /** Segundos simulados desde el inicio de la partida. */
  time: number;
}

// ---------------------------------------------------------------------------
// Sprint 7: Yermo, misiones e Inspector Fisgón
// ---------------------------------------------------------------------------

export interface LogEntry {
  /** Segundos de exploración en que ocurrió. */
  t: number;
  text: string;
  tone: 'info' | 'good' | 'bad';
}

/** Botín acumulado fuera del búnker; se entrega al volver. */
export interface Loot {
  codos: number;
  /** Ids de catálogo de los objetos encontrados. */
  items: string[];
  junk: Record<Rarity, number>;
  /** Planos nuevos encontrados. */
  recipes: string[];
}

export interface Expedition {
  dwellerId: string;
  status: 'exploring' | 'returning' | 'back' | 'dead';
  /** Segundos explorando (solo crece en 'exploring'). */
  elapsed: number;
  /** Segundos que faltan para llegar al búnker (en 'returning'). */
  returnLeft: number;
  /** Curativos que lleva encima. */
  stimpaks: number;
  radaways: number;
  /** Eventos generados (uno por minuto de exploración). */
  events: number;
  loot: Loot;
  log: LogEntry[];
}

export interface QuestEnemy {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  dps: number;
}

/** Botín brillante en una sala de la misión, pendiente de recoger. */
export interface LootSpot {
  id: string;
  label: string;
  codos?: number;
  item?: string;
  junk?: Partial<Record<Rarity, number>>;
  recipe?: string;
}

export interface ActiveQuest {
  questId: string;
  squad: string[];
  status: 'traveling' | 'exploring' | 'returning' | 'done';
  /** Segundos de viaje que faltan (ida o vuelta). */
  travelLeft: number;
  /** Sala actual y salas ya vistas (niebla de guerra). */
  roomIndex: number;
  revealed: boolean[];
  enemies: QuestEnemy[];
  spots: LootSpot[];
  /** Carga del crítico manual (0..1). */
  critCharge: number;
  loot: Loot;
  /** true si la escuadra cayó entera (sin botín ni recompensa). */
  failed: boolean;
  log: LogEntry[];
}

export interface Inspector {
  roomId: string;
  /** Posición horizontal dentro del búnker, en celdas. */
  x: number;
  timeLeft: number;
}

export type Rng = () => number;


export type Result<T> = { ok: true; value: T } | { ok: false; reason: string };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = <T = never>(reason: string): Result<T> => ({ ok: false, reason });
