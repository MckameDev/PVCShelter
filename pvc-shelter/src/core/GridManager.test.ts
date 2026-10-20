import { describe, expect, it } from 'vitest';
import { BLOCK_CELLS, ROCK_FREE_FLOORS } from './config';
import { buildCost, rockClearCost } from './Economy';
import {
  canDemolishRoom,
  canPlaceRoom,
  clearRock,
  createInitialGrid,
  demolishRoom,
  findRoomAt,
  getConnectedRoomIds,
  getValidPlacements,
  placeRoom,
  upgradeRoom,
} from './GridManager';
import type { GridState, Result, RoomType } from './types';

const ELEVATOR_COL = BLOCK_CELLS; // el ascensor inicial está junto a la puerta

function unwrap<T>(res: Result<T>): T {
  if (!res.ok) throw new Error(res.reason);
  return res.value;
}

/** Grid sin rocas para testear reglas sin depender de la semilla. */
function emptyGrid(): GridState {
  return { ...createInitialGrid(1), rocks: {} };
}

function build(grid: GridState, type: RoomType, floor: number, col: number) {
  return unwrap(placeRoom(grid, type, floor, col));
}

describe('estado inicial', () => {
  it('tiene la puerta en el piso 0 arriba a la izquierda y un ascensor', () => {
    const grid = createInitialGrid(42);
    const door = findRoomAt(grid, 0, 0);
    expect(door?.type).toBe('entrance');
    expect(findRoomAt(grid, 0, ELEVATOR_COL)?.type).toBe('elevator');
  });

  it('genera rocas deterministas solo por debajo de los pisos libres', () => {
    const a = createInitialGrid(123);
    const b = createInitialGrid(123);
    expect(a.rocks).toEqual(b.rocks);
    expect(Object.keys(a.rocks).length).toBeGreaterThan(0);
    for (const rock of Object.values(a.rocks)) {
      expect(rock.floor).toBeGreaterThanOrEqual(ROCK_FREE_FLOORS);
      expect(rock.col + rock.width).toBeLessThanOrEqual(a.cols);
    }
  });
});

describe('reglas de construcción', () => {
  it('permite construir junto a una sala existente', () => {
    const { grid } = build(emptyGrid(), 'power', 0, ELEVATOR_COL + 1);
    expect(findRoomAt(grid, 0, ELEVATOR_COL + 1)?.type).toBe('power');
  });

  it('rechaza salas desconectadas', () => {
    const res = canPlaceRoom(emptyGrid(), 'power', 0, 10);
    expect(res.ok).toBe(false);
  });

  it('rechaza construir sobre otra sala o fuera de límites', () => {
    const grid = emptyGrid();
    expect(canPlaceRoom(grid, 'power', 0, 0).ok).toBe(false);
    expect(canPlaceRoom(grid, 'power', 0, grid.cols - 1).ok).toBe(false);
    expect(canPlaceRoom(grid, 'entrance', 0, 4).ok).toBe(false);
  });

  it('solo conecta pisos a través de ascensores', () => {
    const grid = emptyGrid();
    // Una sala no puede colgar debajo de un ascensor...
    expect(canPlaceRoom(grid, 'power', 1, ELEVATOR_COL).ok).toBe(false);
    // ...pero otro ascensor sí.
    const { grid: g2 } = build(grid, 'elevator', 1, ELEVATOR_COL);
    expect(canPlaceRoom(g2, 'power', 1, ELEVATOR_COL + 1).ok).toBe(true);
  });

  it('bloquea la construcción sobre rocas hasta destruirlas', () => {
    let grid = build(emptyGrid(), 'elevator', 1, ELEVATOR_COL).grid;
    grid = { ...grid, rocks: { r: { id: 'r', floor: 1, col: ELEVATOR_COL + 2, width: 1 } } };
    expect(canPlaceRoom(grid, 'power', 1, ELEVATOR_COL + 1).ok).toBe(false);
    grid = unwrap(clearRock(grid, 'r'));
    expect(canPlaceRoom(grid, 'power', 1, ELEVATOR_COL + 1).ok).toBe(true);
  });

  it('lista posiciones válidas solo adyacentes a la estructura', () => {
    const placements = getValidPlacements(emptyGrid(), 'power');
    expect(placements).toEqual([{ floor: 0, col: ELEVATOR_COL + 1, width: BLOCK_CELLS }]);
  });
});

