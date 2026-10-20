import { BARBER_COST } from './config';
import { getRuntime } from './Production';
import { fail, ok } from './types';
import type { Appearance, GameData, Result } from './types';

// Peluquería: con una Peluquería construida y con energía se puede cambiar la apariencia.

export function hasWorkingBarber(data: GameData): boolean {
  return Object.values(data.grid.rooms).some((r) => r.type === 'barber' && getRuntime(data, r.id).powered);
}

export function restyleDweller(data: GameData, dwellerId: string, appearance: Appearance): Result<GameData> {
  const dweller = data.dwellers[dwellerId];
  if (!dweller || !dweller.alive) return fail('El habitante no está disponible.');
  if (!hasWorkingBarber(data)) return fail('Necesitas una Peluquería con energía.');
  if (data.resources.codos < BARBER_COST) return fail(`Faltan Codos de PVC (necesitas ${BARBER_COST}).`);
  return ok({
    ...data,
    resources: { ...data.resources, codos: data.resources.codos - BARBER_COST },
    dwellers: { ...data.dwellers, [dwellerId]: { ...dweller, appearance: { ...appearance } } },
  });
}
