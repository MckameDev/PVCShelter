import {
  AUTO_RADAWAY_INTOX,
  AUTO_STIMPAK_HP_RATIO,
  MAX_EXPEDITION_MEDS,
  RADAWAY_CURE,
  STIMPAK_HEAL,
  WASTELAND_DANGER_SECONDS,
  WASTELAND_EVENT_SECONDS,
} from './config';
import { effectiveMaxHp, isAdult } from './Dwellers';
import { effectiveStat, petBonus, weaponDamage } from './Equipment';
import { ITEMS } from './items';
import type { ItemDef } from './items';
import { applyLoot, emptyLoot, pushLog } from './Loot';
import { createRng, hashString, randomInt } from './random';
import { fail, ok } from './types';
import type { Dweller, Expedition, GameData, ItemKind, LogEntry, Rarity, Result, Rng } from './types';

// Exploración pasiva del Yermo: un evento por minuto en un registro de texto.
// Los eventos usan un RNG derivado del estado (semilla + explorador + nº de
// evento), así que la misma partida produce siempre la misma historia.
// Nunca se encuentran mascotas: solo salen en las cajas raras (Sprint 8).

export type WastelandEvent =
  | { type: 'explorer-died'; name: string }
  | { type: 'explorer-back'; name: string };

const ENEMIES = ['una rata mutante', 'un saqueador', 'un perro salvaje', 'una cucaracha gigante', 'un topo cabreado', 'un mutante perdido'];
const FLAVOR = [
  'Encontró una lata vacía. Muy vacía.',
  'Caminó entre tuberías reventadas durante un buen rato.',
  'Vio una nube con forma de codo de PVC.',
  'Se refugió de una tormenta de polvo bajo un puente.',
  'Silbó una canción que oyó en la radio del búnker.',
  'Esquivó un charco de agua de un color sospechoso.',
  'Encontró un cartel: "Fontanería Hnos. Pérez — 24 horas".',
  'Revisó un coche oxidado. Solo había un ambientador de pino.',
];

const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)];

export function canStartExpedition(data: GameData, dwellerId: string, stimpaks: number, radaways: number): Result<Dweller> {
  const d = data.dwellers[dwellerId];
  if (!d || !d.alive) return fail('El habitante no está disponible.');
  if (d.location !== 'bunker') return fail(`${d.name} ya está fuera del búnker.`);
  if (!isAdult(d)) return fail('Los niños no pueden salir al Yermo.');
  if (d.pregnancy) return fail(`${d.name} está embarazada: mejor que se quede en el búnker.`);
  if (stimpaks < 0 || radaways < 0 || stimpaks > MAX_EXPEDITION_MEDS || radaways > MAX_EXPEDITION_MEDS) {
    return fail(`Puede llevar hasta ${MAX_EXPEDITION_MEDS} de cada curativo.`);
  }
  if (stimpaks > data.resources.stimpaks || radaways > data.resources.radaways) return fail('No hay tantos curativos en el búnker.');
  return ok(d);
}

export function startExpedition(data: GameData, dwellerId: string, stimpaks: number, radaways: number): Result<GameData> {
  const check = canStartExpedition(data, dwellerId, stimpaks, radaways);
  if (!check.ok) return check;
  const d = check.value;
  const expedition: Expedition = {
    dwellerId,
    status: 'exploring',
    elapsed: 0,
    returnLeft: 0,
    stimpaks,
    radaways,
    events: 0,
    loot: emptyLoot(),
    log: [{ t: 0, text: `${d.name} sale al Yermo con ${stimpaks} vendas y ${radaways} desintoxicantes.`, tone: 'info' }],
  };
  return ok({
    ...data,
    resources: { ...data.resources, stimpaks: data.resources.stimpaks - stimpaks, radaways: data.resources.radaways - radaways },
    dwellers: { ...data.dwellers, [dwellerId]: { ...d, location: 'wasteland', roomId: null, courtship: null, training: 0 } },
    expeditions: { ...data.expeditions, [dwellerId]: expedition },
  });
}

