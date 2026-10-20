import { describe, expect, it } from 'vitest';
import { applyRoomChange, createNewGame } from './Bunker';
import { BLOCK_CELLS, CHILDHOOD_SECONDS, COURTSHIP_SECONDS, PREGNANCY_SECONDS } from './config';
import { areRelated, assignDweller, dwellersInRoom, globalHappiness, populationCap, xpToNextLevel } from './Dwellers';
import { placeRoom } from './GridManager';
import { cycleTime } from './Production';
import { advance, simulate } from './Simulation';
import type { Dweller, GameData, Result, RoomType } from './types';

const E = BLOCK_CELLS;

function unwrap<T>(res: Result<T>): T {
  if (!res.ok) throw new Error(res.reason);
  return res.value;
}

/** Partida sin rocas y con recursos de sobra para que nadie muera de hambre. */
function newGame(): GameData {
  const data = createNewGame(11);
  return {
    ...data,
    grid: { ...data.grid, rocks: {} },
    resources: { ...data.resources, energy: 10_000, food: 10_000, water: 10_000 },
  };
}

function build(data: GameData, type: RoomType, floor: number, col: number) {
  const change = unwrap(placeRoom(data.grid, type, floor, col));
  return { data: applyRoomChange(data, change), roomId: change.roomId };
}

const bySex = (data: GameData, sex: Dweller['sex']) => Object.values(data.dwellers).filter((d) => d.sex === sex);

function patch(data: GameData, id: string, changes: Partial<Dweller>): GameData {
  return { ...data, dwellers: { ...data.dwellers, [id]: { ...data.dwellers[id], ...changes } } };
}

/** Sala de Descanso con un hombre y una mujer dentro. */
function couple() {
  const { data: built, roomId } = build(newGame(), 'living', 0, E + 1);
  const man = bySex(built, 'M')[0];
  const woman = bySex(built, 'F')[0];
  let data = unwrap(assignDweller(built, man.id, roomId));
  data = unwrap(assignDweller(data, woman.id, roomId));
  return { data, roomId, man, woman };
}

describe('niveles', () => {
  it('trabajar da XP y subir de nivel cura, sube el HP máximo y da Codos', () => {
    let { data, roomId } = build(newGame(), 'power', 0, E + 1);
    const worker = bySex(data, 'M')[0];
    data = unwrap(assignDweller(data, worker.id, roomId));
    data = patch(data, worker.id, { xp: xpToNextLevel(1) - 0.01, hp: 50 });
    const codos = data.resources.codos;

    const res = simulate(data, 1);
    const after = res.data.dwellers[worker.id];
    expect(after.level).toBe(2);
    expect(after.maxHp).toBeGreaterThan(100);
    expect(after.hp).toBe(after.maxHp);
    expect(res.data.resources.codos).toBeGreaterThan(codos);
    expect(res.events.some((e) => e.type === 'level-up')).toBe(true);
  });
});

describe('felicidad', () => {
  it('sube trabajando en la sala de su mejor stat y baja sin ocupación', () => {
    let { data, roomId } = build(newGame(), 'power', 0, E + 1);
    const [a, b] = bySex(data, 'M');
    data = patch(data, a.id, { stats: { ...a.stats, P: 10 }, happiness: 50 });
    data = patch(data, b.id, { happiness: 50 });
    data = unwrap(assignDweller(data, a.id, roomId));

    const after = advance(data, 60).data;
    expect(after.dwellers[a.id].happiness).toBeGreaterThan(50);
    expect(after.dwellers[b.id].happiness).toBeLessThan(50);
  });

  it('una felicidad global alta acorta el ciclo de producción', () => {
    const { data, roomId } = build(newGame(), 'food', 0, E + 1);
    const room = data.grid.rooms[roomId];
    const workers = [bySex(data, 'M')[0]];
    expect(cycleTime(room, workers, 1)!).toBeLessThan(cycleTime(room, workers, 0)!);
    expect(globalHappiness(data)).toBeGreaterThan(0);
  });
});

