import { describe, expect, it } from 'vitest';
import { applyRoomChange, createNewGame } from './Bunker';
import { createIncident } from './Combat';
import { ACTIVE_OBJECTIVES, BLOCK_CELLS, BOX_PRICES, OFFLINE_MAX_SECONDS } from './config';
import { assignDweller } from './Dwellers';
import { placeRoom } from './GridManager';
import { ITEMS } from './items';
import { CARDS_PER_BOX, openBox } from './Lunchbox';
import { computeOffline } from './OfflineCalc';
import { applySignals, claimObjective, createObjectives, discardObjective, signalsFromEvents } from './Objectives';
import { cycleTime } from './Production';
import { parseSave, serializeGame } from './SaveFormat';
import { buyBox, claimSimulatedPack, speedupCost, speedupExpedition } from './Shop';
import { advance } from './Simulation';
import type { GameData, Result, RoomType } from './types';
import { recallExpedition, startExpedition } from './Wasteland';

const E = BLOCK_CELLS;

function unwrap<T>(res: Result<T>): T {
  if (!res.ok) throw new Error(res.reason);
  return res.value;
}

function newGame(seed = 77): GameData {
  const data = createNewGame(seed);
  return { ...data, grid: { ...data.grid, rocks: {} } };
}

function build(data: GameData, type: RoomType, floor = 0, col = E + 1) {
  const change = unwrap(placeRoom(data.grid, type, floor, col));
  return { data: applyRoomChange(data, change), roomId: change.roomId };
}

/** RNG secuencial a partir de una semilla simple (para cajas reproducibles en tests). */
function seqRng(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

describe('objetivos diarios', () => {
  it('hay 3 activos y distintos entre sí', () => {
    const { active } = createObjectives(123);
    expect(active).toHaveLength(ACTIVE_OBJECTIVES);
    expect(new Set(active.map((o) => o.templateId)).size).toBe(ACTIVE_OBJECTIVES);
  });

  it('avanzan con las señales, se reclaman y se reemplazan', () => {
    let data = newGame();
    const objective = data.objectives.active[0];
    data = applySignals(data, [{ kind: objective.kind, amount: 1_000, resource: objective.resource }]);
    const done = data.objectives.active[0];
    expect(done.progress).toBe(done.target);

    const before = { ...data.resources, boxes: { ...data.boxes } };
    const { data: after } = unwrap(claimObjective(data, done.id));
    const reward = done.reward;
    if ('codos' in reward) expect(after.resources.codos).toBe(before.codos + reward.codos);
    if ('cinta' in reward) expect(after.resources.cinta).toBe(before.cinta + reward.cinta);
    if ('box' in reward) expect(after.boxes[reward.box]).toBe(before.boxes[reward.box] + 1);
    expect(after.objectives.active).toHaveLength(ACTIVE_OBJECTIVES);
    expect(after.objectives.active.some((o) => o.id === done.id)).toBe(false);
  });

  it('no se puede reclamar uno sin completar', () => {
    const data = newGame();
    expect(claimObjective(data, data.objectives.active[0].id).ok).toBe(false);
  });

  it('solo se puede descartar uno al día', () => {
    let data = newGame();
    data = unwrap(discardObjective(data, data.objectives.active[0].id, '2026-10-20'));
    expect(discardObjective(data, data.objectives.active[1].id, '2026-10-20').ok).toBe(false);
    expect(discardObjective(data, data.objectives.active[1].id, '2026-10-21').ok).toBe(true);
  });

  it('las averías que se apagan solas no cuentan como incidente apagado', () => {
    const signals = signalsFromEvents([
      { type: 'incident-resolved', roomId: 'a', kind: 'fire', codos: 0 },
      { type: 'incident-resolved', roomId: 'b', kind: 'fire', codos: 15 },
    ]);
    expect(signals).toEqual([{ kind: 'incident', amount: 1 }]);
  });
});

describe('Cajas de Herramientas', () => {
  it('traen 5 cartas y se descuentan', () => {
    const data = { ...newGame(), boxes: { common: 1, rare: 1 } };
    const { data: after, cards } = unwrap(openBox(data, 'common', seqRng(1)));
    expect(cards).toHaveLength(CARDS_PER_BOX);
    expect(after.boxes.common).toBe(0);
    expect(openBox(after, 'common', seqRng(2)).ok).toBe(false);
  });

  it('las comunes nunca dan mascotas; las raras siempre dan una', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const data = { ...newGame(), boxes: { common: 1, rare: 1 } };
      const common = unwrap(openBox(data, 'common', seqRng(seed)));
      expect(common.cards.some((c) => c.kind === 'pet')).toBe(false);
      const rare = unwrap(openBox(data, 'rare', seqRng(seed)));
      const pets = rare.cards.filter((c) => c.kind === 'pet');
      expect(pets.length).toBeGreaterThanOrEqual(1);
      for (const p of pets) expect(ITEMS[(p as { defId: string }).defId].kind).toBe('pet');
      // La mascota entra en el inventario aunque esté lleno.
      const petCount = (d: GameData) => Object.values(d.inventory.items).filter((i) => ITEMS[i.defId].kind === 'pet').length;
      expect(petCount(rare.data)).toBe(petCount(data) + pets.length);
    }
  });

  it('pueden traer habitantes raros o legendarios con buenos stats', () => {
    let found = false;
    for (let seed = 1; seed <= 200 && !found; seed++) {
      const data = { ...newGame(), boxes: { common: 0, rare: 1 } };
      const { data: after, cards } = unwrap(openBox(data, 'rare', seqRng(seed)));
      const card = cards.find((c) => c.kind === 'dweller');
      if (card && card.kind === 'dweller') {
        found = true;
        const d = after.dwellers[card.dwellerId];
        expect(Math.max(...Object.values(d.stats))).toBeGreaterThanOrEqual(8);
      }
    }
    expect(found).toBe(true);
  });
});

