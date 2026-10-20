import { describe, expect, it } from 'vitest';
import { applyRoomChange, createNewGame } from './Bunker';
import { BLOCK_CELLS, DEATH_HAPPINESS_PENALTY, DOOR_HP, INCIDENT_SPREAD_SECONDS, RAID_STEAL_SECONDS } from './config';
import { createIncident, damageEnemies, dwellerDps, splitDamage } from './Combat';
import { assignDweller } from './Dwellers';
import { placeRoom, upgradeRoom } from './GridManager';
import { adjacentRooms } from './Incidents';
import { equipItem } from './Inventory';
import { createRaid, raidRoute } from './Raids';
import { canRevive, expelDweller, reviveCost, reviveDweller } from './Revival';
import { advance, simulate } from './Simulation';
import type { Dweller, GameData, IncidentKind, Result, RoomType } from './types';

const E = BLOCK_CELLS;

function unwrap<T>(res: Result<T>): T {
  if (!res.ok) throw new Error(res.reason);
  return res.value;
}

function newGame(): GameData {
  const data = createNewGame(44);
  return {
    ...data,
    grid: { ...data.grid, rocks: {} },
    resources: { ...data.resources, energy: 50_000, food: 50_000, water: 50_000 },
  };
}

function build(data: GameData, type: RoomType, floor: number, col: number) {
  const change = unwrap(placeRoom(data.grid, type, floor, col));
  return { data: applyRoomChange(data, change), roomId: change.roomId };
}

function patch(data: GameData, id: string, changes: Partial<Dweller>): GameData {
  return { ...data, dwellers: { ...data.dwellers, [id]: { ...data.dwellers[id], ...changes } } };
}

function withIncident(data: GameData, roomId: string, kind: IncidentKind): GameData {
  const incident = createIncident(kind, data.grid.rooms[roomId]);
  return { ...data, runtime: { ...data.runtime, [roomId]: { ...data.runtime[roomId], incident } } };
}

const ids = (data: GameData) => Object.keys(data.dwellers);

/** Puerta + ascensor + [food 4-6][water 7-9] en el piso 0 y [power 4-6] en el piso 1. */
function bunker() {
  let data = newGame();
  const food = build(data, 'food', 0, E + 1);
  data = food.data;
  const water = build(data, 'water', 0, E + 4);
  data = water.data;
  data = build(data, 'elevator', 1, E).data;
  const power = build(data, 'power', 1, E + 1);
  return { data: power.data, food: food.roomId, water: water.roomId, power: power.roomId };
}

describe('combate', () => {
  it('el daño recibido se reparte a partes iguales', () => {
    const data = newGame();
    const [a, b] = Object.values(data.dwellers);
    const damage = new Map<string, number>();
    splitDamage([a, b], 10, damage);
    expect(damage.get(a.id)).toBe(5);
    expect(damage.get(b.id)).toBe(5);
  });

  it('el arma suma al daño infligido', () => {
    let data = newGame();
    const d = Object.values(data.dwellers)[0];
    const bare = dwellerDps(d);
    const pipe = Object.values(data.inventory.items).find((i) => i.defId === 'lead-pipe')!;
    data = unwrap(equipItem(data, d.id, pipe.id));
    expect(dwellerDps(data.dwellers[d.id])).toBeGreaterThan(bare);
  });

  it('el daño a enemigos se concentra en el primero vivo', () => {
    const raid = createRaid('raiders', 3, 1);
    const hit = damageEnemies(raid.enemies, 40);
    expect(hit.map((e) => e.hp)).toEqual([0, 20, 30]);
  });
});

