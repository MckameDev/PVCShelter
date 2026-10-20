import { Application, Container, Graphics, Text } from 'pixi.js';
import { ROOM_DEFS } from '../core/config';
import { craftTime } from '../core/Crafting';
import { assignDweller, dwellersInRoom, globalHappiness } from '../core/Dwellers';
import { buildCost, roomCapacity } from '../core/Economy';
import { findRockAt, findRoomAt, getValidPlacements, roomWidth } from '../core/GridManager';
import type { Placement } from '../core/GridManager';
import type { ProducedResource } from '../core/types';
import { useGameStore } from '../store/useGameStore';
import { cycleTime, getRuntime } from '../core/Production';
import { canStartExpedition } from '../core/Wasteland';
import { DwellerLayer } from './DwellerSprite';
import { drawInspector, hitInspector } from './InspectorSprite';
import { drawRaid } from './RaidSprite';
import { createRockView, createRoomView } from './RoomSprite';
import { drawRoomStatus, READY_ICON_RADIUS, readyIconCenter } from './StatusSprite';
import { createTerrainView, worldBounds } from './TerrainSprite';
import type { WorldBounds } from './TerrainSprite';
import { CELL_W, DRAG_THRESHOLD, FLOOR_H, MAX_ZOOM, MIN_ZOOM, TOP_BAR_H } from './layout';

type GameSnapshot = ReturnType<typeof useGameStore.getState>;

interface Point {
  x: number;
  y: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Escena Pixi del búnker. Es dueña de la cámara (paneo/zoom) y traduce los
 * clics en coordenadas de celda para despachar acciones al store. No contiene
 * reglas de juego: todo lo que decide qué es válido vive en core/.
 */
export class BunkerStage {
  private app: Application | null = null;
  private readonly world = new Container();
  private readonly terrainLayer = new Container();
  private readonly rockLayer = new Container();
  private readonly roomLayer = new Container();
  /** Estado dinámico (progreso, incidentes, energía), redibujado cada frame. */
  private readonly statusLayer = new Graphics();
  private readonly dwellers = new DwellerLayer();
  private readonly overlay = new Graphics();
  private readonly ghostLabel = new Text({
    text: '',
    resolution: 2,
    style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '800', fill: 0xffffff, stroke: { color: 0x0b3d1a, width: 4 } },
  });

  private bounds: WorldBounds = { left: 0, top: 0, right: 0, bottom: 0 };
  private terrainKey = '';
  private placements: Placement[] = [];
  private hovered: Placement | null = null;
  private unsubscribe: (() => void) | null = null;
  private destroyed = false;

  // Estado de entrada
  private readonly pointers = new Map<number, Point>();
  private dragOrigin: Point | null = null;
  private worldOrigin: Point = { x: 0, y: 0 };
  private dragged = false;
  private pinch: { dist: number; scale: number } | null = null;
  /** Habitante agarrado con el puntero; `active` cuando ya superó el umbral de arrastre. */
  private dwellerGrab: { id: string; origin: Point; active: boolean } | null = null;
  private dropTarget: { roomId: string; valid: boolean } | null = null;
  /** Arrastrando un habitante sobre la superficie: soltarlo lo envía al Yermo. */
  private dropOnSurface: { valid: boolean } | null = null;

  async init(host: HTMLElement): Promise<void> {
    const app = new Application();
    await app.init({
      resizeTo: host,
      background: 0x0d0907,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });
    // React puede desmontar mientras init() estaba en curso.
    if (this.destroyed) {
      app.destroy(true, { children: true });
      return;
    }
    this.app = app;
    host.appendChild(app.canvas);
    app.canvas.style.touchAction = 'none';
    app.canvas.style.display = 'block';

    this.world.addChild(this.terrainLayer, this.rockLayer, this.roomLayer, this.dwellers.container, this.statusLayer, this.overlay, this.ghostLabel);
    this.ghostLabel.anchor.set(0.5);
    this.ghostLabel.visible = false;
    app.stage.addChild(this.world);

    this.bindInput(app.canvas);
    app.renderer.on('resize', this.handleResize);

    app.ticker.add(this.drawStatus);
    app.ticker.add(this.updateDwellers);
    this.sync(useGameStore.getState(), null);
    this.unsubscribe = useGameStore.subscribe((state, prev) => this.sync(state, prev));
    this.focusEntrance();
  }

