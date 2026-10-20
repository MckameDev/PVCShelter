import { create } from 'zustand';
import * as Bunker from '../core/Bunker';
import { assignDweller, PATRON_NAMES } from '../core/Dwellers';
import { buildCost, demolishRefund, rockClearCost, upgradeCost } from '../core/Economy';
import { restyleDweller } from '../core/Barber';
import { collectCraft, startCraft } from '../core/Crafting';
import { applyMed, MED_NAMES } from '../core/Health';
import { equipItem, scrapItem, unequipItem } from '../core/Inventory';
import { ITEMS, RARITY_NAMES } from '../core/items';
import * as Grid from '../core/GridManager';
import { collectResource, RESOURCE_NAMES, rushRoom } from '../core/Production';
import { advance } from '../core/Simulation';
import type { SimEvent } from '../core/Simulation';
import { INCIDENT_DEFS, RAID_DEFS, ROOM_DEFS } from '../core/config';
import { repairRoom } from '../core/Incidents';
import { catchInspector } from '../core/Inspector';

import { lootSummary } from '../core/Loot';
import { questById } from '../core/questCatalog';
import { advanceQuest, collectQuest, pickLootSpot, questCrit, questHeal, startQuest } from '../core/Quests';
import { expelDweller, reviveDweller } from '../core/Revival';
import { collectExpedition, recallExpedition, startExpedition } from '../core/Wasteland';
import type {
  Appearance,
  GameData,
  GridState,
  IncidentKind,
  ItemKind,
  MedResource,
  ProducedResource,
  Rarity,
  Rng,
  RoomType,
} from '../core/types';

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
  inventoryOpen: boolean;
  wastelandOpen: boolean;
  /** Misión cuyo modal está abierto. */
  openQuestId: string | null;
  /** Habitante a punto de salir al Yermo (diálogo de curativos abierto). */
  expeditionDraft: string | null;
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
  setInventoryOpen: (open: boolean) => void;
  equip: (dwellerId: string, itemId: string) => boolean;
  unequip: (dwellerId: string, slot: ItemKind) => boolean;
  scrap: (itemId: string) => boolean;
  craft: (roomId: string, defId: string) => boolean;
  collectCrafted: (roomId: string) => boolean;
  restyle: (dwellerId: string, appearance: Appearance) => boolean;
  setWastelandOpen: (open: boolean) => void;
  openQuest: (questId: string | null) => void;
  setExpeditionDraft: (dwellerId: string | null) => void;
  sendExpedition: (dwellerId: string, stimpaks: number, radaways: number) => boolean;
  recallExplorer: (dwellerId: string) => boolean;
  collectExplorer: (dwellerId: string) => boolean;
  sendQuest: (questId: string, squad: string[]) => boolean;
  advanceQuest: (id: string) => boolean;
  pickQuestLoot: (id: string, spotId: string) => boolean;
  /** Dispara el crítico manual con la precisión del minijuego (0..1). */
  fireCrit: (id: string, accuracy: number) => boolean;
  healInQuest: (id: string, dwellerId: string) => boolean;
  finishQuest: (id: string) => boolean;
  /** Repara al instante una avería en una sala sin puestos de trabajo. */
  repair: (roomId: string) => boolean;
  catchInspector: () => boolean;
  revive: (dwellerId: string) => boolean;
  expel: (dwellerId: string) => boolean;
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
  inventory: s.inventory,
  raid: s.raid,
  expeditions: s.expeditions,
  quests: s.quests,
  nextQuestSerial: s.nextQuestSerial,
  questsDone: s.questsDone,
  inspector: s.inspector,
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
  inventoryOpen: false,
  wastelandOpen: false,
  openQuestId: null,
  expeditionDraft: null,
});

const incidentLabel = (kind: IncidentKind) => INCIDENT_DEFS[kind].label;
const roomName = (grid: GridState, roomId: string) => {
  const room = grid.rooms[roomId];
  return room ? ROOM_DEFS[room.type].name : 'una sala';
};

