import { Container, Graphics, Text } from 'pixi.js';
import { CELL_W, FLOOR_H, GUTTER_W, SURFACE_H } from './layout';

/** Rectángulo del mundo en coordenadas de Pixi (antes de cámara). */
export interface WorldBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function worldBounds(floors: number, cols: number): WorldBounds {
  return { left: -GUTTER_W, top: -SURFACE_H, right: cols * CELL_W + 24, bottom: floors * FLOOR_H + 24 };
}

/** Cielo, superficie y tierra. Es estático: se dibuja una vez por tamaño de grid. */
export function createTerrainView(floors: number, cols: number): Container {
  const b = worldBounds(floors, cols);
  const width = b.right - b.left;
  const view = new Container();
  const g = new Graphics();
  view.addChild(g);

  // Cielo polvoriento en franjas
  const sky = [0xd9a066, 0xcf9157, 0xc4824a, 0xb7733f];
  const bandH = (SURFACE_H - 40) / sky.length;
  sky.forEach((color, i) => g.rect(b.left, b.top + i * bandH, width, bandH + 1).fill(color));

  // Ruinas en el horizonte
  for (const [x, w, h] of [[220, 60, 70], [300, 40, 110], [520, 90, 55], [760, 50, 90], [980, 70, 65]] as const) {
    g.rect(x, -40 - h, w, h).fill(0x6e4a32);
    for (let wy = -40 - h + 10; wy < -50; wy += 18) g.rect(x + 8, wy, 8, 8).fill(0x3b281b);
  }

  // Superficie
  g.rect(b.left, -40, width, 40).fill(0x5c4030);
  g.rect(b.left, -40, width, 5).fill(0x7a5a3a);

  // Subsuelo con estratos que oscurecen con la profundidad
  for (let f = 0; f < floors; f++) {
    const t = f / Math.max(1, floors - 1);
    const shade = Math.round(0x2e - t * 0x14);
    const color = (shade << 16) | (Math.round(shade * 0.72) << 8) | Math.round(shade * 0.5);
    g.rect(b.left, f * FLOOR_H, width, FLOOR_H).fill(color);
  }
  g.rect(b.left, floors * FLOOR_H, width, b.bottom - floors * FLOOR_H).fill(0x0d0907);

  // Números de piso
  for (let f = 0; f < floors; f++) {
    const t = new Text({
      text: String(f),
      resolution: 2,
      style: { fontFamily: 'system-ui, sans-serif', fontSize: 14, fontWeight: '700', fill: 0x8b7560 },
    });
    t.anchor.set(0.5);
    t.position.set(-GUTTER_W / 2, f * FLOOR_H + FLOOR_H / 2);
    view.addChild(t);
  }

  const sign = new Text({
    text: 'PVC SHELTER',
    resolution: 2,
    style: {
      fontFamily: 'system-ui, sans-serif',
      fontSize: 28,
      fontWeight: '900',
      fill: 0xf2c94c,
      stroke: { color: 0x2a1c12, width: 5 },
      letterSpacing: 2,
    },
  });
  sign.position.set(8, -100);
  view.addChild(sign);
  return view;
}