describe('incidentes internos', () => {
  it('las salas vecinas incluyen las de arriba y abajo', () => {
    const { data, food, power } = bunker();
    const neighbors = adjacentRooms(data.grid, data.grid.rooms[food]).map((r) => r.id);
    expect(neighbors).toContain(power);
  });

  it('un incendio drena energía', () => {
    const { data, food } = bunker();
    const burning = withIncident(data, food, 'fire');
    const quiet = simulate(data, 5).data.resources.energy;
    expect(simulate(burning, 5).data.resources.energy).toBeLessThan(quiet);
  });

  it('en una sala vacía se propaga a una vecina', () => {
    const { data, food } = bunker();
    const res = advance(withIncident(data, food, 'roaches'), INCIDENT_SPREAD_SECONDS + 1);
    const burning = Object.values(res.data.runtime).filter((r) => r.incident).length;
    expect(burning).toBe(2);
    expect(res.events.some((e) => e.type === 'incident-spread')).toBe(true);
  });

  it('con defensores no se propaga y termina apagándose', () => {
    let { data, food } = bunker();
    for (const id of ids(data).slice(0, 2)) data = unwrap(assignDweller(data, id, food));
    const res = advance(withIncident(data, food, 'gas'), 120);
    expect(res.events.some((e) => e.type === 'incident-spread')).toBe(false);
    expect(res.data.runtime[food].incident).toBeNull();
  });

  it('aparecen incidentes aleatorios a partir de cierta población', () => {
    let { data, food, water } = bunker();
    // 10 habitantes (umbral) y nadie con asaltos: población por debajo de la de asaltos.
    const extra: Record<string, Dweller> = {};
    const base = Object.values(data.dwellers)[0];
    for (let i = 0; i < 4; i++) extra[`extra-${i}`] = { ...base, id: `extra-${i}`, roomId: null };
    data = { ...data, dwellers: { ...data.dwellers, ...extra } };
    const staff = ids(data);
    for (const id of staff.slice(0, 2)) data = unwrap(assignDweller(data, id, food));
    for (const id of staff.slice(2, 4)) data = unwrap(assignDweller(data, id, water));
    const res = advance(data, 1800);
    expect(res.events.some((e) => e.type === 'incident-started')).toBe(true);
  });

  it('no aparecen incidentes aleatorios con poca población', () => {
    let { data, food } = bunker();
    for (const id of ids(data).slice(0, 2)) data = unwrap(assignDweller(data, id, food));
    expect(advance(data, 1800).events.some((e) => e.type === 'incident-started')).toBe(false);
  });
});

