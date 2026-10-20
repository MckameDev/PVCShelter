import { create } from 'zustand';
import * as Bunker from '../core/Bunker';
import { assignDweller, PATRON_NAMES } from '../core/Dwellers';
import { buildCost, demolishRefund, rockClearCost, upgradeCost } from '../core/Economy';
import { applyMed, MED_NAMES } from '../core/Health';
import * as Grid from '../core/GridManager';
import { collectResource, RESOURCE_NAMES, rushRoom } from '../core/Production';
import { advance } from '../core/Simulation';
import type { SimEvent } from '../core/Simulation';
import type { GameData, MedResource, ProducedResource, Rng, RoomType } from '../core/types';

export type Selection = { kind: 'room'; id: string } | { kind: 'rock'; id: string } | null;

export interface Notice {
  id: number;
  text: string;
  tone: 'error' | 'success' | 'info';
}

interface UiState {
  /** Tipo de sala en modo construcción, o null si no se está construyendo. */
  buildType: RoomType | null;
  selection: Selection;
  notice: Notice | null;
  dwellersOpen: boolean;
  /** Habitante cuya ficha P.A.T.R.O.N. está abierta. */
  dwellerModalId: string | null;
}

interface Actions {
  newGame: (seed?: number) => void;
  tick: (seconds: number) => void;
  startBuild: (type: RoomType) => void;
  cancelBuild: () => void;
  build: (floor: number, col: number) => boolean;
  select: (selection: Selection) => void;
  upgradeRoom: (roomId: string) => boolean;
  demolishRoom: (roomId: string) => boolean;
  clearRock: (rockId: string) => boolean;
  assign: (dwellerId: string, roomId: string | null) => boolean;
  collect: (resource: ProducedResource) => boolean;
  /** Usa una Venda Casera o un Desintoxicante en un habitante. */
  heal: (dwellerId: string, med: MedResource) => boolean;
  rush: (roomId: string) => boolean;
  setDwellersOpen: (open: boolean) => void;
  openDweller: (dwellerId: string | null) => void;
  dismissNotice: () => void;
}

// GameData se guarda "aplanado" en el store para que los componentes se
// suscriban a porciones concretas (s.resources, s.grid...) sin re-render global.
export type GameState = GameData & UiState & Actions;

/** Aleatoriedad de las acciones del jugador. La simulación por ticks es determinista. */
const rng: Rng = Math.random;

let noticeSeq = 0;
const notice = (text: string, tone: Notice['tone']): Notice => ({ id: ++noticeSeq, text, tone });

const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

const pickData = (s: GameState): GameData => ({
  grid: s.grid,
  resources: s.resources,
  dwellers: s.dwellers,
  runtime: s.runtime,
  nextDwellerId: s.nextDwellerId,
  time: s.time,
});

const freshState = (seed: number): GameData & UiState => ({
  ...Bunker.createNewGame(seed),
  buildType: null,
  selection: null,
  notice: null,
  dwellersOpen: false,
  dwellerModalId: null,
});

const INCIDENT_NAMES = { fire: 'el incendio', roaches: 'la plaga de cucarachas' } as const;

function describeEvent(e: SimEvent): Notice {
  switch (e.type) {
    case 'dweller-died':
      return notice(`${e.name} ha muerto.`, 'error');
    case 'shortage':
      return notice(`¡Se acabó la ${RESOURCE_NAMES[e.resource]}!`, 'error');
    case 'fled':
      return notice(`${e.name} está embarazada y huyó del incidente.`, 'info');
    case 'birth':
      return notice(`¡${e.mother} dio a luz a ${e.child}!`, 'success');
    case 'level-up':
      return notice(`${e.name} subió a nivel ${e.level}. +${e.codos} Codos.`, 'success');
    case 'grew-up':
      return notice(`${e.name} ya es adulto y puede trabajar.`, 'info');
    case 'conceived':
      return notice(`${e.mother} y ${e.father} esperan un bebé.`, 'success');
    case 'incident-resolved':
      return notice(`Controlaron ${INCIDENT_NAMES[e.kind]}. +${e.codos} Codos.`, 'success');
    case 'trained':
      return notice(`${e.name} subió ${PATRON_NAMES[e.stat]} a ${e.value}.`, 'success');
    case 'recruited':
      return notice(`📻 ${e.name} escuchó la radio y llegó al búnker.`, 'success');
  }
}

/** Orden de importancia: solo se muestra el evento más relevante del tick. */
const EVENT_PRIORITY: SimEvent['type'][] = [
  'dweller-died',
  'shortage',
  'fled',
  'birth',
  'recruited',
  'level-up',
  'trained',
  'grew-up',
  'conceived',
  'incident-resolved',
];

function eventNotice(events: SimEvent[]): Notice | null {
  for (const type of EVENT_PRIORITY) {
    const e = events.find((ev) => ev.type === type);
    if (e) return describeEvent(e);
  }
  return null;
}

