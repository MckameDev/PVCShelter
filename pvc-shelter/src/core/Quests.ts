import { CRIT_MULTIPLIERS, QUEST_CRIT_CHARGE_SECONDS, QUEST_SQUAD_SIZE, STIMPAK_HEAL } from './config';
import { aliveEnemies, damageEnemies, dwellerDps } from './Combat';
import { effectiveMaxHp, isAdult } from './Dwellers';
import { ITEMS } from './items';
import { applyLoot, emptyLoot, pushLog } from './Loot';
import { getRuntime } from './Production';
import { questById } from './questCatalog';
import type { QuestDef } from './questCatalog';
import { fail, ok } from './types';
import type { ActiveQuest, Dweller, GameData, LogEntry, Loot, Rarity, Result } from './types';

// Misiones activas: viaje, exploración sala a sala con niebla de guerra,
// combate semiautomático en la simulación y críticos manuales del jugador.

export type QuestEvent =
  | { type: 'quest-arrived'; questId: string }
  | { type: 'quest-failed'; questId: string }
  | { type: 'quest-back'; questId: string };

/** Codos que vale un plano que ya se conocía (se vende en lugar de duplicarse). */
const KNOWN_RECIPE_CODOS = 100;

export function hasWorkingOverseer(data: GameData): boolean {
  return Object.values(data.grid.rooms).some((r) => r.type === 'overseer' && getRuntime(data, r.id).powered);
}

export const squadMembers = (data: Pick<GameData, 'dwellers'>, quest: ActiveQuest): Dweller[] =>
  quest.squad.map((id) => data.dwellers[id]).filter((d): d is Dweller => !!d);

function questLog(quest: ActiveQuest, text: string, tone: LogEntry['tone']): ActiveQuest {
  return { ...quest, log: pushLog(quest.log, { t: 0, text, tone }) };
}

/** Prepara la sala `index`: la revela y carga sus enemigos y botín. */
function enterRoom(quest: ActiveQuest, def: QuestDef, index: number): ActiveQuest {
  const room = def.rooms[index];
  const revealed = [...quest.revealed];
  revealed[index] = true;
  const enemies = (room.enemies ?? []).map((e, i) => ({ id: `q${index}-e${i}`, name: e.name, hp: e.hp, maxHp: e.hp, dps: e.dps }));
  const spots = (room.spots ?? []).map((s, i) => ({ ...s, id: `q${index}-s${i}` }));
  const next = { ...quest, roomIndex: index, revealed, enemies, spots, critCharge: 0 };
  const warning = enemies.length > 0 ? ` ¡${enemies.length} enemigo${enemies.length > 1 ? 's' : ''}!` : '';
  return questLog(next, `Entran en: ${room.name}.${warning}`, enemies.length > 0 ? 'bad' : 'info');
}

export function canStartQuest(data: GameData, questId: string, squad: string[]): Result<QuestDef> {
  const def = questById(questId);
  if (!def) return fail('Esa misión no existe.');
  if (!hasWorkingOverseer(data)) return fail('Necesitas una Oficina del Capataz con energía.');
  if (data.quest) return fail('Ya hay una escuadra en misión.');
  const unique = [...new Set(squad)];
  if (unique.length === 0 || unique.length > QUEST_SQUAD_SIZE) {
    return fail(`La escuadra debe tener entre 1 y ${QUEST_SQUAD_SIZE} habitantes.`);
  }
  for (const id of unique) {
    const d = data.dwellers[id];
    if (!d || !d.alive || !isAdult(d) || d.pregnancy || d.location !== 'bunker') {
      return fail(`${d?.name ?? 'Alguien'} no puede ir de misión.`);
    }
  }
  return ok(def);
}

export function startQuest(data: GameData, questId: string, squad: string[]): Result<GameData> {
  const check = canStartQuest(data, questId, squad);
  if (!check.ok) return check;
  const def = check.value;
  const members = [...new Set(squad)];
  const dwellers = { ...data.dwellers };
  for (const id of members) dwellers[id] = { ...dwellers[id], location: 'quest', roomId: null, courtship: null, training: 0 };
  const quest: ActiveQuest = {
    questId,
    squad: members,
    status: 'traveling',
    travelLeft: def.travelSeconds,
    roomIndex: 0,
    revealed: def.rooms.map(() => false),
    enemies: [],
    spots: [],
    critCharge: 0,
    loot: emptyLoot(),
    failed: false,
    log: [{ t: 0, text: `La escuadra parte hacia ${def.name}.`, tone: 'info' }],
  };
  return ok({ ...data, dwellers, quest });
}

