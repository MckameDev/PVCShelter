import { Container, Graphics, Text } from 'pixi.js';
import { BLOCK_CELLS, ROOM_DEFS } from '../core/config';
import { roomWidth } from '../core/GridManager';
import type { Rock, Room, RoomType } from '../core/types';
import { CELL_W, FLOOR_H } from './layout';

// Dibujo procedural de salas y rocas: sin assets externos, todo con Graphics.
// Estética: tubos de PVC blancos, "codos" en las esquinas, cinta americana.

const PVC = 0xe9ecef;
const PVC_SHADE = 0x9aa3ad;
const TAPE = 0xb8bcc2;
const TAPE_YELLOW = 0xf2c94c;
const WALL = 0x1b1410;
const BLOCK_W = BLOCK_CELLS * CELL_W;

function label(text: string, size: number, color = 0xffffff): Text {
  return new Text({
    text,
    resolution: 2,
    style: {
      fontFamily: 'system-ui, sans-serif',
      fontSize: size,
      fontWeight: '700',
      fill: color,
      stroke: { color: 0x000000, width: 3 },
    },
  });
}

/** Tubería superior con codos en los extremos; más niveles = más tubería y cinta. */
function drawPipes(g: Graphics, w: number, h: number, level: number) {
  const top = 7;
  g.rect(6, top, w - 12, 5).fill(PVC).stroke({ width: 1, color: PVC_SHADE });
  // Bajantes laterales
  g.rect(4, top + 4, 4, h - top - 20).fill(PVC);
  g.rect(w - 8, top + 4, 4, h - top - 20).fill(PVC);
  // Codos de PVC en las esquinas
  g.circle(6, top + 3, 4.5).fill(PVC).stroke({ width: 1, color: PVC_SHADE });
  g.circle(w - 6, top + 3, 4.5).fill(PVC).stroke({ width: 1, color: PVC_SHADE });
  // Uniones cada celda
  for (let x = CELL_W; x < w - 6; x += CELL_W) g.rect(x - 2, top - 1, 4, 7).fill(PVC_SHADE);

  if (level >= 2) g.rect(10, top + 8, w - 20, 3).fill(PVC_SHADE);
  if (level >= 3) {
    for (let x = 20; x < w - 20; x += 40) g.rect(x, top - 2, 6, 9).fill(TAPE_YELLOW);
  }
}

function drawDecor(g: Graphics, type: RoomType, x0: number, h: number, accent: number) {
  const floorY = h - 16;
  switch (type) {
    case 'power': {
      // Bicicleta-generador + batería
      const cy = floorY - 14;
      for (const cx of [x0 + 34, x0 + 74]) {
        g.circle(cx, cy, 12).stroke({ width: 3, color: 0x2a2a2a });
        g.circle(cx, cy, 2).fill(0x2a2a2a);
      }
      g.moveTo(x0 + 34, cy).lineTo(x0 + 54, cy - 18).lineTo(x0 + 74, cy).stroke({ width: 3, color: 0x444444 });
      g.roundRect(x0 + 100, floorY - 34, 26, 34, 3).fill(0x2a2a2a);
      g.poly([x0 + 115, floorY - 30, x0 + 107, floorY - 15, x0 + 114, floorY - 15, x0 + 110, floorY - 4, x0 + 121, floorY - 20, x0 + 114, floorY - 20]).fill(accent);
      break;
    }
    case 'food': {
      // Tubos hidropónicos con plantas
      for (const y of [32, 54]) {
        g.rect(x0 + 10, y, BLOCK_W - 20, 7).fill(PVC).stroke({ width: 1, color: PVC_SHADE });
        for (let x = x0 + 20; x < x0 + BLOCK_W - 14; x += 18) g.circle(x, y - 3, 5).fill(accent);
      }
      break;
    }
    case 'water': {
      // Bidones filtrantes
      for (let i = 0; i < 3; i++) {
        const x = x0 + 14 + i * 40;
        g.roundRect(x, floorY - 44, 30, 44, 5).fill(0x2f7fb6).stroke({ width: 2, color: 0x174a6b });
        g.rect(x, floorY - 32, 30, 4).fill(PVC);
        g.rect(x, floorY - 16, 30, 4).fill(PVC);
      }
      g.rect(x0 + 26, 12, 4, 22).fill(PVC);
      g.circle(x0 + 28, 40, 3).fill(accent);
      break;
    }
    case 'living': {
      // Colchón sobre palets + lámpara
      g.rect(x0 + 14, floorY - 8, 70, 8).fill(0x6b4a2b);
      g.roundRect(x0 + 14, floorY - 20, 70, 13, 4).fill(0xcfc6b8);
      g.roundRect(x0 + 18, floorY - 26, 20, 9, 3).fill(0xffffff);
      g.rect(x0 + 110, floorY - 40, 3, 40).fill(0x333333);
      g.circle(x0 + 111, floorY - 44, 8).fill(accent);
      break;
    }
    case 'entrance': {
      // Compuerta redonda hecha con una tapa de bidón gigante
      const cx = x0 + BLOCK_W / 2;
      const cy = h / 2 + 4;
      g.circle(cx, cy, 34).fill(0x8a929c).stroke({ width: 4, color: 0x3d434a });
      g.circle(cx, cy, 10).fill(0x3d434a);
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2;
        g.moveTo(cx + Math.cos(ang) * 12, cy + Math.sin(ang) * 12)
          .lineTo(cx + Math.cos(ang) * 30, cy + Math.sin(ang) * 30)
          .stroke({ width: 3, color: 0x3d434a });
      }
      for (let y = 18; y < h - 18; y += 12) g.rect(x0 + 6, y, 8, 6).fill(accent);
      break;
    }
    case 'elevator':
      break;
  }
}

