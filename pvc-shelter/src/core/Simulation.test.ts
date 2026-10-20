import { describe, expect, it } from 'vitest';
import { applyRoomChange, canDemolish, createNewGame, demolish } from './Bunker';
import { BLOCK_CELLS, ENERGY_RESERVE_SECONDS, HUNGER_DAMAGE, ROOM_DEFS } from './config';
import { assignDweller, dwellersInRoom } from './Dwellers';
import { GameLoop } from './GameLoop';
import { placeRoom } from './GridManager';
import { canRush, collectResource, cycleTime, rushFailChance, rushRoom } from './Production';
import { advance, allocatePower, requiredEnergy, simulate } from './Simulation';
import type { GameData, Result, RoomType } from './types';

const ELEVATOR_COL = BLOCK_CELLS;

function unwrap<T>(res: Result<T>): T {
  if (!res.ok) throw new Error(res.reason);
  return res.value;
}

/** Partida sin rocas, con recursos abundantes salvo que el test diga otra cosa. */
function newGame(): GameData {
  const data = createNewGame(7);
  return { ...data, grid: { ...data.grid, rocks: {} } };
}

function build(data: GameData, type: RoomType, floor: number, col: number) {
  const change = unwrap(placeRoom(data.grid, type, floor, col));
  return { data: applyRoomChange(data, change), roomId: change.roomId };
}

function assignAll(data: GameData, roomId: string, count: number): GameData {
  const free = Object.values(data.dwellers).filter((d) => d.roomId === null).slice(0, count);
  return free.reduce((acc, d) => unwrap(assignDweller(acc, d.id, roomId)), data);
}

/** RNG que devuelve una secuencia fija (cíclica). */
const fixedRng = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('partida nueva', () => {
  it('arranca con habitantes de ambos sexos y recursos iniciales', () => {
    const data = newGame();
    const dwellers = Object.values(data.dwellers);
    expect(dwellers).toHaveLength(6);
    expect(new Set(dwellers.map((d) => d.sex))).toEqual(new Set(['M', 'F']));
    expect(data.resources.food).toBeGreaterThan(0);
  });
});

describe('habitantes', () => {
  it('respeta la capacidad de la sala (2 por bloque)', () => {
    const { data, roomId } = build(newGame(), 'food', 0, ELEVATOR_COL + 1);
    const full = assignAll(data, roomId, 2);
    const third = Object.values(full.dwellers).find((d) => d.roomId === null)!;
    expect(assignDweller(full, third.id, roomId).ok).toBe(false);
  });

  it('no se puede asignar a ascensores', () => {
    const data = newGame();
    expect(assignDweller(data, 'dweller-1', 'room-2').ok).toBe(false);
  });

  it('al fusionar salas los habitantes pasan a la sala resultante', () => {
    let { data, roomId: first } = build(newGame(), 'water', 0, ELEVATOR_COL + 1);
    data = assignAll(data, first, 2);
    const second = build(data, 'water', 0, ELEVATOR_COL + 1 + BLOCK_CELLS);
    expect(second.data.grid.rooms[first]).toBeUndefined();
    expect(dwellersInRoom(second.data, second.roomId)).toHaveLength(2);
    expect(second.data.runtime[first]).toBeUndefined();
  });

  it('no se puede demoler una sala ocupada', () => {
    let { data, roomId } = build(newGame(), 'food', 0, ELEVATOR_COL + 1);
    data = assignAll(data, roomId, 1);
    expect(canDemolish(data, roomId).ok).toBe(false);
    const freed = unwrap(assignDweller(data, dwellersInRoom(data, roomId)[0].id, null));
    expect(unwrap(demolish(freed, roomId)).grid.rooms[roomId]).toBeUndefined();
  });
});

