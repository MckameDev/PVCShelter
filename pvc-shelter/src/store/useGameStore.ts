import { create } from 'zustand';
import { STARTING_RESOURCES } from '../core/config';
import { buildCost, demolishRefund, rockClearCost, upgradeCost } from '../core/Economy';
import * as Grid from '../core/GridManager';
import type { GridState, RoomType } from '../core/types';

export type Selection = { kind: 'room'; id: string } | { kind: 'rock'; id: string } | null;

export interface Notice {
  id: number;
  text: string;
  tone: 'error' | 'success' | 'info';
}

export interface Resources {
  /** Codos de PVC: moneda principal. */
  codos: number;
  /** Rollos de Cinta: moneda premium para acelerar procesos. */
  cinta: number;
}

interface GameState {
  grid: GridState;
  resources: Resources;
  /** Tipo de sala en modo construcción, o null si no se está construyendo. */
  buildType: RoomType | null;
  selection: Selection;
  notice: Notice | null;

  newGame: (seed?: number) => void;
  startBuild: (type: RoomType) => void;
  cancelBuild: () => void;
  build: (floor: number, col: number) => boolean;
  select: (selection: Selection) => void;
  upgradeRoom: (roomId: string) => boolean;
  demolishRoom: (roomId: string) => boolean;
  clearRock: (rockId: string) => boolean;
  dismissNotice: () => void;
}

let noticeSeq = 0;
const notice = (text: string, tone: Notice['tone']): Notice => ({ id: ++noticeSeq, text, tone });

const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

const initialState = (seed: number) => ({
  grid: Grid.createInitialGrid(seed),
  resources: { ...STARTING_RESOURCES },
  buildType: null,
  selection: null,
  notice: null,
});

export const useGameStore = create<GameState>()((set, get) => {
  /** Intenta pagar; si no alcanza, publica un aviso y devuelve false. */
  const canAfford = (cost: number): boolean => {
    if (get().resources.codos >= cost) return true;
    set({ notice: notice(`Faltan Codos de PVC (necesitas ${cost}).`, 'error') });
    return false;
  };
  const fail = (reason: string) => {
    set({ notice: notice(reason, 'error') });
    return false;
  };

  return {
    ...initialState(randomSeed()),

    newGame: (seed = randomSeed()) => set(initialState(seed)),

    startBuild: (type) =>
      set((s) => ({ buildType: s.buildType === type ? null : type, selection: null })),

    cancelBuild: () => set({ buildType: null }),

    build: (floor, col) => {
      const { grid, buildType, resources } = get();
      if (!buildType) return false;

      // Validar posición antes que dinero: el mensaje de error es más útil.
      const check = Grid.canPlaceRoom(grid, buildType, floor, col);
      if (!check.ok) return fail(check.reason);
      const cost = buildCost(grid, buildType);
      if (!canAfford(cost)) return false;

      const res = Grid.placeRoom(grid, buildType, floor, col);
      if (!res.ok) return fail(res.reason);
      set({
        grid: res.value.grid,
        resources: { ...resources, codos: resources.codos - cost },
        buildType: null,
        selection: { kind: 'room', id: res.value.roomId },
      });
      return true;
    },

    select: (selection) => set({ selection }),

    upgradeRoom: (roomId) => {
      const { grid, resources } = get();
      const check = Grid.canUpgradeRoom(grid, roomId);
      if (!check.ok) return fail(check.reason);
      const cost = upgradeCost(check.value);
      if (cost === null) return fail('La sala ya está al nivel máximo.');
      if (!canAfford(cost)) return false;

      const res = Grid.upgradeRoom(grid, roomId);
      if (!res.ok) return fail(res.reason);
      set({
        grid: res.value.grid,
        resources: { ...resources, codos: resources.codos - cost },
        selection: { kind: 'room', id: res.value.roomId },
        notice: notice(`Sala mejorada a nivel ${res.value.grid.rooms[res.value.roomId].level}.`, 'success'),
      });
      return true;
    },

    demolishRoom: (roomId) => {
      const { grid, resources } = get();
      const room = grid.rooms[roomId];
      const res = Grid.demolishRoom(grid, roomId);
      if (!res.ok || !room) return fail(res.ok ? 'La sala no existe.' : res.reason);
      const refund = demolishRefund(room);
      set({
        grid: res.value,
        resources: { ...resources, codos: resources.codos + refund },
        selection: null,
        notice: notice(`Sala demolida. Recuperas ${refund} Codos.`, 'info'),
      });
      return true;
    },

    clearRock: (rockId) => {
      const { grid, resources } = get();
      const rock = grid.rocks[rockId];
      if (!rock) return fail('La roca no existe.');
      const cost = rockClearCost(rock);
      if (!canAfford(cost)) return false;

      const res = Grid.clearRock(grid, rockId);
      if (!res.ok) return fail(res.reason);
      set({
        grid: res.value,
        resources: { ...resources, codos: resources.codos - cost },
        selection: null,
      });
      return true;
    },

    dismissNotice: () => set({ notice: null }),
  };
});