  destroy(): void {
    this.destroyed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (!this.app) return;
    this.unbindInput(this.app.canvas);
    this.app.renderer.off('resize', this.handleResize);
    this.app.destroy(true, { children: true });
    this.app = null;
  }

  // -------------------------------------------------------------------------
  // Cámara
  // -------------------------------------------------------------------------

  zoomBy(factor: number): void {
    if (!this.app) return;
    this.zoomAt({ x: this.app.screen.width / 2, y: this.app.screen.height / 2 }, this.world.scale.x * factor);
  }

  /** Encuadra todo el búnker en pantalla. */
  fitAll(): void {
    if (!this.app) return;
    const scale = this.minScale();
    this.world.scale.set(scale);
    this.world.position.set(-this.bounds.left * scale, -this.bounds.top * scale);
    this.clampCamera();
  }

  /** Vista inicial: zoom 1 con la superficie y la puerta arriba a la izquierda. */
  focusEntrance(): void {
    this.world.scale.set(1);
    this.world.position.set(-this.bounds.left + 8, -this.bounds.top + TOP_BAR_H);
    this.clampCamera();
  }

  /** Alejar más allá de ver el búnker entero no aporta nada. */
  private minScale(): number {
    if (!this.app) return MIN_ZOOM;
    const { width, height } = this.app.screen;
    const fit = Math.min(width / (this.bounds.right - this.bounds.left), height / (this.bounds.bottom - this.bounds.top));
    return clamp(fit, MIN_ZOOM, 1);
  }

  private zoomAt(screen: Point, nextScale: number): void {
    const scale = clamp(nextScale, this.minScale(), MAX_ZOOM);
    const before = this.screenToWorld(screen);
    this.world.scale.set(scale);
    this.world.position.set(screen.x - before.x * scale, screen.y - before.y * scale);
    this.clampCamera();
  }

  /** Evita perder el búnker de vista; si cabe entero en un eje, lo centra. */
  private clampCamera(): void {
    if (!this.app) return;
    const { width, height } = this.app.screen;
    const s = this.world.scale.x;
    const slack = 80;
    const axis = (pos: number, view: number, min: number, max: number) => {
      const size = (max - min) * s;
      if (size + slack * 2 <= view) return (view - size) / 2 - min * s;
      return clamp(pos, view - max * s - slack, -min * s + slack);
    };
    this.world.position.set(
      axis(this.world.position.x, width, this.bounds.left, this.bounds.right),
      axis(this.world.position.y, height, this.bounds.top, this.bounds.bottom),
    );
  }

  private readonly handleResize = () => this.clampCamera();

  private screenToWorld(p: Point): Point {
    const s = this.world.scale.x;
    return { x: (p.x - this.world.position.x) / s, y: (p.y - this.world.position.y) / s };
  }

  // -------------------------------------------------------------------------
  // Sincronización con el store
  // -------------------------------------------------------------------------

  private sync(state: GameSnapshot, prev: GameSnapshot | null): void {
    const { grid } = state;
    const gridChanged = !prev || prev.grid !== grid;

    const key = `${grid.floors}x${grid.cols}`;
    if (key !== this.terrainKey) {
      this.terrainKey = key;
      this.bounds = worldBounds(grid.floors, grid.cols);
      this.replaceChildren(this.terrainLayer, [createTerrainView(grid.floors, grid.cols)]);
    }
    if (gridChanged) {
      this.replaceChildren(this.rockLayer, Object.values(grid.rocks).map(createRockView));
      this.replaceChildren(this.roomLayer, Object.values(grid.rooms).map(createRoomView));
    }
    if (!prev || gridChanged || prev.buildType !== state.buildType) {
      this.placements = state.buildType ? getValidPlacements(grid, state.buildType) : [];
      this.hovered = null;
    }
    this.drawOverlay(state);
  }

  private replaceChildren(layer: Container, children: Container[]): void {
    for (const old of layer.removeChildren()) old.destroy({ children: true });
    if (children.length > 0) layer.addChild(...children);
  }

