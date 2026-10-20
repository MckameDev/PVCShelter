import type { Graphics } from 'pixi.js';
import { ROOM_DEFS } from '../core/config';
import { roomWidth } from '../core/GridManager';
import type { ProducedResource, Room, RoomRuntime } from '../core/types';
import { CELL_W, FLOOR_H } from './layout';

// Estado dinámico dibujado sobre las salas en cada frame (una sola Graphics para
// todo el búnker). Las salas en sí son estáticas y viven en RoomSprite.

export const RESOURCE_COLORS: Record<ProducedResource, number> = {
  energy: 0xffd34d,
  food: 0x7ee08a,
  water: 0x6ec6ff,
  stimpaks: 0xff6b6b,
  radaways: 0xffa64d,
};

/** Centro del icono de recolección, en coordenadas de mundo (usado también para el hit-test). */
export function readyIconCenter(room: Room): { x: number; y: number } {
  return { x: (room.col + roomWidth(room) / 2) * CELL_W, y: room.floor * FLOOR_H + 42 };
}
export const READY_ICON_RADIUS = 16;

export function drawResourceIcon(g: Graphics, resource: ProducedResource, cx: number, cy: number, r: number) {
  g.circle(cx, cy, r + 3).fill({ color: 0x000000, alpha: 0.35 });
  g.circle(cx, cy, r).fill(RESOURCE_COLORS[resource]).stroke({ width: 2, color: 0xffffff });
  const s = r / 16;
  const dark = 0x1b1410;
  switch (resource) {
    case 'energy':
      g.poly([cx + 2 * s, cy - 10 * s, cx - 6 * s, cy + 2 * s, cx, cy + 2 * s, cx - 2 * s, cy + 10 * s, cx + 6 * s, cy - 2 * s, cx, cy - 2 * s]).fill(dark);
      break;
    case 'water':
      g.circle(cx, cy + 3 * s, 6 * s).fill(dark);
      g.poly([cx, cy - 10 * s, cx - 5.5 * s, cy + 1 * s, cx + 5.5 * s, cy + 1 * s]).fill(dark);
      break;
    case 'food':
      g.circle(cx, cy + 2 * s, 7 * s).fill(dark);
      g.ellipse(cx + 4 * s, cy - 7 * s, 4 * s, 2 * s).fill(dark);
      break;
    case 'stimpaks':
      // Cruz de venda
      g.rect(cx - 2.5 * s, cy - 9 * s, 5 * s, 18 * s).fill(0xffffff);
      g.rect(cx - 9 * s, cy - 2.5 * s, 18 * s, 5 * s).fill(0xffffff);
      break;
    case 'radaways':
      // Bolsa de suero
      g.roundRect(cx - 6 * s, cy - 8 * s, 12 * s, 14 * s, 3 * s).fill(dark);
      g.rect(cx - 1 * s, cy + 6 * s, 2 * s, 5 * s).fill(dark);
      break;
  }
}

interface RoomStatus {
  room: Room;
  runtime: RoomRuntime;
  workers: number;
  capacity: number;
  /** Duración del ciclo actual, o null si la sala no está produciendo. */
  cycle: number | null;
}

export function drawRoomStatus(g: Graphics, { room, runtime, workers, capacity, cycle }: RoomStatus, timeMs: number) {
  const def = ROOM_DEFS[room.type];
  const x0 = room.col * CELL_W;
  const y0 = room.floor * FLOOR_H;
  const w = roomWidth(room) * CELL_W;
  const h = FLOOR_H;

  // Ocupación: un punto por plaza
  for (let i = 0; i < capacity; i++) {
    const cx = x0 + 14 + i * 10;
    if (i < workers) g.circle(cx, y0 + 20, 3.5).fill(0xffffff);
    else g.circle(cx, y0 + 20, 3.5).stroke({ width: 1.5, color: 0xffffff, alpha: 0.5 });
  }

  if (!runtime.powered) {
    g.rect(x0 + 3, y0 + 3, w - 6, h - 6).fill({ color: 0x000000, alpha: 0.6 });
    const cx = x0 + w / 2;
    const cy = y0 + h / 2 - 4;
    g.poly([cx + 3, cy - 14, cx - 8, cy + 3, cx, cy + 3, cx - 3, cy + 14, cx + 8, cy - 3, cx, cy - 3]).fill(0x777777);
    g.moveTo(cx - 14, cy - 14).lineTo(cx + 14, cy + 14).stroke({ width: 3, color: 0xff5a4a });
  }

  if (runtime.incident) {
    const pulse = 0.2 + 0.15 * Math.sin(timeMs / 180);
    g.rect(x0 + 3, y0 + 3, w - 6, h - 6).fill({ color: 0xff2a1a, alpha: pulse });
    if (runtime.incident.kind === 'fire') {
      for (let x = x0 + 14; x < x0 + w - 14; x += 22) {
        const flick = 6 * Math.sin(timeMs / 90 + x);
        g.poly([x - 9, y0 + h - 16, x, y0 + h - 44 - flick, x + 9, y0 + h - 16]).fill(0xff8a1f);
        g.poly([x - 5, y0 + h - 16, x, y0 + h - 32 - flick / 2, x + 5, y0 + h - 16]).fill(0xffd34d);
      }
    } else {
      for (let i = 0; i < 4 * room.blocks; i++) {
        const t = timeMs / 700 + i * 1.7;
        const rx = x0 + 16 + ((Math.sin(t) + 1) / 2) * (w - 32);
        const ry = y0 + h - 26 + Math.cos(t * 1.3 + i) * 6;
        g.ellipse(rx, ry, 6, 3.5).fill(0x3b2412);
      }
    }
    const frac = runtime.incident.hp / runtime.incident.maxHp;
    g.rect(x0 + 10, y0 + 28, w - 20, 5).fill(0x000000);
    g.rect(x0 + 10, y0 + 28, (w - 20) * frac, 5).fill(0xff4a3a);
  }

  // Salas con ciclo: producción (con icono para recolectar) o transmisión de radio.
  if (def.cycleSeconds <= 0) return;
  const color = def.produces ? RESOURCE_COLORS[def.produces] : def.accent;

  if (def.produces && runtime.ready) {
    const { x, y } = readyIconCenter(room);
    drawResourceIcon(g, def.produces, x, y + Math.sin(timeMs / 250) * 3, READY_ICON_RADIUS);
  } else if (cycle !== null && runtime.powered && !runtime.incident) {

    const frac = Math.min(1, runtime.progress / cycle);
    g.rect(x0 + 10, y0 + h - 22, w - 20, 4).fill({ color: 0x000000, alpha: 0.6 });
    g.rect(x0 + 10, y0 + h - 22, (w - 20) * frac, 4).fill(color);
  }
}
