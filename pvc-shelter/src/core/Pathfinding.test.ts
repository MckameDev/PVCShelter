import { describe, expect, it } from 'vitest';
import { BLOCK_CELLS } from './config';
import { createInitialGrid, placeRoom } from './GridManager';
import { findPath, findRoomPath } from './Pathfinding';
import type { GridState, Result, RoomType } from './types';

const E = BLOCK_CELLS; // columna del ascensor inicial

function unwrap<T>(res: Result<T>): T {
  if (!res.ok) throw new Error(res.reason);
  return res.value;
}

function build(grid: GridState, type: RoomType, floor: number, col: number): GridState {
  return unwrap(placeRoom(grid, type, floor, col)).grid;
}

/**
 * Piso 0: [puerta 0-2][asc 3][power 4-6][asc 7]
 * Piso 1:              [asc 3][food 4-6][asc 7]
 * Piso 2:                                [asc 7][water 8-10]
 */
function bunker(): GridState {
  let g: GridState = { ...createInitialGrid(1), rocks: {} };
  g = build(g, 'power', 0, E + 1);
  g = build(g, 'elevator', 0, E + 4);
  g = build(g, 'elevator', 1, E);
  g = build(g, 'food', 1, E + 1);
  g = build(g, 'elevator', 1, E + 4);
  g = build(g, 'elevator', 2, E + 4);
  g = build(g, 'water', 2, E + 5);
  return g;
}

describe('pathfinding', () => {
  it('en el mismo piso camina en línea recta sin puntos intermedios', () => {
    const path = findPath(bunker(), { floor: 0, x: 1 }, { floor: 0, x: 5 });
    expect(path).toEqual([{ floor: 0, x: 5 }]);
  });

  it('usa el ascensor más cercano para cambiar de piso', () => {
    // Desde la izquierda del generador, el ascensor de la col 3 está más cerca que el de la 7.
    const path = findPath(bunker(), { floor: 0, x: 4.2 }, { floor: 1, x: 5 });
    expect(path).toEqual([
      { floor: 0, x: E + 0.5 },
      { floor: 1, x: E + 0.5 },
      { floor: 1, x: 5 },
    ]);
  });

  it('desde el otro extremo de la sala elige el otro ascensor', () => {
    const path = findPath(bunker(), { floor: 0, x: 6.8 }, { floor: 1, x: 5 });
    expect(path).toEqual([
      { floor: 0, x: E + 4.5 },
      { floor: 1, x: E + 4.5 },
      { floor: 1, x: 5 },
    ]);
  });

  it('recorre varios pisos por el mismo hueco en un solo tramo vertical', () => {
    const path = findPath(bunker(), { floor: 0, x: 5 }, { floor: 2, x: 9 });
    expect(path).toEqual([
      { floor: 0, x: E + 4.5 },
      { floor: 2, x: E + 4.5 },
      { floor: 2, x: 9 },
    ]);
  });

  it('devuelve la secuencia de salas pasando por ascensores', () => {
    const g = bunker();
    const door = Object.values(g.rooms).find((r) => r.type === 'entrance')!;
    const water = Object.values(g.rooms).find((r) => r.type === 'water')!;
    const types = findRoomPath(g, door.id, water.id)!.map((r) => r.type);
    expect(types[0]).toBe('entrance');
    expect(types[types.length - 1]).toBe('water');
    expect(types.filter((t) => t === 'elevator').length).toBeGreaterThanOrEqual(3);
  });

  it('devuelve null fuera de las salas', () => {
    expect(findPath(bunker(), { floor: 5, x: 5 }, { floor: 0, x: 1 })).toBeNull();
  });
});
