import { createNewGame } from './Bunker';
import { fail, ok } from './types';
import type { GameData, Result } from './types';

// Formato de guardado (nube y local). El JSON lleva un número de esquema para
// poder migrar partidas viejas. Lo que llega de fuera se valida antes de
// usarlo: una partida corrupta o manipulada se rechaza en lugar de romper el juego.

export const SAVE_SCHEMA = 1;

export interface SaveEnvelope {
  schema: number;
  game: GameData;
}

export function serializeGame(data: GameData): SaveEnvelope {
  return { schema: SAVE_SCHEMA, game: data };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Comprobaciones estructurales mínimas de las piezas que el juego usa sin mirar. */
function validate(game: Record<string, unknown>): string | null {
  const grid = game.grid;
  if (!isObject(grid) || !isObject(grid.rooms) || !isObject(grid.rocks) || !isNumber(grid.seed)) return 'grid inválido';
  if (!isNumber(grid.floors) || !isNumber(grid.cols) || !isNumber(grid.nextId)) return 'dimensiones inválidas';
  for (const room of Object.values(grid.rooms)) {
    if (!isObject(room) || typeof room.id !== 'string' || typeof room.type !== 'string' || !isNumber(room.floor) || !isNumber(room.col)) {
      return 'sala inválida';
    }
  }
  const resources = game.resources;
  if (!isObject(resources) || !['codos', 'cinta', 'energy', 'food', 'water'].every((k) => isNumber(resources[k]))) {
    return 'recursos inválidos';
  }
  if (!isObject(game.dwellers) || !isObject(game.runtime) || !isObject(game.inventory)) return 'faltan secciones';
  for (const d of Object.values(game.dwellers)) {
    if (!isObject(d) || typeof d.id !== 'string' || !isObject(d.stats) || !isNumber(d.hp)) return 'habitante inválido';
  }
  if (!isNumber(game.time) || !isNumber(game.nextDwellerId)) return 'contadores inválidos';
  return null;
}

/**
 * Convierte un JSON guardado en GameData. Rellena con valores por defecto los
 * campos que falten (partidas de versiones anteriores del juego).
 */
export function parseSave(raw: unknown): Result<GameData> {
  if (!isObject(raw) || !isNumber(raw.schema) || !isObject(raw.game)) return fail('La partida guardada no tiene un formato válido.');
  if (raw.schema > SAVE_SCHEMA) return fail('La partida es de una versión más nueva del juego. Actualiza la página.');
  const game = raw.game;
  const error = validate(game);
  if (error) return fail(`La partida guardada está dañada (${error}).`);

  // Valores por defecto para campos añadidos en sprints posteriores.
  const defaults = createNewGame((game.grid as { seed: number }).seed);
  const merged = { ...defaults, ...game } as GameData;
  merged.resources = { ...defaults.resources, ...merged.resources };
  merged.boxes = { ...defaults.boxes, ...merged.boxes };
  merged.objectives = isObject(game.objectives) ? merged.objectives : defaults.objectives;
  for (const [id, d] of Object.entries(merged.dwellers)) {
    merged.dwellers[id] = { ...defaults.dwellers['dweller-1'], ...d, location: d.location ?? 'bunker' };
  }
  return ok(merged);
}