/** Avanza la misión `dt` segundos. MUTA las copias de habitantes del tick. */
export function updateQuest(
  quest: ActiveQuest,
  dwellers: Record<string, Dweller>,
  dt: number,
): { quest: ActiveQuest; events: QuestEvent[] } {
  const def = questById(quest.questId);
  const events: QuestEvent[] = [];
  if (!def) return { quest, events };
  let q: ActiveQuest = { ...quest };

  if (q.status === 'traveling') {
    q.travelLeft = Math.max(0, q.travelLeft - dt);
    if (q.travelLeft === 0) {
      q = enterRoom({ ...q, status: 'exploring' }, def, 0);
      events.push({ type: 'quest-arrived', questId: q.questId });
    }
  } else if (q.status === 'exploring' && aliveEnemies(q.enemies).length > 0) {
    // Combate semiautomático: la escuadra concentra el fuego; los enemigos reparten el suyo.
    const squad = q.squad.map((id) => dwellers[id]).filter((d) => d?.alive);
    const enemyDps = aliveEnemies(q.enemies).reduce((s, e) => s + e.dps, 0);
    q.enemies = damageEnemies(q.enemies, squad.reduce((s, d) => s + dwellerDps(d), 0) * dt);
    for (const d of squad) {
      d.hp -= (enemyDps * dt) / squad.length;
      if (d.hp <= 0) {
        d.hp = 0;
        d.alive = false;
        q = questLog(q, `${d.name} ha caído.`, 'bad');
      }
    }
    q.critCharge = Math.min(1, q.critCharge + dt / QUEST_CRIT_CHARGE_SECONDS);
    if (aliveEnemies(q.enemies).length === 0) q = questLog({ ...q, critCharge: 0 }, 'Sala despejada.', 'good');
    if (q.squad.every((id) => !dwellers[id]?.alive)) {
      q = questLog(
        { ...q, status: 'returning', failed: true, travelLeft: def.travelSeconds, loot: emptyLoot(), enemies: [], spots: [] },
        'La escuadra ha caído. Se perdió el botín.',
        'bad',
      );
      events.push({ type: 'quest-failed', questId: q.questId });
    }
  } else if (q.status === 'returning') {
    q.travelLeft = Math.max(0, q.travelLeft - dt);
    if (q.travelLeft === 0) {
      q = { ...q, status: 'done' };
      events.push({ type: 'quest-back', questId: q.questId });
    }
  }
  return { quest: q, events };
}

/** Pasa a la siguiente sala (o completa la misión si era la última). */
export function advanceQuest(data: GameData): Result<GameData> {
  const q = data.quest;
  const def = q && questById(q.questId);
  if (!q || !def || q.status !== 'exploring') return fail('No hay ninguna escuadra explorando.');
  if (aliveEnemies(q.enemies).length > 0) return fail('Primero hay que despejar la sala.');
  if (q.roomIndex < def.rooms.length - 1) return ok({ ...data, quest: enterRoom(q, def, q.roomIndex + 1) });

  const loot: Loot = { ...q.loot, codos: q.loot.codos + def.rewardCodos };
  const done = questLog(
    { ...q, loot, status: 'returning', travelLeft: def.travelSeconds, enemies: [], spots: [] },
    `¡Misión completada! +${def.rewardCodos} Codos de recompensa.`,
    'good',
  );
  return ok({ ...data, quest: done });
}