describe('fusión de salas', () => {
  const start = ELEVATOR_COL + 1;

  it('fusiona dos salas iguales en una doble', () => {
    let grid = build(emptyGrid(), 'food', 0, start).grid;
    grid = build(grid, 'food', 0, start + BLOCK_CELLS).grid;
    const room = findRoomAt(grid, 0, start)!;
    expect(room.blocks).toBe(2);
    expect(room.col).toBe(start);
    expect(Object.values(grid.rooms).filter((r) => r.type === 'food')).toHaveLength(1);
  });

  it('fusiona hasta triple y la cuarta queda separada', () => {
    let grid = emptyGrid();
    for (let i = 0; i < 4; i++) grid = build(grid, 'water', 0, start + i * BLOCK_CELLS).grid;
    const waters = Object.values(grid.rooms).filter((r) => r.type === 'water');
    expect(waters.map((r) => r.blocks).sort()).toEqual([1, 3]);
  });

  it('no fusiona tipos distintos', () => {
    let grid = build(emptyGrid(), 'food', 0, start).grid;
    grid = build(grid, 'water', 0, start + BLOCK_CELLS).grid;
    expect(findRoomAt(grid, 0, start)!.blocks).toBe(1);
  });

  it('no fusiona niveles distintos, pero sí al igualarlos con una mejora', () => {
    let change = build(emptyGrid(), 'power', 0, start);
    const firstId = change.roomId;
    let grid = unwrap(upgradeRoom(change.grid, firstId)).grid;
    change = build(grid, 'power', 0, start + BLOCK_CELLS);
    grid = change.grid;
    expect(Object.values(grid.rooms).filter((r) => r.type === 'power')).toHaveLength(2);

    grid = unwrap(upgradeRoom(grid, change.roomId)).grid;
    const merged = Object.values(grid.rooms).filter((r) => r.type === 'power');
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ blocks: 2, level: 2, col: start });
  });
});

describe('mejora', () => {
  it('sube hasta nivel 3 y no más', () => {
    let { grid, roomId } = build(emptyGrid(), 'living', 0, ELEVATOR_COL + 1);
    grid = unwrap(upgradeRoom(grid, roomId)).grid;
    grid = unwrap(upgradeRoom(grid, roomId)).grid;
    expect(grid.rooms[roomId].level).toBe(3);
    expect(upgradeRoom(grid, roomId).ok).toBe(false);
  });

  it('no permite mejorar ascensores', () => {
    expect(upgradeRoom(emptyGrid(), 'room-2').ok).toBe(false);
  });
});

describe('demolición', () => {
  it('nunca demuele la puerta', () => {
    expect(canDemolishRoom(emptyGrid(), 'room-1').ok).toBe(false);
  });

  it('permite demoler una sala hoja', () => {
    const { grid, roomId } = build(emptyGrid(), 'power', 0, ELEVATOR_COL + 1);
    const after = unwrap(demolishRoom(grid, roomId));
    expect(after.rooms[roomId]).toBeUndefined();
  });

  it('impide demoler un ascensor del que cuelgan otras salas', () => {
    let grid = build(emptyGrid(), 'elevator', 1, ELEVATOR_COL).grid;
    grid = build(grid, 'food', 1, ELEVATOR_COL + 1).grid;
    const res = canDemolishRoom(grid, 'room-2');
    expect(res.ok).toBe(false);
  });

  it('todas las salas construidas quedan conectadas a la entrada', () => {
    let grid = build(emptyGrid(), 'elevator', 1, ELEVATOR_COL).grid;
    grid = build(grid, 'elevator', 2, ELEVATOR_COL).grid;
    grid = build(grid, 'water', 2, ELEVATOR_COL + 1).grid;
    grid = build(grid, 'food', 1, 0).grid;
    expect(getConnectedRoomIds(grid).size).toBe(Object.keys(grid.rooms).length);
  });
});

describe('economía', () => {
  it('encarece cada bloque adicional del mismo tipo', () => {
    let grid = emptyGrid();
    const first = buildCost(grid, 'power');
    grid = build(grid, 'power', 0, ELEVATOR_COL + 1).grid;
    expect(buildCost(grid, 'power')).toBeGreaterThan(first);
    expect(buildCost(grid, 'elevator')).toBe(buildCost(emptyGrid(), 'elevator'));
  });

  it('las rocas profundas cuestan más', () => {
    expect(rockClearCost({ id: 'a', floor: 10, col: 0, width: 1 })).toBeGreaterThan(
      rockClearCost({ id: 'b', floor: 2, col: 0, width: 1 }),
    );
  });
});