function drawElevator(g: Graphics, w: number, h: number, accent: number) {
  g.rect(0, 0, w, h).fill(WALL);
  g.rect(3, 0, w - 6, h).fill(ROOM_DEFS.elevator.color);
  // Rieles de tubo PVC y cuerda de polea
  g.rect(8, 0, 4, h).fill(PVC);
  g.rect(w - 12, 0, 4, h).fill(PVC);
  g.rect(w / 2 - 1, 0, 2, h).fill(0x8b6b3d);
  for (let y = 10; y < h; y += 24) {
    g.rect(8, y, w - 16, 3).fill(accent);
  }
}

export function createRoomView(room: Room): Container {
  const def = ROOM_DEFS[room.type];
  const w = roomWidth(room) * CELL_W;
  const h = FLOOR_H;
  const view = new Container();
  view.position.set(room.col * CELL_W, room.floor * FLOOR_H);
  const g = new Graphics();
  view.addChild(g);

  if (room.type === 'elevator') {
    drawElevator(g, w, h, def.accent);
    return view;
  }

  g.rect(0, 0, w, h).fill(WALL);
  g.roundRect(3, 3, w - 6, h - 6, 4).fill(def.color);
  // Lona del fondo (franja más clara) y piso
  g.rect(3, 18, w - 6, h - 40).fill({ color: 0xffffff, alpha: 0.05 });
  g.rect(3, h - 16, w - 6, 13).fill({ color: 0x000000, alpha: 0.3 });
  // Parches de cinta americana
  g.rect(w - 30, h - 34, 14, 5).fill({ color: TAPE, alpha: 0.8 });

  for (let b = 0; b < room.blocks; b++) drawDecor(g, room.type, b * BLOCK_W, h, def.accent);
  drawPipes(g, w, h, room.level);

  const sizeTag = room.blocks > 1 ? ` ×${room.blocks}` : '';
  const name = label(`${def.name}${sizeTag}`, 11);
  name.position.set(10, h - 15);
  view.addChild(name);

  if (def.maxLevel > 1) {
    const stars = label('★'.repeat(room.level) + '☆'.repeat(def.maxLevel - room.level), 11, TAPE_YELLOW);
    // Arriba a la derecha, bajo la tubería: abajo no cabe junto al nombre en salas simples.
    stars.anchor.set(1, 0);
    stars.position.set(w - 12, 13);
    view.addChild(stars);
  }
  return view;
}

/** Hash estable de un string a [0,1), para que cada roca tenga siempre la misma forma. */
function hash01(s: string, salt: number): number {
  let x = salt * 2654435761;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 2246822519);
  return ((x ^ (x >>> 13)) >>> 0) / 4294967296;
}

export function createRockView(rock: Rock): Graphics {
  const g = new Graphics();
  g.position.set(rock.col * CELL_W, rock.floor * FLOOR_H);
  const w = rock.width * CELL_W;
  const h = FLOOR_H;
  const j = (n: number) => (hash01(rock.id, n) - 0.5) * 14;

  g.poly([4 + j(1), 10 + j(2), w * 0.5, 2 + j(3), w - 4 + j(4), 12 + j(5), w - 2, h - 6, 2, h - 4]).fill(0x5a4a3c);
  g.poly([10, 20 + j(6), w * 0.45, 12 + j(7), w * 0.6, h * 0.45, 14, h * 0.55]).fill(0x6e5c4a);
  // Grietas
  g.moveTo(w * 0.3 + j(8), 16).lineTo(w * 0.4, h * 0.5).lineTo(w * 0.3 + j(9), h - 12).stroke({ width: 2, color: 0x2e241b });
  if (rock.width > 1) g.moveTo(w * 0.7, 20).lineTo(w * 0.65 + j(10), h * 0.6).stroke({ width: 2, color: 0x2e241b });
  return g;
}
