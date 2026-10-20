import { ACTIVE_OBJECTIVES } from './config';
import { OBJECTIVE_TEMPLATES } from './objectiveCatalog';
import { createRng, hashString } from './random';
import type { SimEvent } from './Simulation';
import { fail, ok } from './types';
import type { GameData, Objective, ObjectiveKind, ObjectivesState, ProducedResource, Result } from './types';

// Objetivos diarios: 3 activos a la vez; al reclamar uno sale otro nuevo.
// Se puede descartar 1 al día. La generación usa un RNG derivado de la semilla
// y un contador, así que es reproducible.

/** Algo que hizo el jugador o la simulación y que puede contar para un objetivo. */
export interface ObjectiveSignal {
  kind: ObjectiveKind;
  amount: number;
  resource?: ProducedResource;
}

function generateObjective(seed: number, serial: number, exclude: string[]): Objective {
  const rng = createRng((seed ^ hashString(`objective#${serial}`)) >>> 0);
  const pool = OBJECTIVE_TEMPLATES.filter((t) => !exclude.includes(t.id));
  const template = pool[Math.floor(rng() * pool.length)];
  const target = template.targets[Math.floor(rng() * template.targets.length)];
  return {
    id: `objective-${serial}`,
    templateId: template.id,
    kind: template.kind,
    resource: template.resource,
    text: template.text(target),
    target,
    progress: 0,
    reward: template.reward,
  };
}

export function createObjectives(seed: number): ObjectivesState {
  const active: Objective[] = [];
  for (let serial = 1; serial <= ACTIVE_OBJECTIVES; serial++) {
    active.push(generateObjective(seed, serial, active.map((o) => o.templateId)));
  }
  return { active, serial: ACTIVE_OBJECTIVES + 1, lastDiscardDate: null };
}

/** Sustituye un objetivo por uno nuevo distinto de los activos. */
function replaceObjective(state: ObjectivesState, seed: number, id: string): ObjectivesState {
  const others = state.active.filter((o) => o.id !== id);
  const fresh = generateObjective(seed, state.serial, others.map((o) => o.templateId));
  return { ...state, active: state.active.map((o) => (o.id === id ? fresh : o)), serial: state.serial + 1 };
}

export const isComplete = (o: Objective) => o.progress >= o.target;

/** Suma el progreso de las señales a los objetivos que coinciden. */
export function applySignals(data: GameData, signals: ObjectiveSignal[]): GameData {
  if (signals.length === 0) return data;
  let changed = false;
  const active = data.objectives.active.map((o) => {
    let progress = o.progress;
    for (const s of signals) {
      if (s.kind === o.kind && (!o.resource || o.resource === s.resource)) progress += s.amount;
    }
    progress = Math.min(o.target, progress);
    if (progress === o.progress) return o;
    changed = true;
    return { ...o, progress };
  });
  return changed ? { ...data, objectives: { ...data.objectives, active } } : data;
}

/** Traduce eventos de la simulación a progreso de objetivos. */
export function signalsFromEvents(events: SimEvent[]): ObjectiveSignal[] {
  const signals: ObjectiveSignal[] = [];
  for (const e of events) {
    switch (e.type) {
      case 'incident-resolved':
        // Las averías que se apagan solas (0 Codos) no cuentan como "apagar" un incidente.
        if (e.codos > 0) signals.push({ kind: 'incident', amount: 1 });
        break;
      case 'raid-repelled':
        signals.push({ kind: 'raid', amount: 1 });
        break;
      case 'level-up':
        signals.push({ kind: 'level-up', amount: 1 });
        break;
      case 'trained':
        signals.push({ kind: 'train', amount: 1 });
        break;
      case 'birth':
        signals.push({ kind: 'birth', amount: 1 });
        break;
      case 'explorer-back':
        signals.push({ kind: 'explorer', amount: 1 });
        break;
      default:
        break;
    }
  }
  return signals;
}

/** Reclama un objetivo completado: entrega la recompensa y genera otro. */
export function claimObjective(data: GameData, id: string): Result<{ data: GameData; objective: Objective }> {
  const objective = data.objectives.active.find((o) => o.id === id);
  if (!objective) return fail('Ese objetivo no existe.');
  if (!isComplete(objective)) return fail('Todavía no está completado.');

  const reward = objective.reward;
  const resources = { ...data.resources };
  const boxes = { ...data.boxes };
  if ('codos' in reward) resources.codos += reward.codos;
  if ('cinta' in reward) resources.cinta += reward.cinta;
  if ('box' in reward) boxes[reward.box] += 1;
  const objectives = replaceObjective(data.objectives, data.grid.seed, id);
  return ok({ data: { ...data, resources, boxes, objectives }, objective });
}

/** Descarta un objetivo (solo uno por día, según la fecha local del jugador). */
export function discardObjective(data: GameData, id: string, today: string): Result<GameData> {
  if (!data.objectives.active.some((o) => o.id === id)) return fail('Ese objetivo no existe.');
  if (data.objectives.lastDiscardDate === today) return fail('Ya descartaste un objetivo hoy. Vuelve mañana.');
  const objectives = { ...replaceObjective(data.objectives, data.grid.seed, id), lastDiscardDate: today };
  return ok({ ...data, objectives });
}