describe('reproducción', () => {
  it('una pareja en la Sala de Descanso termina en embarazo', () => {
    const { data, woman } = couple();
    const after = advance(data, COURTSHIP_SECONDS * 3).data;
    expect(after.dwellers[woman.id].pregnancy).not.toBeNull();
  });

  it('más Optimismo (O) acelera el cortejo', () => {
    const { data, man, woman } = couple();
    const low = patch(patch(data, man.id, { stats: { ...man.stats, O: 1 } }), woman.id, { stats: { ...woman.stats, O: 1 } });
    const high = patch(patch(data, man.id, { stats: { ...man.stats, O: 10 } }), woman.id, { stats: { ...woman.stats, O: 10 } });
    const progress = (d: GameData) => advance(d, 5).data.dwellers[woman.id].courtship?.progress ?? 0;
    expect(progress(high)).toBeGreaterThan(progress(low));
  });

  it('no empareja familiares', () => {
    const { data, man, woman } = couple();
    const related = patch(data, woman.id, { parents: [man.id, 'otra'] });
    expect(areRelated(related.dwellers[man.id], related.dwellers[woman.id])).toBe(true);
    const after = advance(related, COURTSHIP_SECONDS * 3).data;
    expect(after.dwellers[woman.id].pregnancy).toBeNull();
  });

  it('nace un niño que no puede trabajar y crece hasta ser adulto', () => {
    const { data, man, woman } = couple();
    const ready = patch(data, woman.id, { pregnancy: { fatherId: man.id, elapsed: PREGNANCY_SECONDS - 1 } });
    const born = advance(ready, 2);
    expect(born.events.some((e) => e.type === 'birth')).toBe(true);
    const child = Object.values(born.data.dwellers).find((d) => d.parents)!;
    expect(child.childTime).toBeGreaterThan(0);
    expect(child.name.split(' ')[1]).toBe(man.name.split(' ')[1]);
    expect(born.data.dwellers[woman.id].pregnancy).toBeNull();

    // Los niños no trabajan, pero comen.
    expect(assignDweller(born.data, child.id, 'room-2').ok).toBe(false);
    const roomId = Object.values(born.data.grid.rooms).find((r) => r.type === 'living')!.id;
    expect(assignDweller(born.data, child.id, roomId).ok).toBe(false);
    const before = born.data.resources.food;
    expect(simulate(born.data, 10).data.resources.food).toBeLessThan(before);

    const grown = advance(born.data, CHILDHOOD_SECONDS + 1);
    expect(grown.data.dwellers[child.id].childTime).toBe(0);
    expect(grown.events.some((e) => e.type === 'grew-up')).toBe(true);
  });

  it('el parto espera si la población está al máximo', () => {
    let { data, man, woman } = couple();
    data = patch(data, woman.id, { pregnancy: { fatherId: man.id, elapsed: PREGNANCY_SECONDS } });
    const cap = populationCap(data.grid);
    // Rellenar con clones hasta el tope.
    const dwellers = { ...data.dwellers };
    for (let i = Object.keys(dwellers).length; i < cap; i++) dwellers[`clone-${i}`] = { ...man, id: `clone-${i}`, roomId: null };
    data = { ...data, dwellers };
    const after = advance(data, 5);
    expect(after.events.some((e) => e.type === 'birth')).toBe(false);
    expect(after.data.dwellers[woman.id].pregnancy).not.toBeNull();
  });

  it('las embarazadas huyen de los incidentes', () => {
    let { data, roomId } = build(newGame(), 'water', 0, E + 1);
    const woman = bySex(data, 'F')[0];
    data = unwrap(assignDweller(data, woman.id, roomId));
    data = patch(data, woman.id, { pregnancy: { fatherId: 'x', elapsed: 0 } });
    data = {
      ...data,
      runtime: { ...data.runtime, [roomId]: { ...data.runtime[roomId], incident: { kind: 'fire', hp: 100, maxHp: 100, spread: 0 } } },
    };
    const res = simulate(data, 0.25);
    expect(res.data.dwellers[woman.id].roomId).toBeNull();
    expect(res.data.dwellers[woman.id].hp).toBe(100);
    expect(res.events.some((e) => e.type === 'fled')).toBe(true);
    expect(dwellersInRoom(res.data, roomId)).toHaveLength(0);
    // Y no puede volver a entrar mientras dure.
    expect(assignDweller(res.data, woman.id, roomId).ok).toBe(false);
  });
});
