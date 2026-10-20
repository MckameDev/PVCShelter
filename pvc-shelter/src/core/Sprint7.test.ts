import { describe, expect, it } from 'vitest';
import { applyRoomChange, createNewGame } from './Bunker';
import { BLOCK_CELLS, CRIT_MULTIPLIERS, INSPECTOR_VISIBLE_SECONDS, WASTELAND_EVENT_SECONDS } from './config';
import { assignDweller } from './Dwellers';
import { placeRoom } from './GridManager';
import { catchInspector, inspectorReward } from './Inspector';
import { ITEMS } from './items';
import { questById } from './questCatalog';
import { advanceQuest, canStartQuest, collectQuest, critMultiplier, pickLootSpot, questCrit, startQuest } from './Quests';
import { reviveDweller } from './Revival';
import { advance, simulate } from './Simulation';
import type { Dweller, GameData, Result, RoomType } from './types';
import { collectExpedition, recallExpedition, startExpedition } from './Wasteland';

const E = BLOCK_CELLS;

function unwrap<T>(res: Result<T>): T {
  if (!res.ok) throw new Error(res.reason);
  return res.value;
}

function newGame(seed = 55): GameData {
  const data = createNewGame(seed);
  return {
    ...data,
    grid: { ...data.grid, rocks: {} },
    resources: { ...data.resources, energy: 50_000, food: 50_000, water: 50_000, stimpaks: 10, radaways: 10 },
  };
}

function build(data: GameData, type: RoomType, floor = 0, col = E + 1) {
  const change = unwrap(placeRoom(data.grid, type, floor, col));
  return { data: applyRoomChange(data, change), roomId: change.roomId };
}

function patch(data: GameData, id: string, changes: Partial<Dweller>): GameData {
  return { ...data, dwellers: { ...data.dwellers, [id]: { ...data.dwellers[id], ...changes } } };
}

const firstId = (data: GameData) => Object.keys(data.dwellers)[0];

/** Habitante muy fuerte (P alto y arma legendaria) para despejar misiones. */
function makeTough(data: GameData, id: string): GameData {
  const d = data.dwellers[id];
  const bazooka = { id: `item-tough-${id}`, defId: 'drum-bazooka' };
  return patch(data, id, {
    stats: { ...d.stats, P: 10, T: 10 },
    maxHp: 400,
    hp: 400,
    equipment: { ...d.equipment, weapon: bazooka },
  });
}

describe('Yermo', () => {
  it('salir descuenta curativos y saca al habitante del búnker', () => {
    const data = newGame();
    const id = firstId(data);
    const out = unwrap(startExpedition(data, id, 3, 2));
    expect(out.resources.stimpaks).toBe(data.resources.stimpaks - 3);
    expect(out.dwellers[id].location).toBe('wasteland');
    expect(assignDweller(out, id, 'room-1').ok).toBe(false);
    // No consume comida del búnker.
    const fed = simulate(out, 10).data.resources.food;
    const all = simulate(data, 10).data.resources.food;
    expect(fed).toBeGreaterThan(all);
  });

  it('genera un evento por minuto en el registro, de forma reproducible', () => {
    const data = unwrap(startExpedition(newGame(), firstId(newGame()), 10, 10));
    const a = advance(data, WASTELAND_EVENT_SECONDS * 10 + 1).data.expeditions[firstId(data)];
    const b = advance(data, WASTELAND_EVENT_SECONDS * 10 + 1).data.expeditions[firstId(data)];
    expect(a.events).toBe(10);
    expect(a.log.length).toBeGreaterThanOrEqual(11);
    expect(a.log).toEqual(b.log);
  });

  it('nunca encuentra mascotas', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      let data = newGame(seed);
      const id = firstId(data);
      data = makeTough(data, id);
      data = unwrap(startExpedition(data, id, 10, 10));
      const exp = advance(data, 3600).data.expeditions[id];
      expect(exp.loot.items.every((defId) => ITEMS[defId].kind !== 'pet')).toBe(true);
    }
  });

  it('regresar tarda la mitad de lo explorado y al recoger entrega el botín', () => {
    let data = unwrap(startExpedition(newGame(), firstId(newGame()), 2, 2));
    const id = firstId(data);
    data = makeTough(data, id);
    data = advance(data, 600).data;
    data = unwrap(recallExpedition(data, id));
    expect(data.expeditions[id].returnLeft).toBeCloseTo(300, 0);
    data = advance(data, 299).data;
    expect(data.expeditions[id].status).toBe('returning');
    data = advance(data, 2).data;
    expect(data.expeditions[id].status).toBe('back');

    const before = data.resources.codos;
    const exp = data.expeditions[id];
    const { data: after } = unwrap(collectExpedition(data, id));
    expect(after.resources.codos).toBe(before + Math.round(exp.loot.codos));
    expect(after.resources.stimpaks).toBe(data.resources.stimpaks + exp.stimpaks);
    expect(after.dwellers[id].location).toBe('bunker');
    expect(after.expeditions[id]).toBeUndefined();
  });

  it('puede morir fuera; al revivirlo emprende la vuelta con su botín', () => {
    let data = newGame();
    const id = firstId(data);
    data = patch(data, id, { hp: 1 });
    data = unwrap(startExpedition(data, id, 0, 0));
    const res = advance(data, 1800);
    expect(res.data.expeditions[id].status).toBe('dead');
    expect(res.events.some((e) => e.type === 'explorer-died')).toBe(true);
    const revived = unwrap(reviveDweller(res.data, id));
    expect(revived.expeditions[id].status).toBe('returning');
    expect(revived.dwellers[id].alive).toBe(true);
  });
});

