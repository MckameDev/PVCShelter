import { describe, expect, it } from 'vitest';
import { restyleDweller } from './Barber';
import { applyRoomChange, canDemolish, createNewGame } from './Bunker';
import { BARBER_COST, BLOCK_CELLS, CRAFT_COSTS, ITEM_BASE_CAPACITY } from './config';
import { canStartCraft, collectCraft, craftTime, startCraft } from './Crafting';
import { assignDweller } from './Dwellers';
import { effectiveStat, weaponDamage } from './Equipment';
import { addItem, equipItem, freeSlots, scrapItem, unequipItem } from './Inventory';
import { placeRoom } from './GridManager';
import { cycleTime } from './Production';
import { advance, simulate } from './Simulation';
import type { Dweller, GameData, Item, Result, RoomType } from './types';

const E = BLOCK_CELLS;

function unwrap<T>(res: Result<T>): T {
  if (!res.ok) throw new Error(res.reason);
  return res.value;
}

function newGame(): GameData {
  const data = createNewGame(33);
  return {
    ...data,
    grid: { ...data.grid, rocks: {} },
    resources: { ...data.resources, energy: 50_000, food: 50_000, water: 50_000, codos: 10_000 },
  };
}

function build(data: GameData, type: RoomType, floor = 0, col = E + 1) {
  const change = unwrap(placeRoom(data.grid, type, floor, col));
  return { data: applyRoomChange(data, change), roomId: change.roomId };
}

const first = (data: GameData): Dweller => Object.values(data.dwellers)[0];
const itemOf = (data: GameData, defId: string): Item => Object.values(data.inventory.items).find((i) => i.defId === defId)!;

describe('inventario inicial', () => {
  it('trae equipo básico, chatarra y planos', () => {
    const data = newGame();
    expect(Object.keys(data.inventory.items).length).toBeGreaterThan(0);
    expect(data.inventory.junk.common).toBeGreaterThan(0);
    expect(data.inventory.recipes).toContain('lead-pipe');
    expect(freeSlots(data)).toBe(ITEM_BASE_CAPACITY - Object.keys(data.inventory.items).length);
  });
});

describe('equipo', () => {
  it('equipar saca el objeto del inventario; cambiarlo devuelve el anterior', () => {
    let data = newGame();
    const d = first(data);
    const pipe = itemOf(data, 'lead-pipe');
    data = unwrap(equipItem(data, d.id, pipe.id));
    expect(data.dwellers[d.id].equipment.weapon?.id).toBe(pipe.id);
    expect(data.inventory.items[pipe.id]).toBeUndefined();

    const { data: withWrench, item: wrench } = unwrap(addItem(data, 'wrench'));
    data = unwrap(equipItem(withWrench, d.id, wrench.id));
    expect(data.dwellers[d.id].equipment.weapon?.id).toBe(wrench.id);
    expect(data.inventory.items[pipe.id]).toBeDefined();

    data = unwrap(unequipItem(data, d.id, 'weapon'));
    expect(data.dwellers[d.id].equipment.weapon).toBeNull();
  });

  it('el atuendo suma stats y puede superar 10', () => {
    let data = newGame();
    const d = first(data);
    data = { ...data, dwellers: { ...data.dwellers, [d.id]: { ...d, stats: { ...d.stats, P: 10 } } } };
    const { data: next, item } = unwrap(addItem(data, 'pvc-armor'));
    data = unwrap(equipItem(next, d.id, item.id));
    expect(effectiveStat(data.dwellers[d.id], 'P')).toBe(13);
  });

  it('el arma acelera la resolución de incidentes', () => {
    let { data, roomId } = build(newGame(), 'water');
    const d = first(data);
    data = unwrap(assignDweller(data, d.id, roomId));
    data = {
      ...data,
      runtime: { ...data.runtime, [roomId]: { ...data.runtime[roomId], incident: { kind: 'roaches', hp: 1000, maxHp: 1000, spread: 0 } } },
    };
    const bare = simulate(data, 1).data.runtime[roomId].incident!.hp;
    const { data: armed0, item } = unwrap(addItem(data, 'drum-bazooka'));
    const armed = unwrap(equipItem(armed0, d.id, item.id));
    expect(weaponDamage(armed.dwellers[d.id])).toBeGreaterThan(0);
    expect(simulate(armed, 1).data.runtime[roomId].incident!.hp).toBeLessThan(bare);
  });

  it('la mascota de producción (Loro Reciclador) acorta el ciclo', () => {
    let { data, roomId } = build(newGame(), 'food');
    const d = first(data);
    data = unwrap(assignDweller(data, d.id, roomId));
    const room = data.grid.rooms[roomId];
    const without = cycleTime(room, [data.dwellers[d.id]])!;
    data = unwrap(equipItem(data, d.id, itemOf(data, 'parrot').id));
    expect(cycleTime(room, [data.dwellers[d.id]])!).toBeLessThan(without);
  });

  it('los niños no pueden equiparse', () => {
    let data = newGame();
    const d = first(data);
    data = { ...data, dwellers: { ...data.dwellers, [d.id]: { ...d, childTime: 100 } } };
    expect(equipItem(data, d.id, itemOf(data, 'lead-pipe').id).ok).toBe(false);
  });
});

