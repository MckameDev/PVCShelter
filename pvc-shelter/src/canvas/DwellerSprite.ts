import { Container, Graphics } from 'pixi.js';
import { dwellersInRoom, isAdult } from '../core/Dwellers';
import { roomCapacity } from '../core/Economy';
import { findRoomAt, getConnectedRoomIds, roomWidth } from '../core/GridManager';
import { findPath } from '../core/Pathfinding';
import type { Waypoint } from '../core/Pathfinding';
import { ITEMS } from '../core/items';
import type { Appearance, Dweller, GameData, GridState, HairStyle, Room } from '../core/types';
import { CELL_W, FLOOR_H } from './layout';

// Representación visual de los habitantes. El movimiento es solo presentación:
// la asignación a una sala cuenta en la simulación desde el primer instante,
// y aquí el habitante camina hasta ella usando la ruta de core/Pathfinding.

const WALK_SPEED = 2.2; // celdas por segundo
const ELEVATOR_SPEED = 1.6; // pisos por segundo
/** Altura de los pies dentro de un piso (encima de la franja del suelo). */
const FEET_Y = FLOOR_H - 16;
const BODY_H = 36;

/** Paletas de apariencia (también las usa la Peluquería en la ficha del habitante). */
export const SKIN_TONES = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
export const HAIR_COLORS = [0x2b1b0e, 0x5a3825, 0xb5651d, 0xe6c35c, 0x1a1a1a, 0x8c8c8c, 0xd94a4a, 0x4a8ad9];
export const HAIR_STYLES: HairStyle[] = ['short', 'long', 'mohawk', 'bald'];
const DEFAULT_SUIT = 0x3f6f9f;

interface Point {
  x: number;
  y: number;
}

interface Walker {
  view: Container;
  body: Graphics;
  appearance: string;
  /** Piso continuo (fraccionario mientras va en ascensor). */
  floorPos: number;
  /** Posición horizontal en celdas. */
  x: number;
  path: Waypoint[];
  targetKey: string;
  /** Segundos hasta que un habitante sin sala elija otro sitio al que pasear. */
  wanderTimer: number;
  walkPhase: number;
}

function hashOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Apariencia efectiva: la elegida en la Peluquería o una estable derivada del id. */
export function resolveAppearance(d: Dweller): Appearance {
  if (d.appearance) return d.appearance;
  const h = hashOf(d.id);
  return { skin: h % SKIN_TONES.length, hair: (h >>> 8) % 6, style: d.sex === 'F' ? 'long' : 'short' };
}

function drawDweller(g: Graphics, d: Dweller): void {
  const look = resolveAppearance(d);
  const skin = SKIN_TONES[look.skin % SKIN_TONES.length];
  const hair = HAIR_COLORS[look.hair % HAIR_COLORS.length];
  const outfit = d.equipment.outfit ? ITEMS[d.equipment.outfit.defId] : undefined;
  const suit = outfit?.color ?? DEFAULT_SUIT;
  g.clear();
  // Mascota a los pies
  if (d.equipment.pet) g.ellipse(-13, -4, 5, 4).fill(0x8a6a3e).circle(-17, -7, 3).fill(0x8a6a3e);
  // Piernas
  g.rect(-5, -9, 4, 9).fill(0x2a2a2a);
  g.rect(1, -9, 4, 9).fill(0x2a2a2a);
  // Mono de trabajo (color del atuendo) con franja de cinta americana
  g.roundRect(-7, -24, 14, 16, 3).fill(suit);
  g.rect(-7, -18, 14, 3).fill(0xc9ccd1);
  if (d.pregnancy) g.ellipse(4, -15, 5, 5).fill(suit);
  // Arma en la mano
  if (d.equipment.weapon) g.rect(5, -19, 11, 3).fill(0x777777).rect(13, -21, 3, 7).fill(0x555555);
  // Cabeza y peinado
  g.circle(0, -30, 6).fill(skin);
  switch (look.style) {
    case 'short':
      g.rect(-6, -36, 12, 4).fill(hair);
      break;
    case 'long':
      g.rect(-6, -36, 12, 4).fill(hair).rect(-6, -34, 3, 9).fill(hair).rect(3, -34, 3, 9).fill(hair);
      break;
    case 'mohawk':
      g.rect(-2, -40, 4, 8).fill(hair);
      break;
    case 'bald':
      break;
  }
}