/** Recoge un botín brillante de la sala actual. Los planos ya conocidos se venden. */
export function pickLootSpot(data: GameData, spotId: string): Result<GameData> {
  const q = data.quest;
  const spot = q?.spots.find((s) => s.id === spotId);
  if (!q || !spot || q.status !== 'exploring') return fail('Ese botín no está disponible.');
  if (aliveEnemies(q.enemies).length > 0) return fail('Primero hay que despejar la sala.');

  const loot: Loot = { ...q.loot, junk: { ...q.loot.junk }, items: [...q.loot.items], recipes: [...q.loot.recipes] };
  let text = `Recogieron: ${spot.label}`;
  if (spot.codos) loot.codos += spot.codos;
  if (spot.item) loot.items.push(spot.item);
  for (const [r, n] of Object.entries(spot.junk ?? {}) as [Rarity, number][]) loot.junk[r] += n;
  if (spot.recipe) {
    const known = data.inventory.recipes.includes(spot.recipe) || loot.recipes.includes(spot.recipe);
    if (known) {
      loot.codos += KNOWN_RECIPE_CODOS;
      text += ` (plano ya conocido: +${KNOWN_RECIPE_CODOS} Codos)`;
    } else {
      loot.recipes.push(spot.recipe);
      text += ` — ¡plano de ${ITEMS[spot.recipe].name}!`;
    }
  }
  const next = questLog({ ...q, loot, spots: q.spots.filter((s) => s.id !== spotId) }, `${text}.`, 'good');
  return ok({ ...data, quest: next });
}

/** Resultado del minijuego de puntería: precisión 0 (borde) a 1 (centro). */
export function critMultiplier(accuracy: number) {
  return CRIT_MULTIPLIERS.find((c) => accuracy >= c.min) ?? CRIT_MULTIPLIERS[CRIT_MULTIPLIERS.length - 1];
}

/** Crítico manual: daño equivalente a 2 s de ataque de la escuadra × multiplicador. */
export function questCrit(data: GameData, accuracy: number): Result<{ data: GameData; label: string; damage: number }> {
  const q = data.quest;
  if (!q || q.status !== 'exploring' || aliveEnemies(q.enemies).length === 0) return fail('No hay combate en curso.');
  if (q.critCharge < 1) return fail('El crítico aún no está cargado.');
  const crit = critMultiplier(Math.min(1, Math.max(0, accuracy)));
  const squadDps = squadMembers(data, q)
    .filter((d) => d.alive)
    .reduce((s, d) => s + dwellerDps(d), 0);
  const damage = squadDps * 2 * crit.mult;
  let next: ActiveQuest = { ...q, enemies: damageEnemies(q.enemies, damage), critCharge: 0 };
  next = questLog(next, `${crit.label}${damage > 0 ? ` (${Math.round(damage)} de daño)` : ''}`, damage > 0 ? 'good' : 'bad');
  if (aliveEnemies(next.enemies).length === 0) next = questLog(next, 'Sala despejada.', 'good');
  return ok({ data: { ...data, quest: next }, label: crit.label, damage });
}

/** Usa una Venda del búnker en un miembro de la escuadra. */
export function questHeal(data: GameData, dwellerId: string): Result<GameData> {
  const q = data.quest;
  const d = data.dwellers[dwellerId];
  if (!q || !q.squad.includes(dwellerId) || !d?.alive) return fail('No está disponible.');
  if (data.resources.stimpaks < 1) return fail('No quedan Vendas Caseras.');
  if (d.hp >= effectiveMaxHp(d) - 0.5) return fail(`${d.name} no tiene heridas.`);
  return ok({
    ...data,
    resources: { ...data.resources, stimpaks: data.resources.stimpaks - 1 },
    dwellers: { ...data.dwellers, [dwellerId]: { ...d, hp: Math.min(effectiveMaxHp(d), d.hp + STIMPAK_HEAL) } },
  });
}

/** Cierra una misión terminada: entrega el botín y devuelve a la escuadra al búnker. */
export function collectQuest(data: GameData): Result<{ data: GameData; scrapped: number; failed: boolean }> {
  const q = data.quest;
  if (!q || q.status !== 'done') return fail('La escuadra aún no ha vuelto.');
  const applied = q.failed ? { data, scrapped: 0 } : applyLoot(data, q.loot);
  const dwellers = { ...applied.data.dwellers };
  for (const id of q.squad) if (dwellers[id]) dwellers[id] = { ...dwellers[id], location: 'bunker' };
  const questsDone = q.failed || data.questsDone.includes(q.questId) ? data.questsDone : [...data.questsDone, q.questId];
  return ok({ data: { ...applied.data, dwellers, quest: null, questsDone }, scrapped: applied.scrapped, failed: q.failed });
}
