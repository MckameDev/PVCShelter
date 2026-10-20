import type { Dweller } from '../core/types';

/** Barra de vida: verde = HP, rojo desde la derecha = intoxicación que reduce el máximo. */
export function HealthBar({ dweller, className = '' }: { dweller: Dweller; className?: string }) {
  const hp = (dweller.hp / dweller.maxHp) * 100;
  const intox = (dweller.intox / dweller.maxHp) * 100;
  return (
    <div
      className={`relative h-1.5 overflow-hidden rounded-full bg-black/60 ${className}`}
      title={`HP ${Math.ceil(dweller.hp)} / ${dweller.maxHp}${dweller.intox > 0.5 ? ` · intoxicación ${Math.round(dweller.intox)}` : ''}`}
    >
      <div className="absolute inset-y-0 left-0 bg-emerald-400" style={{ width: `${hp}%` }} />
      <div className="absolute inset-y-0 right-0 bg-red-600" style={{ width: `${intox}%` }} />
    </div>
  );
}