const appearanceKey = (d: Dweller) =>
  [
    isAdult(d) ? 'a' : 'c',
    d.pregnancy ? 'p' : '',
    JSON.stringify(resolveAppearance(d)),
    d.equipment.outfit?.defId,
    d.equipment.weapon?.defId,
    d.equipment.pet?.defId,
  ].join('|');

export class DwellerLayer {
  readonly container = new Container();
  private readonly walkers = new Map<string, Walker>();
  private draggingId: string | null = null;
  private walkableCache: { grid: GridState; rooms: Room[] } | null = null;

  /** Avanza el movimiento de todos los habitantes `dt` segundos. */
  update(state: GameData, dt: number): void {
    // Quien está en el Yermo o de misión no se dibuja dentro del búnker.
    const alive = Object.values(state.dwellers).filter((d) => d.alive && d.location === 'bunker');
    const aliveIds = new Set(alive.map((d) => d.id));
    for (const [id, w] of this.walkers) {
      if (!aliveIds.has(id)) {
        w.view.destroy({ children: true });
        this.walkers.delete(id);
      }
    }

    for (const d of alive) {
      let w = this.walkers.get(d.id);
      if (!w) w = this.spawn(state, d);

      const key = appearanceKey(d);
      if (key !== w.appearance) {
        drawDweller(w.body, d);
        w.view.scale.set(isAdult(d) ? 1 : 0.65);
        w.appearance = key;
      }
      if (d.id === this.draggingId) continue;

      // Si su sala desapareció (demolición), aparece en su destino.
      if (!findRoomAt(state.grid, Math.round(w.floorPos), Math.floor(w.x))) this.teleportHome(state, w);

      this.retarget(state, d, w, dt);
      this.step(w, dt);
      this.place(w);
    }
  }

  // -------------------------------------------------------------------------
  // Destinos
  // -------------------------------------------------------------------------

  private spawn(state: GameData, d: Dweller): Walker {
    const body = new Graphics();
    const view = new Container();
    view.addChild(body);
    this.container.addChild(view);
    const w: Walker = { view, body, appearance: '', floorPos: 0, x: 1.5, path: [], targetKey: '', wanderTimer: 0, walkPhase: 0 };
    this.walkers.set(d.id, w);
    // Los que ya tienen sala aparecen en ella; el resto, en la puerta.
    const target = this.assignedTarget(state, d);
    if (target) {
      w.floorPos = target.point.floor;
      w.x = target.point.x;
      w.targetKey = target.key;
    }
    return w;
  }

  private teleportHome(state: GameData, w: Walker): void {
    const entrance = Object.values(state.grid.rooms).find((r) => r.type === 'entrance');
    w.floorPos = entrance?.floor ?? 0;
    w.x = entrance ? entrance.col + 1.5 : 1.5;
    w.path = [];
    w.targetKey = '';
  }

  /** Puesto dentro de la sala asignada: las plazas se reparten a lo ancho. */
  private assignedTarget(state: GameData, d: Dweller): { key: string; point: Waypoint } | null {
    const room = d.roomId ? state.grid.rooms[d.roomId] : undefined;
    if (!room) return null;
    const mates = dwellersInRoom(state, room.id).sort((a, b) => a.id.localeCompare(b.id));
    const slot = Math.max(0, mates.findIndex((m) => m.id === d.id));
    const capacity = Math.max(1, roomCapacity(room));
    const x = room.col + ((slot + 0.5) * roomWidth(room)) / capacity;
    return { key: `room:${room.id}:${slot}`, point: { floor: room.floor, x } };
  }

  /** Salas por las que pasean niños y habitantes sin asignar. */
  private walkableRooms(grid: GridState): Room[] {
    if (this.walkableCache?.grid !== grid) {
      const connected = getConnectedRoomIds(grid);
      const rooms = Object.values(grid.rooms).filter((r) => r.type !== 'elevator' && connected.has(r.id));
      this.walkableCache = { grid, rooms };
    }
    return this.walkableCache.rooms;
  }

