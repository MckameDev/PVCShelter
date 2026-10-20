import { describe, expect, it } from 'vitest';
import { applyRoomChange, canBuildType, createNewGame } from './Bunker';
import { BLOCK_CELLS, MAX_BASE_STAT, ROOM_DEFS, STIMPAK_HEAL } from './config';
import { assignDweller, populationCap } from './Dwellers';
import { itemCapacity, roomCapacity, storageCap } from './Economy';
import { placeRoom, upgradeRoom } from './GridManager';
import { applyMed, canApplyMed } from './Health';
import { radioHappinessBonus, trainingSeconds } from './LifeCycle';
import { collectResource, cycleTime } from './Production';
import { advance } from './Simulation';
import type { Dweller, GameData, Result, RoomType } from './types';

const E = BLOCK_CELLS;

function unwrap<T>(res: Result<T>): T {
  if (!res.ok) throw new Error(res.reason);
  return res.value;
}

function newGame(): GameData {
  const data = createNewGame(21);
  return {
    ...data,
    grid: { ...data.grid, rocks: {} },
    resources: { ...data.resources, energy: 50_000, food: 50_000, water: 50_000 },
  };
}

function build(data: GameData, type: RoomType, floor = 0, col = E + 1) {
  const change = unwrap(placeRoom(data.grid, type, floor, col));
  return { data: applyRoomChange(data, change), roomId: change.roomId };
}

function patch(data: GameData, id: string, changes: Partial<Dweller>): GameData {
  return { ...data, dwellers: { ...data.dwellers, [id]: { ...data.dwellers[id], ...changes } } };
}

const first = (data: GameData) => Object.values(data.dwellers)[0];

describe('desbloqueo por población', () => {
  it('la Enfermería exige 12 habitantes', () => {
    const data = newGame();
    expect(ROOM_DEFS.medbay.unlockPopulation).toBe(12);
    expect(canBuildType(data, 'medbay').ok).toBe(false);
    expect(canBuildType(data, 'power').ok).toBe(true);

    const dwellers = { ...data.dwellers };
    for (let i = 0; i < 6; i++) dwellers[`extra-${i}`] = { ...first(data), id: `extra-${i}` };
    expect(canBuildType({ ...data, dwellers }, 'medbay').ok).toBe(true);
  });

  it('el Gimnasio de Poderío exige 24 habitantes', () => {
    expect(ROOM_DEFS['train-P'].unlockPopulation).toBe(24);
  });
});

describe('salud', () => {
  it('la Enfermería produce Vendas Caseras con tope propio', () => {
    let { data, roomId } = build(newGame(), 'medbay');
    data = unwrap(assignDweller(data, first(data).id, roomId));
    const t = cycleTime(data.grid.rooms[roomId], [first(data)])!;
    data = advance(data, t / 0.75 + 1).data;
    const before = data.resources.stimpaks;
    const { data: after } = unwrap(collectResource(data, 'stimpaks', () => 0.99));
    expect(after.resources.stimpaks).toBe(before + 1);
    expect(storageCap(after.grid, 'stimpaks')).toBeGreaterThan(storageCap(newGame().grid, 'stimpaks'));
  });

  it('una venda cura HP y se gasta', () => {
    let data = newGame();
    const d = first(data);
    data = patch(data, d.id, { hp: 30 });
    const healed = unwrap(applyMed(data, d.id, 'stimpaks'));
    expect(healed.dwellers[d.id].hp).toBe(30 + STIMPAK_HEAL);
    expect(healed.resources.stimpaks).toBe(data.resources.stimpaks - 1);
  });

  it('un desintoxicante quita intoxicación; no se gasta si no hace falta', () => {
    let data = newGame();
    const d = first(data);
    expect(canApplyMed(data, d.id, 'radaways').ok).toBe(false);
    expect(canApplyMed(data, d.id, 'stimpaks').ok).toBe(false); // HP lleno
    data = patch(data, d.id, { intox: 50, hp: 50 });
    expect(unwrap(applyMed(data, d.id, 'radaways')).dwellers[d.id].intox).toBe(10);
    expect(canApplyMed({ ...data, resources: { ...data.resources, radaways: 0 } }, d.id, 'radaways').ok).toBe(false);
  });
});

describe('almacenes y barracones', () => {
  it('el Almacén amplía el inventario y no tiene puestos de trabajo', () => {
    const base = itemCapacity(newGame().grid);
    const { data, roomId } = build(newGame(), 'storage');
    expect(itemCapacity(data.grid)).toBeGreaterThan(base);
    expect(roomCapacity(data.grid.rooms[roomId])).toBe(0);
  });

  it('los Barracones suben la población máxima', () => {
    const base = populationCap(newGame().grid);
    const { data, roomId } = build(newGame(), 'barracks');
    const one = populationCap(data.grid);
    expect(one).toBeGreaterThan(base);
    const upgraded = unwrap(upgradeRoom(data.grid, roomId)).grid;
    expect(populationCap(upgraded)).toBeGreaterThan(one);
  });
});

describe('entrenamiento', () => {
  it('sube el stat base de quien entrena', () => {
    let { data, roomId } = build(newGame(), 'train-P');
    const d = first(data);
    data = patch(data, d.id, { stats: { ...d.stats, P: 3 } });
    data = unwrap(assignDweller(data, d.id, roomId));
    const after = advance(data, trainingSeconds(3, data.grid.rooms[roomId]) + 1);
    expect(after.data.dwellers[d.id].stats.P).toBe(4);
    expect(after.events.some((e) => e.type === 'trained')).toBe(true);
  });

  it('no supera 10', () => {
    let { data, roomId } = build(newGame(), 'train-A');
    const d = first(data);
    data = patch(data, d.id, { stats: { ...d.stats, A: MAX_BASE_STAT } });
    data = unwrap(assignDweller(data, d.id, roomId));
    expect(advance(data, 1000).data.dwellers[d.id].stats.A).toBe(MAX_BASE_STAT);
  });

  it('una sala mejorada entrena más rápido', () => {
    const { data, roomId } = build(newGame(), 'train-T');
    const room = data.grid.rooms[roomId];
    expect(trainingSeconds(5, { ...room, level: 3 })).toBeLessThan(trainingSeconds(5, room));
  });
});

describe('radio', () => {
  function staffedRadio(o: number) {
    let { data, roomId } = build(newGame(), 'radio');
    for (const d of Object.values(data.dwellers).slice(0, 2)) {
      data = patch(data, d.id, { stats: { ...d.stats, O: o } });
      data = unwrap(assignDweller(data, d.id, roomId));
    }
    return { data, roomId };
  }

  it('sube la felicidad global solo con personal y energía', () => {
    const { data } = staffedRadio(5);
    const rooms = Object.values(data.grid.rooms);
    const staffed = radioHappinessBonus(rooms, data.runtime, () => true);
    expect(staffed).toBeGreaterThan(0);
    expect(radioHappinessBonus(rooms, data.runtime, () => false)).toBe(0);
  });

  it('atrae nuevos habitantes del exterior', () => {
    const { data } = staffedRadio(10);
    const res = advance(data, 900);
    expect(res.events.some((e) => e.type === 'recruited')).toBe(true);
    expect(Object.keys(res.data.dwellers).length).toBeGreaterThan(Object.keys(data.dwellers).length);
  });
});
