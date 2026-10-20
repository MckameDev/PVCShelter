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
  | 'barber';

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
}

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

export type IncidentKind = 'fire' | 'roaches';

export interface Incident {
  kind: IncidentKind;
  hp: number;
  maxHp: number;
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
  nextDwellerId: number;

  /** Segundos simulados desde el inicio de la partida. */
  time: number;
}

export type Rng = () => number;

export type Result<T> = { ok: true; value: T } | { ok: false; reason: string };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = <T = never>(reason: string): Result<T> => ({ ok: false, reason });