/** Botón "Regresar": la vuelta dura exactamente la mitad de lo explorado. */
export function recallExpedition(data: GameData, dwellerId: string): Result<GameData> {
  const exp = data.expeditions[dwellerId];
  if (!exp || exp.status !== 'exploring') return fail('No está explorando.');
  const next: Expedition = {
    ...exp,
    status: 'returning',
    returnLeft: exp.elapsed / 2,
    log: pushLog(exp.log, { t: exp.elapsed, text: 'Emprende el camino de vuelta al búnker.', tone: 'info' }),
  };
  return ok({ ...data, expeditions: { ...data.expeditions, [dwellerId]: next } });
}

/** Recoge el botín de un explorador que ya volvió y lo devuelve al búnker. */
export function collectExpedition(data: GameData, dwellerId: string): Result<{ data: GameData; scrapped: number; expedition: Expedition }> {
  const exp = data.expeditions[dwellerId];
  if (!exp || exp.status !== 'back') return fail('Todavía no ha vuelto.');
  const applied = applyLoot(data, exp.loot);
  const next = applied.data;
  const expeditions = { ...next.expeditions };
  delete expeditions[dwellerId];
  const d = next.dwellers[dwellerId];
  return ok({
    data: {
      ...next,
      expeditions,
      // Los curativos que no usó vuelven al botiquín del búnker.
      resources: { ...next.resources, stimpaks: next.resources.stimpaks + exp.stimpaks, radaways: next.resources.radaways + exp.radaways },
      dwellers: { ...next.dwellers, [dwellerId]: { ...d, location: 'bunker' } },
    },
    scrapped: applied.scrapped,
    expedition: exp,
  });
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------

function rollRarity(rng: Rng, luck: number, danger: number): Rarity {
  const r = rng();
  if (r < 0.02 + luck * 0.005 + (danger - 1) * 0.01) return 'legendary';
  if (r < 0.2 + luck * 0.02) return 'rare';
  return 'common';
}

function findableItems(kind: ItemKind, rarity: Rarity): ItemDef[] {
  return Object.values(ITEMS).filter((i) => i.kind === kind && i.rarity === rarity);
}

/** Genera un evento y lo aplica (MUTA la expedición y la copia del habitante del tick). */
function rollEvent(exp: Expedition, d: Dweller, rng: Rng, knownRecipes: string[]): void {
  const danger = 1 + exp.elapsed / WASTELAND_DANGER_SECONDS;
  const luck = effectiveStat(d, 'R');
  const t = exp.elapsed;
  const log = (text: string, tone: LogEntry['tone']) => {
    exp.log = pushLog(exp.log, { t, text, tone });
  };
  const roll = rng() * 100;

  if (roll < 28) {
    log(pick(rng, FLAVOR), 'info');
  } else if (roll < 53) {
    const codos = Math.round(randomInt(rng, 5, 15) * danger * (1 + luck * 0.1));
    exp.loot = { ...exp.loot, codos: exp.loot.codos + codos };
    log(`Encontró ${codos} Codos de PVC entre los escombros.`, 'good');
  } else if (roll < 73) {
    const enemy = pick(rng, ENEMIES);
    const defense = Math.min(0.7, effectiveStat(d, 'T') * 0.03 + effectiveStat(d, 'P') * 0.01 + weaponDamage(d) * 0.04);
    const damage = Math.max(1, Math.round((8 + rng() * 10) * danger * (1 - defense)));
    d.hp -= damage;
    d.xp += 8 * danger * (1 + petBonus(d, 'xp'));
    log(`Se cruzó con ${enemy} y ganó la pelea (−${damage} HP).`, 'bad');
  } else if (roll < 85) {
    const rarity: Rarity = rng() < 0.15 + luck * 0.02 ? 'rare' : 'common';
    const amount = randomInt(rng, 1, 2);
    exp.loot = { ...exp.loot, junk: { ...exp.loot.junk, [rarity]: exp.loot.junk[rarity] + amount } };
    log(`Recogió chatarra ${rarity === 'rare' ? 'rara' : 'común'} (×${amount}).`, 'good');
  } else if (roll < 93) {
    const intox = Math.round(randomInt(rng, 5, 15) * danger * (1 - Math.min(0.6, effectiveStat(d, 'N') * 0.04)));
    d.intox = Math.min(d.maxHp, d.intox + intox);
    log(`Bebió de un bidón contaminado (+${intox} intoxicación).`, 'bad');
  } else if (roll < 98) {
    const kind: ItemKind = rng() < 0.5 ? 'weapon' : 'outfit';
    const options = findableItems(kind, rollRarity(rng, luck, danger));
    const item = pick(rng, options);
    exp.loot = { ...exp.loot, items: [...exp.loot.items, item.id] };
    log(`¡Encontró ${kind === 'weapon' ? 'un arma' : 'un atuendo'}: ${item.name}!`, 'good');
  } else {
    const unknown = Object.values(ITEMS).filter(
      (i) => i.kind !== 'pet' && !knownRecipes.includes(i.id) && !exp.loot.recipes.includes(i.id),
    );
    if (unknown.length > 0) {
      const plan = pick(rng, unknown);
      exp.loot = { ...exp.loot, recipes: [...exp.loot.recipes, plan.id] };
      log(`¡Encontró un plano: ${plan.name}!`, 'good');
    } else {
      exp.loot = { ...exp.loot, codos: exp.loot.codos + 50 };
      log('Encontró un plano que ya conocía y lo vendió por 50 Codos.', 'good');
    }
  }

  // Usa curativos por su cuenta cuando hace falta.
  d.hp = Math.min(d.hp, effectiveMaxHp(d));
  if (exp.radaways > 0 && d.intox >= AUTO_RADAWAY_INTOX) {
    exp.radaways--;
    d.intox = Math.max(0, d.intox - RADAWAY_CURE);
    log('Usó un Desintoxicante.', 'info');
  }
  if (d.hp > 0 && exp.stimpaks > 0 && d.hp < effectiveMaxHp(d) * AUTO_STIMPAK_HP_RATIO) {
    exp.stimpaks--;
    d.hp = Math.min(effectiveMaxHp(d), d.hp + STIMPAK_HEAL);
    log('Usó una Venda Casera.', 'info');
  }
}

/**
 * Avanza todas las expediciones `dt` segundos. MUTA `expeditions` y `dwellers`
 * (copias del tick). Devuelve los eventos para avisar al jugador.
 */
export function updateExpeditions(
  expeditions: Record<string, Expedition>,
  dwellers: Record<string, Dweller>,
  knownRecipes: string[],
  seed: number,
  dt: number,
): WastelandEvent[] {
  const events: WastelandEvent[] = [];
  for (const [id, prev] of Object.entries(expeditions)) {
    const d = dwellers[id];
    if (!d) {
      delete expeditions[id];
      continue;
    }
    const exp: Expedition = { ...prev };

    if (exp.status === 'exploring' && d.alive) {
      exp.elapsed += dt;
      while (exp.elapsed >= (exp.events + 1) * WASTELAND_EVENT_SECONDS && d.hp > 0) {
        exp.events++;
        rollEvent(exp, d, createRng((seed ^ hashString(`${id}#${exp.events}`)) >>> 0), knownRecipes);
      }
      if (d.hp <= 0) {
        d.hp = 0;
        d.alive = false;
        exp.status = 'dead';
        exp.log = pushLog(exp.log, { t: exp.elapsed, text: `${d.name} ha muerto en el Yermo.`, tone: 'bad' });
        events.push({ type: 'explorer-died', name: d.name });
      }
    } else if (exp.status === 'returning') {
      exp.returnLeft = Math.max(0, exp.returnLeft - dt);
      if (exp.returnLeft === 0) {
        exp.status = 'back';
        exp.log = pushLog(exp.log, { t: exp.elapsed, text: 'Llegó a la puerta del búnker.', tone: 'good' });
        events.push({ type: 'explorer-back', name: d.name });
      }
    }
    expeditions[id] = exp;
  }
  return events;
}