export const useGameStore = create<GameState>()((set, get) => {
  const fail = (reason: string) => {
    set({ notice: notice(reason, 'error') });
    return false;
  };
  /** Valida que alcancen los Codos; si no, publica un aviso. */
  const canAfford = (cost: number): boolean => {
    if (get().resources.codos >= cost) return true;
    return fail(`Faltan Codos de PVC (necesitas ${cost}).`);
  };
  const spend = (data: GameData, cost: number): GameData => ({
    ...data,
    resources: { ...data.resources, codos: data.resources.codos - cost },
  });

  return {
    ...freshState(randomSeed()),

    newGame: (seed = randomSeed()) => set(freshState(seed)),

    tick: (seconds) => {
      const { data, events } = advance(pickData(get()), seconds);
      const n = eventNotice(events);
      set(n ? { ...data, notice: n } : data);
    },

    startBuild: (type) =>
      set((s) => ({ buildType: s.buildType === type ? null : type, selection: null })),

    cancelBuild: () => set({ buildType: null }),

    build: (floor, col) => {
      const state = get();
      const { buildType } = state;
      if (!buildType) return false;
      const unlock = Bunker.canBuildType(pickData(state), buildType);
      if (!unlock.ok) return fail(unlock.reason);

      // Validar posición antes que dinero: el mensaje de error es más útil.
      const check = Grid.canPlaceRoom(state.grid, buildType, floor, col);
      if (!check.ok) return fail(check.reason);
      const cost = buildCost(state.grid, buildType);
      if (!canAfford(cost)) return false;

      const res = Grid.placeRoom(state.grid, buildType, floor, col);
      if (!res.ok) return fail(res.reason);
      set({
        ...spend(Bunker.applyRoomChange(pickData(state), res.value), cost),
        buildType: null,
        selection: { kind: 'room', id: res.value.roomId },
      });
      return true;
    },

    select: (selection) => set({ selection }),

    upgradeRoom: (roomId) => {
      const state = get();
      const check = Grid.canUpgradeRoom(state.grid, roomId);
      if (!check.ok) return fail(check.reason);
      const cost = upgradeCost(check.value);
      if (cost === null) return fail('La sala ya está al nivel máximo.');
      if (!canAfford(cost)) return false;

      const res = Grid.upgradeRoom(state.grid, roomId);
      if (!res.ok) return fail(res.reason);
      const data = spend(Bunker.applyRoomChange(pickData(state), res.value), cost);
      set({
        ...data,
        selection: { kind: 'room', id: res.value.roomId },
        notice: notice(`Sala mejorada a nivel ${data.grid.rooms[res.value.roomId].level}.`, 'success'),
      });
      return true;
    },

    demolishRoom: (roomId) => {
      const state = get();
      const room = state.grid.rooms[roomId];
      if (!room) return fail('La sala no existe.');
      const res = Bunker.demolish(pickData(state), roomId);
      if (!res.ok) return fail(res.reason);
      const refund = demolishRefund(room);
      set({
        ...spend(res.value, -refund),
        selection: null,
        notice: notice(`Sala demolida. Recuperas ${refund} Codos.`, 'info'),
      });
      return true;
    },

    clearRock: (rockId) => {
      const state = get();
      const rock = state.grid.rocks[rockId];
      if (!rock) return fail('La roca no existe.');
      const cost = rockClearCost(rock);
      if (!canAfford(cost)) return false;

      const res = Grid.clearRock(state.grid, rockId);
      if (!res.ok) return fail(res.reason);
      set({ ...spend({ ...pickData(state), grid: res.value }, cost), selection: null });
      return true;
    },

    assign: (dwellerId, roomId) => {
      const res = assignDweller(pickData(get()), dwellerId, roomId);
      if (!res.ok) return fail(res.reason);
      set({ dwellers: res.value.dwellers });
      return true;
    },

    collect: (resource) => {
      const res = collectResource(pickData(get()), resource, rng);
      if (!res.ok) return fail(res.reason);
      const { data, summary } = res.value;
      const parts = [`+${summary.stored} ${RESOURCE_NAMES[resource]}`];
      if (summary.codos > 0) parts.push(`+${summary.codos} Codos`);
      set({ ...data, notice: notice(parts.join(' · '), 'success') });
      return true;
    },

    rush: (roomId) => {
      const res = rushRoom(pickData(get()), roomId, rng);
      if (!res.ok) return fail(res.reason);
      const { data, outcome } = res.value;
      const text = outcome.success
        ? `¡Exprés exitoso! +${outcome.stored} ${RESOURCE_NAMES[outcome.resource]} · +${outcome.codos} Codos`
        : `¡El Exprés falló! Se desató ${INCIDENT_NAMES[outcome.incident]}.`;
      set({ ...data, notice: notice(text, outcome.success ? 'success' : 'error') });
      return true;
    },

    heal: (dwellerId, med) => {
      const res = applyMed(pickData(get()), dwellerId, med);
      if (!res.ok) return fail(res.reason);
      set({ ...res.value, notice: notice(`Usaste ${MED_NAMES[med]} en ${res.value.dwellers[dwellerId].name}.`, 'success') });
      return true;
    },

    setDwellersOpen: (open) => set({ dwellersOpen: open }),


    openDweller: (dwellerId) => set({ dwellerModalId: dwellerId }),

    dismissNotice: () => set({ notice: null }),
  };
});