function describeEvent(e: SimEvent, grid: GridState): Notice {
  switch (e.type) {
    case 'raid-started':
      return notice(`¡${RAID_DEFS[e.kind].name} en la puerta! (${e.enemies})`, 'error');
    case 'door-breached':
      return notice(`¡${capitalize(RAID_DEFS[e.kind].label)} rompieron la puerta y entran al búnker!`, 'error');
    case 'raid-repelled':
      return notice(`Rechazaron a ${RAID_DEFS[e.kind].label}. +${e.codos} Codos.`, 'success');
    case 'raid-left':
      return notice(`${capitalize(RAID_DEFS[e.kind].label)} se fueron con ${Math.round(e.loot.codos)} Codos robados.`, 'error');
    case 'explorer-died':
      return notice(`${e.name} ha muerto en el Yermo. Puedes revivirlo desde el panel del Yermo.`, 'error');
    case 'explorer-back':
      return notice(`${e.name} volvió del Yermo. Recoge su botín.`, 'success');
    case 'quest-arrived':
      return notice(`La escuadra llegó a ${questById(e.questId)?.name ?? 'su destino'}.`, 'info');
    case 'quest-failed':
      return notice('La escuadra ha caído en la misión.', 'error');
    case 'quest-back':
      return notice('La escuadra volvió de la misión. Recoge el botín en la Oficina del Capataz.', 'success');
    case 'inspector-left':
      return notice('El Inspector Fisgón se escabulló…', 'info');
    case 'incident-started':
      return notice(`¡${INCIDENT_DEFS[e.kind].name} en ${roomName(grid, e.roomId)}!`, 'error');
    case 'incident-spread':
      return notice(`${capitalize(incidentLabel(e.kind))} se propagó a ${roomName(grid, e.roomId)}.`, 'error');
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
      return notice(`Controlaron ${incidentLabel(e.kind)}. +${e.codos} Codos.`, 'success');
    case 'trained':
      return notice(`${e.name} subió ${PATRON_NAMES[e.stat]} a ${e.value}.`, 'success');
    case 'recruited':
      return notice(`📻 ${e.name} escuchó la radio y llegó al búnker.`, 'success');
  }
}