describe('desguace', () => {
  it('convierte armas y atuendos en chatarra de su rareza', () => {
    const data = newGame();
    const pipe = itemOf(data, 'lead-pipe');
    const { data: after, junk } = unwrap(scrapItem(data, pipe.id));
    expect(junk.common).toBeGreaterThan(0);
    expect(after.inventory.junk.common).toBe(data.inventory.junk.common + junk.common!);
    expect(after.inventory.items[pipe.id]).toBeUndefined();
  });

  it('las mascotas no se desguazan', () => {
    const data = newGame();
    expect(scrapItem(data, itemOf(data, 'parrot').id).ok).toBe(false);
  });

  it('con el inventario lleno no se puede quitar equipo', () => {
    let data = newGame();
    const d = first(data);
    data = unwrap(equipItem(data, d.id, itemOf(data, 'lead-pipe').id));
    while (freeSlots(data) > 0) data = unwrap(addItem(data, 'wrench')).data;
    expect(unequipItem(data, d.id, 'weapon').ok).toBe(false);
  });
});

describe('fabricación', () => {
  function workshop() {
    let { data, roomId } = build(newGame(), 'weapon-workshop');
    data = unwrap(assignDweller(data, first(data).id, roomId));
    return { data, roomId };
  }

  it('cobra chatarra y Codos, avanza con trabajadores y entrega el objeto', () => {
    const { data, roomId } = workshop();
    const started = unwrap(startCraft(data, roomId, 'lead-pipe'));
    expect(started.resources.codos).toBe(data.resources.codos - CRAFT_COSTS.common.codos);
    expect(started.inventory.junk.common).toBe(data.inventory.junk.common - CRAFT_COSTS.common.junk.common!);
    expect(canDemolish(started, roomId).ok).toBe(false);

    const t = craftTime(started.grid.rooms[roomId], 'lead-pipe', [first(started)])!;
    const done = advance(started, t + 1).data;
    expect(done.runtime[roomId].ready).toBe(true);

    const before = Object.keys(done.inventory.items).length;
    const { data: collected, item } = unwrap(collectCraft(done, roomId));
    expect(item.defId).toBe('lead-pipe');
    expect(Object.keys(collected.inventory.items).length).toBe(before + 1);
    expect(collected.runtime[roomId].craft).toBeNull();
  });

  it('exige plano conocido, el taller correcto y materiales', () => {
    const { data, roomId } = workshop();
    expect(canStartCraft(data, roomId, 'drum-bazooka').ok).toBe(false); // plano desconocido
    expect(canStartCraft(data, roomId, 'tape-vest').ok).toBe(false); // atuendo en taller de armas
    const poor = { ...data, inventory: { ...data.inventory, junk: { common: 0, rare: 0, legendary: 0 } } };
    expect(canStartCraft(poor, roomId, 'lead-pipe').ok).toBe(false);
  });

  it('sin trabajadores no avanza', () => {
    const { data, roomId } = build(newGame(), 'weapon-workshop');
    const started = unwrap(startCraft(data, roomId, 'lead-pipe'));
    expect(advance(started, 600).data.runtime[roomId].ready).toBe(false);
  });
});

describe('peluquería', () => {
  it('cambia la apariencia solo con Peluquería y cobrando', () => {
    const base = newGame();
    const d = first(base);
    const look = { skin: 2, hair: 3, style: 'mohawk' as const };
    expect(restyleDweller(base, d.id, look).ok).toBe(false);

    const { data } = build(base, 'barber');
    const after = unwrap(restyleDweller(data, d.id, look));
    expect(after.dwellers[d.id].appearance).toEqual(look);
    expect(after.resources.codos).toBe(data.resources.codos - BARBER_COST);
  });
});