  private retarget(state: GameData, d: Dweller, w: Walker, dt: number): void {
    const assigned = this.assignedTarget(state, d);
    let target = assigned;
    if (!target) {
      w.wanderTimer -= dt;
      const wandering = w.targetKey.startsWith('wander:') && state.grid.rooms[w.targetKey.split(':')[1]];
      if (wandering && (w.path.length > 0 || w.wanderTimer > 0)) return;
      const options = this.walkableRooms(state.grid);
      if (options.length === 0) return;
      const room = options[Math.floor(Math.random() * options.length)];
      const x = room.col + 0.3 + Math.random() * (roomWidth(room) - 0.6);
      target = { key: `wander:${room.id}:${Math.random()}`, point: { floor: room.floor, x } };
      w.wanderTimer = 6 + Math.random() * 10;
    }
    if (target.key === w.targetKey) return;

    w.targetKey = target.key;
    const from = { floor: Math.round(w.floorPos), x: w.x };
    const path = findPath(state.grid, from, target.point);
    if (path) {
      w.path = path;
    } else {
      w.floorPos = target.point.floor;
      w.x = target.point.x;
      w.path = [];
    }
  }

  // -------------------------------------------------------------------------
  // Movimiento y dibujo
  // -------------------------------------------------------------------------

  private step(w: Walker, dt: number): void {
    const next = w.path[0];
    if (!next) {
      w.walkPhase = 0;
      return;
    }
    if (Math.abs(w.floorPos - next.floor) > 1e-4) {
      // Tramo vertical: primero alinearse con el hueco, luego subir/bajar.
      if (Math.abs(w.x - next.x) > 1e-4) {
        w.x += Math.sign(next.x - w.x) * Math.min(Math.abs(next.x - w.x), WALK_SPEED * dt);
      } else {
        w.floorPos += Math.sign(next.floor - w.floorPos) * Math.min(Math.abs(next.floor - w.floorPos), ELEVATOR_SPEED * dt);
      }
    } else {
      w.floorPos = next.floor;
      const dx = next.x - w.x;
      if (Math.abs(dx) > 1e-4) w.view.scale.x = Math.sign(dx) * Math.abs(w.view.scale.y);
      w.x += Math.sign(dx) * Math.min(Math.abs(dx), WALK_SPEED * dt);
      w.walkPhase += dt * 12;
    }
    if (Math.abs(w.floorPos - next.floor) < 1e-4 && Math.abs(w.x - next.x) < 1e-4) w.path.shift();
  }

  private place(w: Walker): void {
    const bob = w.walkPhase ? Math.abs(Math.sin(w.walkPhase)) * -2 : 0;
    w.view.position.set(w.x * CELL_W, w.floorPos * FLOOR_H + FEET_Y + bob);
  }

  // -------------------------------------------------------------------------
  // Selección y arrastre
  // -------------------------------------------------------------------------

  /** Habitante bajo un punto del mundo (el más cercano a sus pies). */
  hitTest(world: Point): string | null {
    let best: string | null = null;
    let bestDist = Infinity;
    for (const [id, w] of this.walkers) {
      const { x, y } = w.view.position;
      const s = Math.abs(w.view.scale.y);
      if (Math.abs(world.x - x) > 10 * s || world.y > y + 2 || world.y < y - BODY_H * s) continue;
      const dist = Math.abs(world.x - x);
      if (dist < bestDist) {
        best = id;
        bestDist = dist;
      }
    }
    return best;
  }

  beginDrag(id: string): void {
    const w = this.walkers.get(id);
    if (!w) return;
    this.draggingId = id;
    w.view.alpha = 0.85;
    this.container.addChild(w.view); // al frente
  }

  dragTo(world: Point): void {
    const w = this.draggingId ? this.walkers.get(this.draggingId) : undefined;
    if (w) w.view.position.set(world.x, world.y + 14);
  }

  /** Suelta al habitante: vuelve a donde estaba y, si cambió de sala, camina hasta ella. */
  endDrag(): void {
    const w = this.draggingId ? this.walkers.get(this.draggingId) : undefined;
    this.draggingId = null;
    if (!w) return;
    w.view.alpha = 1;
    this.place(w);
  }
}
