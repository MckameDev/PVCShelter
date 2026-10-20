import type { Graphics } from 'pixi.js';
import type { GridState, Inspector } from '../core/types';
import { CELL_W, FLOOR_H } from './layout';

// Inspector Fisgón: gabardina, sombrero y lupa; parpadea para que cueste verlo.

const FEET = FLOOR_H - 16;

/** Posición de los pies del Inspector en el mundo, o null si su sala ya no existe. */
export function inspectorPosition(inspector: Inspector, grid: GridState): { x: number; y: number } | null {
  const room = grid.rooms[inspector.roomId];
  return room ? { x: inspector.x * CELL_W, y: room.floor * FLOOR_H + FEET } : null;
}

export function hitInspector(inspector: Inspector | null, grid: GridState, world: { x: number; y: number }): boolean {
  const pos = inspector && inspectorPosition(inspector, grid);
  return !!pos && Math.abs(world.x - pos.x) <= 14 && world.y <= pos.y + 4 && world.y >= pos.y - 44;
}

export function drawInspector(g: Graphics, inspector: Inspector, grid: GridState, timeMs: number): void {
  const pos = inspectorPosition(inspector, grid);
  if (!pos) return;
  const { x, y } = pos;
  // Visible a ratos: entre 35% y 85% de opacidad.
  const alpha = 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(timeMs / 260));
  g.rect(x - 5, y - 9, 4, 9).fill({ color: 0x2a2a2a, alpha });
  g.rect(x + 1, y - 9, 4, 9).fill({ color: 0x2a2a2a, alpha });
  g.poly([x - 8, y - 8, x - 6, y - 26, x + 6, y - 26, x + 8, y - 8]).fill({ color: 0x8a6a3e, alpha }); // gabardina
  g.circle(x, y - 31, 5.5).fill({ color: 0xe0ac69, alpha });
  g.rect(x - 9, y - 36, 18, 2).fill({ color: 0x3d2a1f, alpha }); // ala del sombrero
  g.rect(x - 5, y - 41, 10, 5).fill({ color: 0x3d2a1f, alpha });
  g.circle(x + 10, y - 22, 4).stroke({ width: 2, color: 0xf2c94c, alpha }); // lupa
  g.moveTo(x + 7, y - 19).lineTo(x + 4, y - 15).stroke({ width: 2, color: 0x8a6a3e, alpha });
}