/** Orden de importancia: solo se muestra el evento más relevante del tick. */
const EVENT_PRIORITY: SimEvent['type'][] = [
  'raid-started',
  'door-breached',
  'dweller-died',
  'raid-left',
  'raid-repelled',
  'explorer-died',
  'quest-failed',
  'incident-started',
  'incident-spread',
  'explorer-back',
  'quest-back',
  'quest-arrived',
  'inspector-left',
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

function eventNotice(events: SimEvent[], grid: GridState): Notice | null {
  for (const type of EVENT_PRIORITY) {
    const e = events.find((ev) => ev.type === type);
    if (e) return describeEvent(e, grid);
  }
  return null;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

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
      const n = eventNotice(events, data.grid);
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
        : `¡El Exprés falló! Se desató ${incidentLabel(outcome.incident)}.`;
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

    setInventoryOpen: (open) => set({ inventoryOpen: open }),

    equip: (dwellerId, itemId) => {
      const res = equipItem(pickData(get()), dwellerId, itemId);
      if (!res.ok) return fail(res.reason);
      set(res.value);
      return true;
    },

    unequip: (dwellerId, slot) => {
      const res = unequipItem(pickData(get()), dwellerId, slot);
      if (!res.ok) return fail(res.reason);
      set(res.value);
      return true;
    },

    scrap: (itemId) => {
      const state = get();
      const item = state.inventory.items[itemId];
      const res = scrapItem(pickData(state), itemId);
      if (!res.ok || !item) return fail(res.ok ? 'El objeto no existe.' : res.reason);
      const gained = (Object.entries(res.value.junk) as [Rarity, number][])
        .map(([rarity, n]) => `+${n} ${RARITY_NAMES[rarity].toLowerCase()}`)
        .join(', ');
      set({ ...res.value.data, notice: notice(`Desguazaste ${ITEMS[item.defId].name}: chatarra ${gained}.`, 'info') });
      return true;
    },

    craft: (roomId, defId) => {
      const res = startCraft(pickData(get()), roomId, defId);
      if (!res.ok) return fail(res.reason);
      set({ ...res.value, notice: notice(`Fabricando ${ITEMS[defId].name}…`, 'info') });
      return true;
    },

    collectCrafted: (roomId) => {
      const res = collectCraft(pickData(get()), roomId);
      if (!res.ok) return fail(res.reason);
      set({ ...res.value.data, notice: notice(`¡${ITEMS[res.value.item.defId].name} terminado! Está en el inventario.`, 'success') });
      return true;
    },

    setWastelandOpen: (open) => set({ wastelandOpen: open }),
    openQuest: (questId) => set({ openQuestId: questId }),
    setExpeditionDraft: (dwellerId) => set({ expeditionDraft: dwellerId }),

    sendExpedition: (dwellerId, stimpaks, radaways) => {
      const res = startExpedition(pickData(get()), dwellerId, stimpaks, radaways);
      if (!res.ok) return fail(res.reason);
      set({
        ...res.value,
        expeditionDraft: null,
        dwellerModalId: null,
        notice: notice(`${res.value.dwellers[dwellerId].name} salió al Yermo.`, 'info'),
      });
      return true;
    },

    recallExplorer: (dwellerId) => {
      const res = recallExpedition(pickData(get()), dwellerId);
      if (!res.ok) return fail(res.reason);
      set(res.value);
      return true;
    },

    collectExplorer: (dwellerId) => {
      const res = collectExpedition(pickData(get()), dwellerId);
      if (!res.ok) return fail(res.reason);
      const { data, scrapped, expedition } = res.value;
      const extra = scrapped > 0 ? ` (${scrapped} objetos desguazados por falta de sitio)` : '';
      set({ ...data, notice: notice(`Botín: ${lootSummary(expedition.loot)}${extra}.`, 'success') });
      return true;
    },

    sendQuest: (questId, squad) => {
      const res = startQuest(pickData(get()), questId, squad);
      if (!res.ok) return fail(res.reason);
      set({ ...res.value, notice: notice(`La escuadra parte hacia ${questById(questId)?.name}.`, 'info') });
      return true;
    },

    advanceQuest: (id) => {
      const res = advanceQuest(pickData(get()), id);
      if (!res.ok) return fail(res.reason);
      set(res.value);
      return true;
    },

    pickQuestLoot: (id, spotId) => {
      const res = pickLootSpot(pickData(get()), id, spotId);
      if (!res.ok) return fail(res.reason);
      set(res.value);
      return true;
    },

    fireCrit: (id, accuracy) => {
      const res = questCrit(pickData(get()), id, accuracy);
      if (!res.ok) return fail(res.reason);
      set(res.value.data);
      return true;
    },

    healInQuest: (id, dwellerId) => {
      const res = questHeal(pickData(get()), id, dwellerId);
      if (!res.ok) return fail(res.reason);
      set(res.value);
      return true;
    },

    finishQuest: (id) => {
      const res = collectQuest(pickData(get()), id);
      if (!res.ok) return fail(res.reason);
      const { data, scrapped, failed, loot } = res.value;
      const extra = scrapped > 0 ? ` (${scrapped} objetos desguazados por falta de sitio)` : '';
      set({
        ...data,
        openQuestId: null,
        notice: failed
          ? notice('La escuadra volvió sin botín. Puedes revivir a los caídos desde su ficha.', 'info')
          : notice(`Botín de la misión: ${lootSummary(loot)}${extra}.`, 'success'),
      });
      return true;
    },

    repair: (roomId) => {
      const res = repairRoom(pickData(get()), roomId);
      if (!res.ok) return fail(res.reason);
      set({ ...res.value, notice: notice('Avería reparada.', 'success') });
      return true;
    },

    catchInspector: () => {
      const res = catchInspector(pickData(get()));
      if (!res.ok) return fail(res.reason);
      set({ ...res.value.data, notice: notice(`¡Pillaste al Inspector Fisgón! +${res.value.reward} Codos.`, 'success') });
      return true;
    },

    revive: (dwellerId) => {

      const res = reviveDweller(pickData(get()), dwellerId);
      if (!res.ok) return fail(res.reason);
      set({ ...res.value, notice: notice(`${res.value.dwellers[dwellerId].name} ha vuelto a la vida.`, 'success') });
      return true;
    },

    expel: (dwellerId) => {
      const state = get();
      const name = state.dwellers[dwellerId]?.name ?? 'El habitante';
      const res = expelDweller(pickData(state), dwellerId);
      if (!res.ok) return fail(res.reason);
      const extra = res.value.lost > 0 ? ` Se perdieron ${res.value.lost} objetos por falta de sitio.` : '';
      set({ ...res.value.data, dwellerModalId: null, notice: notice(`${name} fue expulsado del búnker.${extra}`, 'info') });
      return true;
    },

    restyle: (dwellerId, appearance) => {

      const res = restyleDweller(pickData(get()), dwellerId, appearance);
      if (!res.ok) return fail(res.reason);
      set({ ...res.value, notice: notice('¡Nuevo look!', 'success') });
      return true;
    },


    dismissNotice: () => set({ notice: null }),
  };
});