describe('asaltos', () => {
  it('la puerta mejorada resiste más', () => {
    expect(createRaid('raiders', 2, 3).doorHp).toBe(DOOR_HP[3]);
    expect(DOOR_HP[3]).toBeGreaterThan(DOOR_HP[1]);
  });

  it('recorren el búnker piso a piso empezando por la puerta', () => {
    const { data } = bunker();
    const types = raidRoute(data.grid).map((id) => data.grid.rooms[id].type);
    expect(types[0]).toBe('entrance');
    expect(types).not.toContain('elevator');
    expect(types[types.length - 1]).toBe('power');
  });

  it('rompen la puerta, saquean salas vacías y se van con el botín', () => {
    const { data } = bunker();
    const raided = { ...data, raid: createRaid('raiders', 2, 1) };
    const res = advance(raided, 400);
    expect(res.events.some((e) => e.type === 'door-breached')).toBe(true);
    expect(res.events.some((e) => e.type === 'raid-left')).toBe(true);
    expect(res.data.raid).toBeNull();
    expect(res.data.resources.codos).toBeLessThan(data.resources.codos);
  });

  it('los guardias armados los rechazan en la puerta y dan Codos', () => {
    let { data } = bunker();
    const entrance = Object.values(data.grid.rooms).find((r) => r.type === 'entrance')!;
    // Puerta reforzada y guardias con armas legendarias.
    data = { ...data, grid: unwrap(upgradeRoom(unwrap(upgradeRoom(data.grid, entrance.id)).grid, entrance.id)).grid };
    for (const id of ids(data).slice(0, 2)) {
      data = unwrap(assignDweller(data, id, entrance.id));
      const item = { id: `item-x-${id}`, defId: 'drum-bazooka' };
      data = { ...data, inventory: { ...data.inventory, items: { ...data.inventory.items, [item.id]: item } } };
      data = unwrap(equipItem(data, id, item.id));
    }
    const res = advance({ ...data, raid: createRaid('raiders', 3, 3) }, 60);
    expect(res.events.some((e) => e.type === 'raid-repelled')).toBe(true);
    expect(res.events.some((e) => e.type === 'door-breached')).toBe(false);
    expect(res.data.resources.codos).toBeGreaterThan(data.resources.codos);
  });

  it('una sala con defensores los detiene en lugar de dejarse saquear', () => {
    let { data, food } = bunker();
    for (const id of ids(data).slice(0, 2)) data = unwrap(assignDweller(data, id, food));
    const raid = { ...createRaid('dogs', 2, 1), phase: 'inside' as const, route: raidRoute(data.grid), step: 1 };
    expect(raid.route[1]).toBe(food);
    const res = advance({ ...data, raid }, RAID_STEAL_SECONDS + 1);
    const step = res.data.raid?.step ?? -1;
    // O siguen peleando en la misma sala, o ya los eliminaron.
    expect(res.data.raid === null || step === 1).toBe(true);
    expect(res.data.dwellers[ids(data)[0]].hp).toBeLessThan(100);
  });

  it('las embarazadas huyen de la sala asaltada', () => {
    let { data, food } = bunker();
    const woman = Object.values(data.dwellers).find((d) => d.sex === 'F')!;
    data = unwrap(assignDweller(data, woman.id, food));
    data = patch(data, woman.id, { pregnancy: { fatherId: 'x', elapsed: 0 } });
    const raid = { ...createRaid('raiders', 2, 1), phase: 'inside' as const, route: raidRoute(data.grid), step: 1 };
    const res = simulate({ ...data, raid }, 0.25);
    expect(res.data.dwellers[woman.id].roomId).toBeNull();
  });
});

describe('muerte y resurrección', () => {
  it('una muerte baja la felicidad de los compañeros de sala', () => {
    let { data, food } = bunker();
    const [a, b] = ids(data);
    data = unwrap(assignDweller(data, a, food));
    data = unwrap(assignDweller(data, b, food));
    data = patch(patch(data, a, { hp: 0.01 }), b, { happiness: 80 });
    data = { ...data, resources: { ...data.resources, food: 0 } };
    const res = simulate(data, 0.25);
    expect(res.data.dwellers[a].alive).toBe(false);
    expect(res.data.dwellers[b].happiness).toBeLessThanOrEqual(80 - DEATH_HAPPINESS_PENALTY + 1);
  });

  it('revivir cuesta Codos y devuelve la salud completa', () => {
    const base = newGame();
    const d = Object.values(base.dwellers)[0];
    const data = patch(base, d.id, { alive: false, hp: 0, intox: 30 });
    expect(unwrap(canRevive(data, d.id))).toBe(reviveCost(d));
    const after = unwrap(reviveDweller(data, d.id));
    expect(after.dwellers[d.id]).toMatchObject({ alive: true, hp: d.maxHp, intox: 0 });
    expect(after.resources.codos).toBe(data.resources.codos - reviveCost(d));
    expect(reviveDweller(after, d.id).ok).toBe(false);
  });

  it('expulsar elimina al fallecido y devuelve su equipo al inventario', () => {
    let data = newGame();
    const d = Object.values(data.dwellers)[0];
    const pipe = Object.values(data.inventory.items).find((i) => i.defId === 'lead-pipe')!;
    data = unwrap(equipItem(data, d.id, pipe.id));
    expect(expelDweller(data, d.id).ok).toBe(false); // vivo
    data = patch(data, d.id, { alive: false, hp: 0 });
    const { data: after, lost } = unwrap(expelDweller(data, d.id));
    expect(after.dwellers[d.id]).toBeUndefined();
    expect(after.inventory.items[pipe.id]).toBeDefined();
    expect(lost).toBe(0);
  });
});
