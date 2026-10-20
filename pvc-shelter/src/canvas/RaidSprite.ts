import type { Graphics } from 'pixi.js';
import { roomWidth } from '../core/GridManager';
import { raidRoomId } from '../core/Raids';
import type { Enemy, GridState, Raid, RaidKind } from '../core/types';
import { CELL_W, FLOOR_H } from './layout';

// Asaltantes: en la superficie mientras golpean la puerta, y dentro de la sala
// que están atacando cuando la rompen. Se dibujan cada frame en la capa de estado.

const FEET = FLOOR_H - 16;

function drawEnemy(g: Graphics, kind: RaidKind, x: number, y: number, timeMs: number, i: number) {
  const bob = Math.abs(Math.sin(timeMs / 150 + i)) * 2;
  switch (kind) {
    case 'raiders':
      g.rect(x - 5, y - 9, 4, 9).fill(0x2a2a2a).rect(x + 1, y - 9, 4, 9).fill(0x2a2a2a);
      g.roundRect(x - 7, y - 24 - bob, 14, 16, 3).fill(0x6b2a2a);
      g.rect(x - 7, y - 20 - bob, 14, 2).fill(0x2a2a2a);
      g.circle(x, y - 30 - bob, 6).fill(0xc68642);
      g.rect(x - 1.5, y - 40 - bob, 3, 6).fill(0xff4a3a); // cresta
      g.rect(x - 14, y - 19 - bob, 9, 3).fill(0x555555); // arma
      break;
    case 'dogs':
      g.ellipse(x, y - 12 - bob, 13, 7).fill(0x5c4030);
      g.circle(x - 13, y - 17 - bob, 6).fill(0x5c4030);
      g.rect(x - 9, y - 7, 3, 7).fill(0x3d2a1f).rect(x + 6, y - 7, 3, 7).fill(0x3d2a1f);
      g.circle(x - 15, y - 18 - bob, 1.5).fill(0xff3a2a);
      break;
    case 'mutants':
      g.rect(x - 8, y - 12, 6, 12).fill(0x3d5c2a).rect(x + 2, y - 12, 6, 12).fill(0x3d5c2a);
      g.roundRect(x - 12, y - 38 - bob, 24, 28, 6).fill(0x5c8a3a);
      g.circle(x, y - 44 - bob, 8).fill(0x5c8a3a);
      g.rect(x - 4, y - 46 - bob, 8, 2).fill(0xffd34d);
      break;
  }
}

function drawHpBar(g: Graphics, e: Enemy, x: number, y: number) {
  g.rect(x - 10, y, 20, 3).fill(0x000000);
  g.rect(x - 10, y, 20 * (e.hp / e.maxHp), 3).fill(0xff4a3a);
}

export function drawRaid(g: Graphics, raid: Raid, grid: GridState, timeMs: number): void {
  const alive = raid.enemies.filter((e) => e.hp > 0);
  const entrance = Object.values(grid.rooms).find((r) => r.type === 'entrance');

  if (raid.phase === 'door') {
    // En la superficie, frente a la puerta, y barra de resistencia de la puerta.
    const baseX = (entrance ? entrance.col * CELL_W : 0) + 18;
    alive.forEach((e, i) => {
      const x = baseX + i * 24;
      drawEnemy(g, raid.kind, x, -2, timeMs, i);
      drawHpBar(g, e, x, -58);
    });
    if (entrance) {
      const w = roomWidth(entrance) * CELL_W;
      const x0 = entrance.col * CELL_W;
      g.rect(x0 + 8, 22, w - 16, 6).fill(0x000000);
      g.rect(x0 + 8, 22, (w - 16) * (raid.doorHp / raid.doorMaxHp), 6).fill(0xf2c94c);
      // Golpes en la puerta
      if (Math.sin(timeMs / 120) > 0.6) g.rect(x0 + 3, 3, w - 6, FLOOR_H - 6).fill({ color: 0xffffff, alpha: 0.12 });
    }
    return;
  }

  const roomId = raidRoomId(raid);
  const room = roomId ? grid.rooms[roomId] : undefined;
  if (!room) return;
  const right = (room.col + roomWidth(room)) * CELL_W - 18;
  const y = room.floor * FLOOR_H + FEET;
  g.rect(room.col * CELL_W + 3, room.floor * FLOOR_H + 3, roomWidth(room) * CELL_W - 6, FLOOR_H - 6).stroke({
    width: 3,
    color: 0xff3a2a,
    alpha: 0.6 + 0.4 * Math.sin(timeMs / 200),
  });
  alive.forEach((e, i) => {
    const x = right - i * 22;
    drawEnemy(g, raid.kind, x, y, timeMs, i);
    drawHpBar(g, e, x, y - (raid.kind === 'mutants' ? 58 : 46));
  });
}
