import {
  INSPECTOR_CHANCE,
  INSPECTOR_CHECK_SECONDS,
  INSPECTOR_REWARD_BASE,
  INSPECTOR_REWARD_PER_DWELLER,
  INSPECTOR_VISIBLE_SECONDS,
} from './config';
import { livingCount } from './Dwellers';
import { getConnectedRoomIds, roomWidth } from './GridManager';
import { createRng, hashString } from './random';
import { fail, ok } from './types';
import type { GameData, GridState, Inspector, Result } from './types';

// Inspector Fisgón: aparece unos segundos escondido en una sala y da Codos si
// el jugador le hace clic a tiempo.

export type InspectorEvent = { type: 'inspector-left' };

export function updateInspector(
  inspector: Inspector | null,
  grid: GridState,
  time: number,
  dt: number,
): { inspector: Inspector | null; events: InspectorEvent[] } {
  if (inspector) {
    const timeLeft = inspector.timeLeft - dt;
    return timeLeft > 0 ? { inspector: { ...inspector, timeLeft }, events: [] } : { inspector: null, events: [{ type: 'inspector-left' }] };
  }
  const bucket = Math.floor((time + dt) / INSPECTOR_CHECK_SECONDS);
  if (bucket === Math.floor(time / INSPECTOR_CHECK_SECONDS)) return { inspector: null, events: [] };
  const rng = createRng((grid.seed ^ hashString(`inspector@${bucket}`)) >>> 0);
  if (rng() >= INSPECTOR_CHANCE) return { inspector: null, events: [] };

  const connected = getConnectedRoomIds(grid);
  const rooms = Object.values(grid.rooms)
    .filter((r) => r.type !== 'elevator' && connected.has(r.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (rooms.length === 0) return { inspector: null, events: [] };
  const room = rooms[Math.floor(rng() * rooms.length)];
  const x = room.col + 0.5 + rng() * (roomWidth(room) - 1);
  return { inspector: { roomId: room.id, x, timeLeft: INSPECTOR_VISIBLE_SECONDS }, events: [] };
}

export function inspectorReward(data: GameData): number {
  return INSPECTOR_REWARD_BASE + livingCount(data) * INSPECTOR_REWARD_PER_DWELLER;
}

export function catchInspector(data: GameData): Result<{ data: GameData; reward: number }> {
  if (!data.inspector) return fail('El Inspector ya se fue.');
  const reward = inspectorReward(data);
  return ok({ data: { ...data, inspector: null, resources: { ...data.resources, codos: data.resources.codos + reward } }, reward });
}