  private drawOverlay(state: GameSnapshot): void {
    const g = this.overlay.clear();
    this.ghostLabel.visible = false;

    for (const p of this.placements) {
      const isHover = p === this.hovered;
      g.roundRect(p.col * CELL_W + 3, p.floor * FLOOR_H + 3, p.width * CELL_W - 6, FLOOR_H - 6, 6)
        .fill({ color: 0x3ddc84, alpha: isHover ? 0.45 : 0.18 })
        .stroke({ width: 2, color: 0x3ddc84, alpha: isHover ? 1 : 0.6 });
    }
    if (this.hovered && state.buildType) {
      this.ghostLabel.text = `+ ${buildCost(state.grid, state.buildType)}`;
      this.ghostLabel.position.set(
        (this.hovered.col + this.hovered.width / 2) * CELL_W,
        (this.hovered.floor + 0.5) * FLOOR_H,
      );
      this.ghostLabel.visible = true;
    }

    if (this.dropOnSurface) {
      const color = this.dropOnSurface.valid ? 0x3ddc84 : 0xff5a4a;
      g.rect(this.bounds.left, this.bounds.top, this.bounds.right - this.bounds.left, -this.bounds.top)
        .fill({ color, alpha: 0.18 })
        .stroke({ width: 4, color });
      this.ghostLabel.text = this.dropOnSurface.valid ? 'Soltar para salir al Yermo' : 'No puede salir al Yermo';
      this.ghostLabel.position.set((this.bounds.right + this.bounds.left) / 2, this.bounds.top / 2);
      this.ghostLabel.visible = true;
    }
    if (this.dropTarget) {
      const room = state.grid.rooms[this.dropTarget.roomId];
      if (room) {
        const color = this.dropTarget.valid ? 0x3ddc84 : 0xff5a4a;
        g.rect(room.col * CELL_W, room.floor * FLOOR_H, roomWidth(room) * CELL_W, FLOOR_H)
          .fill({ color, alpha: 0.2 })
          .stroke({ width: 4, color });
      }
    }

    const sel = state.selection;
    if (sel?.kind === 'room') {
      const room = state.grid.rooms[sel.id];
      if (room) {
        g.rect(room.col * CELL_W, room.floor * FLOOR_H, roomWidth(room) * CELL_W, FLOOR_H).stroke({ width: 4, color: 0xf2c94c });
      }
    } else if (sel?.kind === 'rock') {
      const rock = state.grid.rocks[sel.id];
      if (rock) {
        g.rect(rock.col * CELL_W, rock.floor * FLOOR_H, rock.width * CELL_W, FLOOR_H).stroke({ width: 4, color: 0xff6b5a });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Entrada (DOM pointer events: un solo camino para ratón y táctil)
  // -------------------------------------------------------------------------

  private bindInput(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerCancel);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  private unbindInput(canvas: HTMLCanvasElement): void {
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerCancel);
    canvas.removeEventListener('pointerleave', this.onPointerLeave);
    canvas.removeEventListener('wheel', this.onWheel);
  }

  private localPoint(e: PointerEvent | WheelEvent): Point {
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private readonly onPointerDown = (e: PointerEvent) => {
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, this.localPoint(e));
    if (this.pointers.size === 1) {
      const p = this.localPoint(e);
      this.dragged = false;
      const state = useGameStore.getState();
      const world = this.screenToWorld(p);
      // El Inspector tiene prioridad: se atrapa con un toque, no se arrastra a nadie.
      const id = state.buildType || hitInspector(state.inspector, state.grid, world) ? null : this.dwellers.hitTest(world);
      if (id) {
        this.dwellerGrab = { id, origin: p, active: false };
        this.dragOrigin = null;
        return;
      }
      this.startDrag(p);
    } else if (this.pointers.size === 2) {
      this.cancelDwellerDrag();
      const [a, b] = [...this.pointers.values()];
      this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: this.world.scale.x };
      this.dragged = true; // un gesto de dos dedos nunca es un clic
    }
  };

  private readonly onPointerMove = (e: PointerEvent) => {
    const p = this.localPoint(e);
    if (!this.pointers.has(e.pointerId)) {
      this.updateHover(p);
      return;
    }
    this.pointers.set(e.pointerId, p);

    if (this.dwellerGrab) {
      this.moveDwellerDrag(p);
      return;
    }
    if (this.pointers.size >= 2 && this.pinch) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinch.dist > 0) {
        this.zoomAt({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, this.pinch.scale * (dist / this.pinch.dist));
      }
      return;
    }
    if (this.dragOrigin) {
      const dx = p.x - this.dragOrigin.x;
      const dy = p.y - this.dragOrigin.y;
      if (!this.dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      this.dragged = true;
      this.world.position.set(this.worldOrigin.x + dx, this.worldOrigin.y + dy);
      this.clampCamera();
    }
  };

  private readonly onPointerUp = (e: PointerEvent) => {
    const grab = this.dwellerGrab;
    const wasTap = this.pointers.size === 1 && !this.dragged;
    this.releasePointer(e.pointerId);
    if (grab) this.finishDwellerDrag(grab);
    else if (wasTap) this.handleTap(this.localPoint(e));
  };

  private readonly onPointerCancel = (e: PointerEvent) => {
    this.dragged = true;
    this.cancelDwellerDrag();
    this.releasePointer(e.pointerId);
  };

  // -------------------------------------------------------------------------
  // Drag & drop de habitantes
  // -------------------------------------------------------------------------

  private readonly updateDwellers = () => {
    if (!this.app) return;
    // Tope de dt para que al volver de una pestaña dormida no "teletransporten".
    this.dwellers.update(useGameStore.getState(), Math.min(this.app.ticker.deltaMS / 1000, 0.1));
  };

  private moveDwellerDrag(screen: Point): void {
    const grab = this.dwellerGrab!;
    if (!grab.active) {
      if (Math.hypot(screen.x - grab.origin.x, screen.y - grab.origin.y) < DRAG_THRESHOLD) return;
      grab.active = true;
      this.dwellers.beginDrag(grab.id);
    }
    const world = this.screenToWorld(screen);
    this.dwellers.dragTo(world);

    const state = useGameStore.getState();
    this.dropOnSurface = world.y < 0 ? { valid: canStartExpedition(state, grab.id, 0, 0).ok } : null;
    const room = findRoomAt(state.grid, Math.floor(world.y / FLOOR_H), Math.floor(world.x / CELL_W));
    const dweller = state.dwellers[grab.id];
    this.dropTarget =
      room && dweller
        ? { roomId: room.id, valid: room.id === dweller.roomId || assignDweller(state, grab.id, room.id).ok }
        : null;
    this.drawOverlay(state);
  }

  private finishDwellerDrag(grab: { id: string; active: boolean }): void {
    const state = useGameStore.getState();
    const target = this.dropTarget;
    const surface = this.dropOnSurface;
    this.dwellerGrab = null;
    this.dropTarget = null;
    this.dropOnSurface = null;
    if (surface && grab.active) {
      // Fuera del búnker: diálogo para elegir curativos (muestra el motivo si no puede salir).
      this.dwellers.endDrag();
      state.setExpeditionDraft(grab.id);
      this.drawOverlay(state);
      return;
    }
    if (!grab.active) {
      // Un toque sin arrastre abre la ficha del habitante.
      state.openDweller(grab.id);
      return;
    }
    this.dwellers.endDrag();
    // Si la sala no es válida, assign() publica el motivo como aviso.
    if (target && target.roomId !== state.dwellers[grab.id]?.roomId) state.assign(grab.id, target.roomId);
    this.drawOverlay(useGameStore.getState());
  }

  private cancelDwellerDrag(): void {
    if (this.dwellerGrab?.active) this.dwellers.endDrag();
    this.dwellerGrab = null;
    this.dropTarget = null;
    this.dropOnSurface = null;
  }

  private readonly onPointerLeave = () => {
    if (this.pointers.size === 0 && this.hovered) {
      this.hovered = null;
      this.drawOverlay(useGameStore.getState());
    }
  };

  private releasePointer(id: number): void {
    this.pointers.delete(id);
    this.pinch = null;
    const remaining = [...this.pointers.values()][0];
    // Al soltar un dedo del pinch, el otro sigue paneando desde donde está.
    if (remaining) this.startDrag(remaining);
    else this.dragOrigin = null;
  }

  private startDrag(p: Point): void {
    this.dragOrigin = p;
    this.worldOrigin = { x: this.world.position.x, y: this.world.position.y };
  }

  private readonly onWheel = (e: WheelEvent) => {
    e.preventDefault();
    // deltaMode 1 = líneas (Firefox); se normaliza a píxeles aproximados.
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    this.zoomAt(this.localPoint(e), this.world.scale.x * Math.exp(-delta * 0.0015));
  };

  /** Hueco de construcción bajo el punto; si se solapan, el de centro más cercano. */
  private pickPlacement(world: Point): Placement | null {
    const floor = Math.floor(world.y / FLOOR_H);
    const col = world.x / CELL_W;
    let best: Placement | null = null;
    let bestDist = Infinity;
    for (const p of this.placements) {
      if (p.floor !== floor || col < p.col || col >= p.col + p.width) continue;
      const dist = Math.abs(col - (p.col + p.width / 2));
      if (dist < bestDist) {
        best = p;
        bestDist = dist;
      }
    }
    return best;
  }

  private updateHover(screen: Point): void {
    if (!this.app) return;
    if (this.placements.length === 0) {
      const world = this.screenToWorld(screen);
      this.app.canvas.style.cursor = this.pickReadyIcon(world) ? 'pointer' : this.dwellers.hitTest(world) ? 'grab' : '';
      return;
    }
    const next = this.pickPlacement(this.screenToWorld(screen));
    if (next !== this.hovered) {
      this.hovered = next;
      this.app.canvas.style.cursor = next ? 'pointer' : '';
      this.drawOverlay(useGameStore.getState());
    }
  }

  private readonly drawStatus = () => {
    const state = useGameStore.getState();
    const g = this.statusLayer.clear();
    const now = performance.now();
    const happiness = globalHappiness(state);
    for (const room of Object.values(state.grid.rooms)) {
      const capacity = roomCapacity(room);
      if (capacity === 0) continue;
      const workers = dwellersInRoom(state, room.id);
      const runtime = getRuntime(state, room.id);
      drawRoomStatus(
        g,
        {
          room,
          runtime,
          workers: workers.length,
          capacity,
          cycle: cycleTime(room, workers, happiness),
          craftTotal: runtime.craft ? craftTime(room, runtime.craft.defId, workers) : null,
        },
        now,
      );
    }
    if (state.raid) drawRaid(g, state.raid, state.grid, now);
    if (state.inspector) drawInspector(g, state.inspector, state.grid, now);
  };

  /** Si el punto cae sobre el icono de una sala lista, devuelve el recurso a recolectar. */
  /** Icono flotante bajo el punto: recurso para recolectar u objeto terminado en un taller. */
  private pickReadyIcon(world: Point): { roomId: string; resource: ProducedResource | null } | null {
    const state = useGameStore.getState();
    const room = findRoomAt(state.grid, Math.floor(world.y / FLOOR_H), Math.floor(world.x / CELL_W));
    if (!room || !getRuntime(state, room.id).ready) return null;
    const resource = ROOM_DEFS[room.type].produces;
    if (!resource && !getRuntime(state, room.id).craft) return null;
    const c = readyIconCenter(room);
    return Math.hypot(world.x - c.x, world.y - c.y) <= READY_ICON_RADIUS + 8 ? { roomId: room.id, resource } : null;
  }

  private handleTap(screen: Point): void {
    const state = useGameStore.getState();
    const world = this.screenToWorld(screen);

    if (!state.buildType && hitInspector(state.inspector, state.grid, world)) {
      state.catchInspector();
      return;
    }

    if (!state.buildType) {
      const icon = this.pickReadyIcon(world);
      if (icon) {
        if (icon.resource) state.collect(icon.resource);
        else state.collectCrafted(icon.roomId);
        return;
      }
    }

    if (state.buildType) {
      const placement = this.pickPlacement(world);
      if (placement) {
        state.build(placement.floor, placement.col);
        return;
      }
    }

    const floor = Math.floor(world.y / FLOOR_H);
    const col = Math.floor(world.x / CELL_W);
    const room = findRoomAt(state.grid, floor, col);
    if (room) return state.select({ kind: 'room', id: room.id });
    const rock = findRockAt(state.grid, floor, col);
    if (rock) return state.select({ kind: 'rock', id: rock.id });
    state.select(null);
  }
}