describe('ciclos de producción', () => {
  it('una sala vacía no produce', () => {
    const { data, roomId } = build(newGame(), 'food', 0, ELEVATOR_COL + 1);
    const after = advance(data, 120).data;
    expect(after.runtime[roomId].ready).toBe(false);
  });

  it('mejores stats acortan el ciclo', () => {
    const { data, roomId } = build(newGame(), 'power', 0, ELEVATOR_COL + 1);
    const room = data.grid.rooms[roomId];
    const base = Object.values(data.dwellers)[0];
    const weak = { ...base, stats: { ...base.stats, P: 2 } };
    const strong = { ...base, stats: { ...base.stats, P: 8 } };
    expect(cycleTime(room, [strong])!).toBeLessThan(cycleTime(room, [weak])!);
    expect(cycleTime(room, [])).toBeNull();
  });

  it('completa el ciclo, espera la recolección y suma recursos', () => {
    let { data, roomId } = build(newGame(), 'power', 0, ELEVATOR_COL + 1);
    data = assignAll(data, roomId, 2);
    const t = cycleTime(data.grid.rooms[roomId], dwellersInRoom(data, roomId))!;
    // Con felicidad 0% el ciclo dura hasta t / 0.75: margen para cualquier felicidad.
    data = advance(data, t / 0.75 + 1).data;
    expect(data.runtime[roomId].ready).toBe(true);

    const before = data.resources.energy;
    const { data: collected, summary } = unwrap(collectResource(data, 'energy', fixedRng(0.99)));
    expect(summary.stored).toBeGreaterThan(0);
    expect(collected.resources.energy).toBeGreaterThan(before);
    expect(collected.runtime[roomId]).toMatchObject({ ready: false, progress: 0 });
    expect(dwellersInRoom(collected, roomId)[0].xp).toBeGreaterThan(0);
  });

  it('da Codos de PVC cuando la tirada de Rebusque acierta', () => {
    let { data, roomId } = build(newGame(), 'power', 0, ELEVATOR_COL + 1);
    data = assignAll(data, roomId, 2);
    data = { ...data, runtime: { ...data.runtime, [roomId]: { ...data.runtime[roomId], ready: true } } };
    const lucky = unwrap(collectResource(data, 'energy', fixedRng(0, 0.5)));
    const unlucky = unwrap(collectResource(data, 'energy', fixedRng(0.99)));
    expect(lucky.summary.codos).toBeGreaterThan(0);
    expect(unlucky.summary.codos).toBe(0);
  });
});

describe('consumo', () => {
  it('sin comida los habitantes pierden HP', () => {
    const data = { ...newGame(), resources: { ...newGame().resources, food: 0 } };
    const after = advance(data, 10).data;
    const d = Object.values(after.dwellers)[0];
    expect(d.hp).toBeCloseTo(100 - HUNGER_DAMAGE * 10, 5);
  });

  it('sin agua los habitantes se intoxican y baja su HP máximo efectivo', () => {
    const data = { ...newGame(), resources: { ...newGame().resources, water: 0 } };
    const after = advance(data, 20).data;
    const d = Object.values(after.dwellers)[0];
    expect(d.intox).toBeGreaterThan(0);
    expect(d.hp).toBeLessThanOrEqual(d.maxHp - d.intox);
  });

  it('un habitante muere al llegar a 0 HP y emite evento', () => {
    const base = newGame();
    const first = Object.values(base.dwellers)[0];
    const data: GameData = {
      ...base,
      resources: { ...base.resources, food: 0 },
      dwellers: { ...base.dwellers, [first.id]: { ...first, hp: 0.1 } },
    };
    const res = simulate(data, 1);
    expect(res.data.dwellers[first.id].alive).toBe(false);
    expect(res.events.some((e) => e.type === 'dweller-died')).toBe(true);
  });
});

