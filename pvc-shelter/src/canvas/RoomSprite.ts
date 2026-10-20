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
    case 'medbay': {
      // Dos camillas y una cruz pintada en la lona
      for (const bx of [x0 + 12, x0 + 74]) {
        g.rect(bx, floorY - 14, 50, 6).fill(0xffffff);
        g.rect(bx + 4, floorY - 8, 3, 8).fill(0x555555).rect(bx + 43, floorY - 8, 3, 8).fill(0x555555);
      }
      g.rect(x0 + 64, 26, 8, 22).fill(accent).rect(x0 + 57, 33, 22, 8).fill(accent);
      break;
    }
    case 'detox': {
      // Tanques de depuración con líquido verde
      for (let i = 0; i < 3; i++) {
        const x = x0 + 14 + i * 40;
        g.roundRect(x, floorY - 46, 28, 46, 6).fill(0x2a2a2a);
        g.roundRect(x + 3, floorY - 30, 22, 27, 4).fill(accent);
        g.rect(x + 12, 14, 4, 18).fill(PVC);
      }
      break;
    }
    case 'storage': {
      // Cajones de madera apilados
      for (const [cx, cy] of [[14, 0], [44, 0], [74, 0], [104, 0], [29, 1], [89, 1]] as const) {
        const x = x0 + cx;
        const y = floorY - 26 - cy * 26;
        g.rect(x, y, 26, 26).fill(0x8a6a3e).stroke({ width: 2, color: 0x4a3620 });
        g.moveTo(x, y).lineTo(x + 26, y + 26).moveTo(x + 26, y).lineTo(x, y + 26).stroke({ width: 2, color: 0x4a3620 });
      }
      break;
    }
    case 'barracks': {
      // Literas de tubo
      for (const bx of [x0 + 12, x0 + 76]) {
        g.rect(bx, floorY - 52, 4, 52).fill(PVC).rect(bx + 52, floorY - 52, 4, 52).fill(PVC);
        g.rect(bx, floorY - 14, 56, 7).fill(0xcfc6b8);
        g.rect(bx, floorY - 42, 56, 7).fill(0xcfc6b8);
      }
      break;
    }
    case 'radio': {
      // Mástil con antena y altavoz hecho con un bidón
      const mx = x0 + 100;
      g.rect(mx, 14, 4, floorY - 14).fill(PVC);
      for (let i = 0; i < 3; i++) g.moveTo(mx - 12 + i * 4, 18 + i * 10).lineTo(mx + 16 - i * 4, 18 + i * 10).stroke({ width: 2, color: PVC });
      g.circle(mx + 2, 14, 4).fill(accent);
      g.roundRect(x0 + 20, floorY - 40, 50, 40, 6).fill(0x2a2a2a);
      g.circle(x0 + 45, floorY - 20, 13).fill(0x555555).circle(x0 + 45, floorY - 20, 6).fill(accent);
      break;
    }
    case 'train-P': {
      // Barra con bidones como pesas
      g.rect(x0 + 24, floorY - 30, 96, 4).fill(0x999999);
      for (const bx of [x0 + 18, x0 + 112]) g.roundRect(bx, floorY - 44, 14, 32, 4).fill(accent);
      g.rect(x0 + 40, floorY - 8, 64, 8).fill(0x333333);
      break;
    }
    case 'train-A': {
      // Estantería de manuales
      g.rect(x0 + 14, floorY - 56, 70, 56).fill(0x5c3a1f);
      for (let row = 0; row < 3; row++) {
        for (let i = 0; i < 6; i++) {
          g.rect(x0 + 18 + i * 11, floorY - 52 + row * 18, 8, 14).fill([accent, 0xffffff, 0xf2c94c][(i + row) % 3]);
        }
      }
      g.rect(x0 + 96, floorY - 22, 30, 4).fill(0x8a6a3e).rect(x0 + 108, floorY - 18, 4, 18).fill(0x8a6a3e);
      break;
    }
    case 'train-T': {
      // Cinta de correr de rodillos
      g.roundRect(x0 + 20, floorY - 12, 100, 12, 6).fill(0x333333);
      for (let x = x0 + 26; x < x0 + 116; x += 10) g.circle(x, floorY - 6, 3).fill(0x777777);
      g.rect(x0 + 104, floorY - 46, 4, 36).fill(PVC).rect(x0 + 96, floorY - 46, 20, 4).fill(accent);
      break;
    }
    case 'train-R': {
      // Mesa de cartas
      g.ellipse(x0 + 72, floorY - 24, 44, 8).fill(0x2f6b3a);
      g.rect(x0 + 70, floorY - 20, 4, 20).fill(0x5c3a1f);
      for (let i = 0; i < 4; i++) g.rect(x0 + 50 + i * 12, floorY - 30, 8, 11).fill(i % 2 ? accent : 0xffffff);
      break;
    }
    case 'train-O': {
      // Escenario de cajas con foco
      g.rect(x0 + 16, floorY - 16, 112, 16).fill(0x8a6a3e);
      g.poly([x0 + 72, 14, x0 + 40, floorY - 16, x0 + 104, floorY - 16]).fill({ color: accent, alpha: 0.25 });
      g.circle(x0 + 72, 16, 6).fill(accent);
      g.rect(x0 + 70, floorY - 40, 3, 24).fill(0x333333).circle(x0 + 71, floorY - 42, 4).fill(0x333333);
      break;
    }
    case 'train-N': {
      // Diana de lona
      const cx = x0 + 100;
      const cy = floorY - 34;
      for (const [r, c] of [[22, 0xffffff], [16, accent], [10, 0xffffff], [5, accent]] as const) g.circle(cx, cy, r).fill(c);
      g.rect(x0 + 20, floorY - 4, 40, 4).fill(0x8a6a3e);
      break;
    }
    case 'weapon-workshop': {
      // Banco de trabajo con tornillo y herramientas colgadas
      g.rect(x0 + 14, floorY - 24, 90, 6).fill(0x8a6a3e);
      g.rect(x0 + 18, floorY - 18, 4, 18).fill(0x5c3a1f).rect(x0 + 96, floorY - 18, 4, 18).fill(0x5c3a1f);
      g.rect(x0 + 30, floorY - 34, 14, 10).fill(0x555555);
      g.rect(x0 + 14, 22, 90, 18).fill({ color: 0x000000, alpha: 0.2 });
      for (let i = 0; i < 5; i++) g.rect(x0 + 22 + i * 17, 24, 4, 14).fill(i % 2 ? accent : 0xaaaaaa);
      g.circle(x0 + 120, floorY - 12, 10).fill(0x333333).circle(x0 + 120, floorY - 12, 4).fill(accent);
      break;
    }
    case 'outfit-workshop': {
      // Máquina de coser y maniquí con lona
      g.rect(x0 + 14, floorY - 22, 50, 22).fill(0x5c3a1f);
      g.roundRect(x0 + 22, floorY - 40, 34, 18, 4).fill(0x2a2a2a).rect(x0 + 50, floorY - 34, 3, 12).fill(0xaaaaaa);
      g.circle(x0 + 104, floorY - 50, 6).fill(0xcfc6b8);
      g.roundRect(x0 + 94, floorY - 44, 20, 26, 4).fill(accent);
      g.rect(x0 + 102, floorY - 18, 4, 18).fill(0x555555);
      break;
    }
    case 'barber': {
      // Sillón, espejo y poste de barbería
      g.roundRect(x0 + 30, floorY - 28, 34, 16, 4).fill(0x8a2f2f).rect(x0 + 44, floorY - 12, 6, 12).fill(0x555555);
      g.roundRect(x0 + 30, floorY - 46, 8, 20, 3).fill(0x8a2f2f);
      g.roundRect(x0 + 74, 24, 30, 36, 4).fill(0xbfd9e6).stroke({ width: 3, color: 0x8a6a3e });
      for (let i = 0; i < 4; i++) g.rect(x0 + 118, 22 + i * 12, 8, 6).fill(i % 2 ? 0xffffff : accent);
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
