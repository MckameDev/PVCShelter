import { OFFLINE_MAX_SECONDS, OFFLINE_MIN_SECONDS, OFFLINE_STEP_SECONDS } from './config';
import { advance } from './Simulation';
import type { SimEvent } from './Simulation';
import type { GameData } from './types';

// Progreso offline: al volver, Tiempo_Ausente = Hora_Actual - Ultimo_Guardado.
// Se simula como mucho OFFLINE_MAX_SECONDS en modo offline (sin incidentes,
// asaltos ni Inspector nuevos, con recolección automática): producción,
// consumo, entrenamientos, embarazos, exploradores y viajes de misiones.

export interface OfflineSummary {
  absentSeconds: number;
  simulatedSeconds: number;
  /** true si la ausencia superó el máximo y se recortó. */
  capped: boolean;
  /** Variación de recursos durante la ausencia. */
  delta: { codos: number; energy: number; food: number; water: number };
  counts: { births: number; levelUps: number; trained: number; explorersBack: number; deaths: number; questsBack: number };
}

function count(events: SimEvent[], type: SimEvent['type']): number {
  return events.filter((e) => e.type === type).length;
}

/**
 * Aplica el progreso de una ausencia. Devuelve null si fue demasiado corta
 * para merecer un resumen. `absentSeconds` debe venir de un reloj fiable
 * (en la nube, la hora del servidor).
 */
export function computeOffline(data: GameData, absentSeconds: number): { data: GameData; summary: OfflineSummary } | null {
  if (!Number.isFinite(absentSeconds) || absentSeconds < OFFLINE_MIN_SECONDS) return null;
  const simulatedSeconds = Math.min(absentSeconds, OFFLINE_MAX_SECONDS);
  const res = advance(data, simulatedSeconds, { offline: true, step: OFFLINE_STEP_SECONDS });
  const before = data.resources;
  const after = res.data.resources;
  return {
    data: res.data,
    summary: {
      absentSeconds,
      simulatedSeconds,
      capped: absentSeconds > OFFLINE_MAX_SECONDS,
      delta: {
        codos: after.codos - before.codos,
        energy: after.energy - before.energy,
        food: after.food - before.food,
        water: after.water - before.water,
      },
      counts: {
        births: count(res.events, 'birth'),
        levelUps: count(res.events, 'level-up'),
        trained: count(res.events, 'trained'),
        explorersBack: count(res.events, 'explorer-back'),
        deaths: count(res.events, 'dweller-died') + count(res.events, 'explorer-died'),
        questsBack: count(res.events, 'quest-back'),
      },
    },
  };
}
