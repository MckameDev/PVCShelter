import { BOX_PRICES, CINTA_PACKS, CRAFT_COSTS, SPEEDUP_SECONDS_PER_CINTA } from './config';
import { craftTime } from './Crafting';
import { dwellersInRoom } from './Dwellers';
import { ITEMS } from './items';
import { findQuest } from './Quests';
import { fail, ok } from './types';
import type { BoxKind, GameData, Result } from './types';

// Tienda SIMULADA (no hay pagos reales: los paquetes solo añaden Rollos de
// Cinta) y usos de la cinta: comprar cajas y acelerar esperas.

/** Añade los rollos de un paquete. Simulado: no se cobra dinero real. */
export function claimSimulatedPack(data: GameData, packId: string): Result<{ data: GameData; cinta: number }> {
  const pack = CINTA_PACKS.find((p) => p.id === packId);
  if (!pack) return fail('Ese paquete no existe.');
  return ok({ data: { ...data, resources: { ...data.resources, cinta: data.resources.cinta + pack.cinta } }, cinta: pack.cinta });
}

function spend(data: GameData, cinta: number): Result<GameData> {
  if (data.resources.cinta < cinta) return fail(`Faltan Rollos de Cinta (necesitas ${cinta}).`);
  return ok({ ...data, resources: { ...data.resources, cinta: data.resources.cinta - cinta } });
}

export function buyBox(data: GameData, kind: BoxKind): Result<GameData> {
  const paid = spend(data, BOX_PRICES[kind]);
  if (!paid.ok) return paid;
  return ok({ ...paid.value, boxes: { ...paid.value.boxes, [kind]: paid.value.boxes[kind] + 1 } });
}

/** 1 rollo por cada minuto (o fracción) que falte. */
export const speedupCost = (seconds: number) => Math.max(1, Math.ceil(seconds / SPEEDUP_SECONDS_PER_CINTA));

/** Segundos que faltan del viaje de una misión, o null si no está viajando. */
export function questWait(data: GameData, id: string): number | null {
  const q = findQuest(data, id);
  return q && (q.status === 'traveling' || q.status === 'returning') && q.travelLeft > 0 ? q.travelLeft : null;
}

/** Termina al instante el viaje de una misión (la simulación hace la llegada en el siguiente tick). */
export function speedupQuest(data: GameData, id: string): Result<GameData> {
  const wait = questWait(data, id);
  if (wait === null) return fail('Esa escuadra no está de viaje.');
  const paid = spend(data, speedupCost(wait));
  if (!paid.ok) return paid;
  return ok({ ...paid.value, quests: paid.value.quests.map((q) => (q.id === id ? { ...q, travelLeft: 0.001 } : q)) });
}

export function expeditionWait(data: GameData, dwellerId: string): number | null {
  const exp = data.expeditions[dwellerId];
  return exp?.status === 'returning' && exp.returnLeft > 0 ? exp.returnLeft : null;
}

/** Termina al instante la vuelta de un explorador. */
export function speedupExpedition(data: GameData, dwellerId: string): Result<GameData> {
  const wait = expeditionWait(data, dwellerId);
  if (wait === null) return fail('No está volviendo al búnker.');
  const paid = spend(data, speedupCost(wait));
  if (!paid.ok) return paid;
  const exp = paid.value.expeditions[dwellerId];
  return ok({ ...paid.value, expeditions: { ...paid.value.expeditions, [dwellerId]: { ...exp, returnLeft: 0.001 } } });
}

export function craftWait(data: GameData, roomId: string): number | null {
  const room = data.grid.rooms[roomId];
  const rt = data.runtime[roomId];
  if (!room || !rt?.craft || rt.ready) return null;
  const total = craftTime(room, rt.craft.defId, dwellersInRoom(data, roomId)) ?? CRAFT_COSTS[ITEMS[rt.craft.defId].rarity].seconds;
  return Math.max(1, total - rt.craft.progress);
}

/** Termina al instante la fabricación en curso de un taller. */
export function speedupCraft(data: GameData, roomId: string): Result<GameData> {
  const wait = craftWait(data, roomId);
  if (wait === null) return fail('No hay ninguna fabricación en curso en este taller.');
  const paid = spend(data, speedupCost(wait));
  if (!paid.ok) return paid;
  return ok({ ...paid.value, runtime: { ...paid.value.runtime, [roomId]: { ...paid.value.runtime[roomId], ready: true } } });
}
