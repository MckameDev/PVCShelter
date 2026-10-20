import { RADAWAY_CURE, STIMPAK_HEAL } from './config';
import { effectiveMaxHp } from './Dwellers';
import { fail, ok } from './types';
import type { GameData, MedResource, Result } from './types';

// Uso de curativos: Vendas Caseras (HP) y Desintoxicantes (intoxicación).

export const MED_NAMES: Record<MedResource, string> = {
  stimpaks: 'Venda Casera',
  radaways: 'Desintoxicante',
};

export function canApplyMed(data: GameData, dwellerId: string, med: MedResource): Result<null> {
  const d = data.dwellers[dwellerId];
  if (!d || !d.alive) return fail('El habitante no está disponible.');
  if (data.resources[med] < 1) return fail(`No quedan ${med === 'stimpaks' ? 'Vendas Caseras' : 'Desintoxicantes'}.`);
  if (med === 'stimpaks' && d.hp >= effectiveMaxHp(d) - 0.5) return fail(`${d.name} no tiene heridas que curar.`);
  if (med === 'radaways' && d.intox < 0.5) return fail(`${d.name} no está intoxicado.`);
  return ok(null);
}

/** Aplica un curativo: la venda cura HP; el desintoxicante quita intoxicación (y libera HP máximo). */
export function applyMed(data: GameData, dwellerId: string, med: MedResource): Result<GameData> {
  const check = canApplyMed(data, dwellerId, med);
  if (!check.ok) return check;
  const d = { ...data.dwellers[dwellerId] };
  if (med === 'stimpaks') d.hp = Math.min(effectiveMaxHp(d), d.hp + STIMPAK_HEAL);
  else d.intox = Math.max(0, d.intox - RADAWAY_CURE);
  return ok({
    ...data,
    dwellers: { ...data.dwellers, [dwellerId]: d },
    resources: { ...data.resources, [med]: data.resources[med] - 1 },
  });
}