describe('tienda simulada y aceleradores', () => {
  it('los paquetes añaden cinta y las cajas se pagan con cinta', () => {
    let data = newGame();
    data = unwrap(claimSimulatedPack(data, 'small')).data;
    expect(data.resources.cinta).toBe(newGame().resources.cinta + 10);
    const bought = unwrap(buyBox(data, 'common'));
    expect(bought.resources.cinta).toBe(data.resources.cinta - BOX_PRICES.common);
    expect(bought.boxes.common).toBe(data.boxes.common + 1);
    expect(buyBox({ ...data, resources: { ...data.resources, cinta: 0 } }, 'rare').ok).toBe(false);
  });

  it('acelerar cuesta 1 rollo por minuto y termina la vuelta del explorador', () => {
    expect(speedupCost(30)).toBe(1);
    expect(speedupCost(61)).toBe(2);
    let data = newGame();
    const id = Object.keys(data.dwellers)[0];
    data = unwrap(startExpedition(data, id, 0, 0));
    data = { ...data, dwellers: { ...data.dwellers, [id]: { ...data.dwellers[id], hp: 10_000, maxHp: 10_000 } } };
    data = advance(data, 240).data;
    data = unwrap(recallExpedition(data, id));
    data = { ...data, resources: { ...data.resources, cinta: 10 } };
    const fast = unwrap(speedupExpedition(data, id));
    expect(fast.resources.cinta).toBe(10 - speedupCost(120));
    expect(advance(fast, 0.25).data.expeditions[id].status).toBe('back');
  });
});