describe('energía', () => {
  /** Generador junto al ascensor del piso 0 y dos consumidores, uno cerca y otro lejos. */
  function poweredBunker() {
    let data = newGame();
    data = build(data, 'power', 0, ELEVATOR_COL + 1).data;
    data = build(data, 'elevator', 1, ELEVATOR_COL).data;
    const near = build(data, 'food', 1, ELEVATOR_COL + 1);
    data = near.data;
    data = build(data, 'elevator', 2, ELEVATOR_COL).data;
    data = build(data, 'elevator', 3, ELEVATOR_COL).data;
    const far = build(data, 'water', 3, ELEVATOR_COL + 1);
    return { data: far.data, near: near.roomId, far: far.roomId };
  }

  it('con energía suficiente todas las salas funcionan', () => {
    const { data, near, far } = poweredBunker();
    const powered = allocatePower(data.grid, requiredEnergy(data.grid));
    expect(powered.has(near) && powered.has(far)).toBe(true);
  });

  it('bajo el mínimo se apaga primero la sala más lejana al generador', () => {
    const { data, near, far } = poweredBunker();
    const nearDraw = ROOM_DEFS.food.energyDraw * ENERGY_RESERVE_SECONDS;
    const powered = allocatePower(data.grid, nearDraw);
    expect(powered.has(near)).toBe(true);
    expect(powered.has(far)).toBe(false);
  });

  it('una sala sin energía no avanza su ciclo', () => {
    let { data, far } = poweredBunker();
    data = assignAll(data, far, 2);
    data = { ...data, resources: { ...data.resources, energy: 0 } };
    const after = advance(data, 60).data;
    expect(after.runtime[far].powered).toBe(false);
    expect(after.runtime[far].progress).toBe(0);
  });
});

describe('modo Exprés', () => {
  function staffedRoom() {
    let { data, roomId } = build(newGame(), 'water', 0, ELEVATOR_COL + 1);
    data = assignAll(data, roomId, 2);
    return { data, roomId };
  }

  it('requiere habitantes', () => {
    const { data, roomId } = build(newGame(), 'water', 0, ELEVATOR_COL + 1);
    expect(canRush(data, roomId).ok).toBe(false);
  });

  it('en éxito produce al instante, da Codos y XP', () => {
    const { data, roomId } = staffedRoom();
    const { data: after, outcome } = unwrap(rushRoom(data, roomId, fixedRng(0.99, 0.99, 0.5)));
    expect(outcome.success).toBe(true);
    expect(after.resources.codos).toBeGreaterThan(data.resources.codos);
    expect(after.resources.water).toBeGreaterThan(data.resources.water);
    expect(dwellersInRoom(after, roomId)[0].xp).toBeGreaterThan(0);
  });

  it('cada uso consecutivo aumenta el % de fallo', () => {
    const { data, roomId } = staffedRoom();
    const room = data.grid.rooms[roomId];
    const workers = dwellersInRoom(data, roomId);
    const first = rushFailChance(room, data.runtime[roomId], workers);
    const after = unwrap(rushRoom(data, roomId, fixedRng(0.99))).data;
    expect(rushFailChance(room, after.runtime[roomId], workers)).toBeGreaterThan(first);
  });

  it('en fallo provoca un incidente que bloquea la producción hasta resolverse', () => {
    const { data, roomId } = staffedRoom();
    const { data: after, outcome } = unwrap(rushRoom(data, roomId, fixedRng(0)));
    expect(outcome.success).toBe(false);
    expect(after.runtime[roomId].incident).not.toBeNull();
    expect(canRush(after, roomId).ok).toBe(false);

    const res = advance(after, 120);
    expect(res.data.runtime[roomId].incident).toBeNull();
    expect(res.events.some((e) => e.type === 'incident-resolved')).toBe(true);
    // Combatirlo hizo daño a los habitantes de la sala.
    expect(dwellersInRoom(res.data, roomId).some((d) => d.hp < 100)).toBe(true);
  });
});

describe('GameLoop', () => {
  it('entrega el tiempo real en pasos fijos y acumula el resto', () => {
    let now = 0;
    const ticks: number[] = [];
    const loop = new GameLoop((s) => ticks.push(s), () => now);
    loop.start();
    now = 600; // 0.6 s -> 2 pasos de 0.25 y sobran 0.1
    loop.frame();
    now = 760; // +0.16 -> 0.26 acumulado -> 1 paso
    loop.frame();
    loop.stop();
    expect(ticks).toEqual([0.5, 0.25]);
  });
});