describe('misiones', () => {
  function withOverseer() {
    const { data } = build(newGame(), 'overseer');
    return data;
  }

  it('necesitan Oficina del Capataz y una escuadra de 1 a 3', () => {
    const data = newGame();
    const ids = Object.keys(data.dwellers);
    expect(canStartQuest(data, 'hardware-store', [ids[0]]).ok).toBe(false);
    const office = withOverseer();
    expect(canStartQuest(office, 'hardware-store', ids.slice(0, 4)).ok).toBe(false);
    expect(canStartQuest(office, 'hardware-store', ids.slice(0, 3)).ok).toBe(true);
  });

  it('viajan, revelan salas una a una y combaten solos', () => {
    let data = withOverseer();
    const id = firstId(data);
    data = makeTough(data, id);
    data = unwrap(startQuest(data, 'hardware-store', [id]));
    expect(data.dwellers[id].location).toBe('quest');
    const def = questById('hardware-store')!;
    data = advance(data, def.travelSeconds + 0.5).data;
    expect(data.quest?.status).toBe('exploring');
    expect(data.quest?.revealed).toEqual([true, false, false, false]);
    expect(data.quest?.enemies.length).toBeGreaterThan(0);

    // No se puede avanzar ni recoger botín con enemigos vivos.
    expect(advanceQuest(data).ok).toBe(false);
    expect(pickLootSpot(data, data.quest!.spots[0].id).ok).toBe(false);
    data = advance(data, 30).data;
    expect(data.quest?.enemies.every((e) => e.hp <= 0)).toBe(true);
    data = unwrap(pickLootSpot(data, data.quest!.spots[0].id));
    expect(data.quest?.loot.codos).toBeGreaterThan(0);
  });

  it('el crítico manual escala con la puntería', () => {
    expect(critMultiplier(1).mult).toBe(CRIT_MULTIPLIERS[0].mult);
    expect(critMultiplier(0).mult).toBe(0);

    let data = withOverseer();
    const id = firstId(data);
    data = unwrap(startQuest(data, 'landfill', [id]));
    data = advance(data, questById('landfill')!.travelSeconds + 0.25).data;
    expect(questCrit(data, 1).ok).toBe(false); // aún sin cargar
    const charged = { ...data, quest: { ...data.quest!, critCharge: 1 } };
    const perfect = unwrap(questCrit(charged, 1)).damage;
    const weak = unwrap(questCrit(charged, 0.4)).damage;
    expect(perfect).toBeGreaterThan(weak);
    expect(unwrap(questCrit(charged, 0)).damage).toBe(0);
  });

  it('completar la misión da recompensa, planos y devuelve a la escuadra', () => {
    let data = withOverseer();
    const id = firstId(data);
    data = makeTough(data, id);
    data = unwrap(startQuest(data, 'hardware-store', [id]));
    const def = questById('hardware-store')!;
    data = advance(data, def.travelSeconds + 0.5).data;
    for (let room = 0; room < def.rooms.length; room++) {
      data = advance(data, 30).data;
      for (const spot of data.quest!.spots) data = unwrap(pickLootSpot(data, spot.id));
      data = unwrap(advanceQuest(data));
    }
    expect(data.quest?.status).toBe('returning');
    data = advance(data, def.travelSeconds + 0.5).data;
    expect(data.quest?.status).toBe('done');

    const before = data.resources.codos;
    const { data: after, failed } = unwrap(collectQuest(data));
    expect(failed).toBe(false);
    expect(after.resources.codos).toBeGreaterThan(before + def.rewardCodos);
    expect(after.inventory.recipes).toContain('potato-cannon');
    expect(after.questsDone).toContain('hardware-store');
    expect(after.dwellers[id].location).toBe('bunker');
    expect(after.quest).toBeNull();
  });

  it('si cae toda la escuadra vuelven sin botín', () => {
    let data = withOverseer();
    const id = firstId(data);
    data = patch(data, id, { hp: 5 });
    data = unwrap(startQuest(data, 'treatment-plant', [id]));
    const res = advance(data, questById('treatment-plant')!.travelSeconds + 10);
    expect(res.events.some((e) => e.type === 'quest-failed')).toBe(true);
    expect(res.data.quest?.failed).toBe(true);
    expect(res.data.quest?.loot.codos).toBe(0);
  });
});

describe('Inspector Fisgón', () => {
  it('aparece un rato, se va si nadie lo atrapa y da Codos si lo atrapan', () => {
    const data = newGame();
    let seen: GameData | null = null;
    let current = data;
    for (let i = 0; i < 400 && !seen; i++) {
      current = advance(current, 15).data;
      if (current.inspector) seen = current;
    }
    expect(seen).not.toBeNull();
    const { data: caught, reward } = unwrap(catchInspector(seen!));
    expect(reward).toBe(inspectorReward(seen!));
    expect(caught.resources.codos).toBe(seen!.resources.codos + reward);
    expect(caught.inspector).toBeNull();

    const gone = advance(seen!, INSPECTOR_VISIBLE_SECONDS + 1);
    expect(gone.data.inspector?.roomId === seen!.inspector!.roomId && gone.data.inspector?.timeLeft === seen!.inspector!.timeLeft).toBe(false);
    expect(gone.events.some((e) => e.type === 'inspector-left')).toBe(true);
  });
});