describe('progreso offline', () => {
  function farm() {
    let { data, roomId } = build(newGame(), 'food');
    for (const id of Object.keys(data.dwellers).slice(0, 2)) data = unwrap(assignDweller(data, id, roomId));
    data = { ...data, resources: { ...data.resources, food: 20, water: 500, energy: 500 } };
    return { data, roomId };
  }

  it('produce y consume durante la ausencia, con recolección automática', () => {
    const { data, roomId } = farm();
    const t = cycleTime(data.grid.rooms[roomId], [data.dwellers['dweller-1'], data.dwellers['dweller-2']])!;
    const res = computeOffline(data, t * 6)!;
    expect(res.summary.simulatedSeconds).toBeCloseTo(t * 6);
    // Varios ciclos recolectados solos: la sala no se queda parada en "lista".
    expect(res.data.runtime[roomId].ready).toBe(false);
    expect(res.data.resources.water).toBeLessThan(500);
  });

  it('se recorta al máximo y no genera incidentes ni asaltos', () => {
    let { data } = farm();
    // Población alta para que, en juego normal, salgan incidentes y asaltos.
    const base = data.dwellers['dweller-1'];
    const extra = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`x-${i}`, { ...base, id: `x-${i}`, roomId: null }]));
    data = { ...data, dwellers: { ...data.dwellers, ...extra }, resources: { ...data.resources, food: 5000, water: 5000 } };
    const res = computeOffline(data, OFFLINE_MAX_SECONDS * 10)!;
    expect(res.summary.capped).toBe(true);
    expect(res.summary.simulatedSeconds).toBe(OFFLINE_MAX_SECONDS);
    expect(res.data.raid).toBeNull();
    expect(Object.values(res.data.runtime).some((r) => r.incident)).toBe(false);
    expect(res.data.inspector).toBeNull();
  });

  it('nadie muere de hambre ni de sed en el búnker mientras no estás', () => {
    const data = { ...newGame(), resources: { ...newGame().resources, food: 0, water: 0 } };
    const res = computeOffline(data, OFFLINE_MAX_SECONDS)!;
    expect(res.summary.counts.deaths).toBe(0);
    expect(Object.values(res.data.dwellers).every((d) => d.alive && d.hp > 0)).toBe(true);
  });

  it('ausencias muy cortas no se simulan aparte', () => {
    expect(computeOffline(newGame(), 5)).toBeNull();
  });
});

describe('formato de guardado', () => {
  it('ida y vuelta por JSON sin perder nada', () => {
    let data = newGame();
    data = advance(data, 30).data;
    const raw = JSON.parse(JSON.stringify(serializeGame(data)));
    expect(unwrap(parseSave(raw))).toEqual(data);
  });

  it('rechaza partidas corruptas o de versiones futuras', () => {
    expect(parseSave(null).ok).toBe(false);
    expect(parseSave({ schema: 1, game: { grid: 'x' } }).ok).toBe(false);
    expect(parseSave({ schema: 999, game: serializeGame(newGame()).game }).ok).toBe(false);
    const broken = JSON.parse(JSON.stringify(serializeGame(newGame())));
    broken.game.resources.codos = 'muchos';
    expect(parseSave(broken).ok).toBe(false);
  });

  it('rellena campos que falten de versiones anteriores', () => {
    const raw = JSON.parse(JSON.stringify(serializeGame(newGame())));
    delete raw.game.objectives;
    delete raw.game.boxes;
    delete raw.game.quests;
    const parsed = unwrap(parseSave(raw));
    expect(parsed.objectives.active).toHaveLength(ACTIVE_OBJECTIVES);
    expect(parsed.boxes).toBeDefined();
    expect(parsed.quests).toEqual([]);
  });

  it('una avería en curso sobrevive al guardado', () => {
    const { data, roomId } = build(newGame(), 'storage');
    const incident = createIncident('fire', data.grid.rooms[roomId]);
    const withFire = { ...data, runtime: { ...data.runtime, [roomId]: { ...data.runtime[roomId], incident } } };
    const parsed = unwrap(parseSave(JSON.parse(JSON.stringify(serializeGame(withFire)))));
    expect(parsed.runtime[roomId].incident).toEqual(incident);
  });
});
