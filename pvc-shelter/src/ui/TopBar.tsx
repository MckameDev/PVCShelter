import { Disc3, Droplets, Smile, Users, Utensils, Wrench, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useMemo } from 'react';
import { globalHappiness, populationCap } from '../core/Dwellers';
import { storageCap } from '../core/Economy';
import { RESOURCE_NAMES } from '../core/Production';
import { requiredEnergy } from '../core/Simulation';
import type { VitalResource } from '../core/types';
import { useGameStore } from '../store/useGameStore';
import { hexColor } from './roomIcons';
import { RESOURCE_COLORS } from '../canvas/StatusSprite';

const RESOURCE_ICONS: Record<VitalResource, LucideIcon> = { energy: Zap, food: Utensils, water: Droplets };

function ResourceMeter({ resource, cap, required }: { resource: VitalResource; cap: number; required?: number }) {
  const value = useGameStore((s) => s.resources[resource]);
  const Icon = RESOURCE_ICONS[resource];
  const low = value <= 0 || (required !== undefined && value < required);
  const pct = (v: number) => `${Math.min(100, (v / cap) * 100)}%`;
  const title = `${RESOURCE_NAMES[resource]}: ${Math.floor(value)} / ${cap}${required !== undefined ? ` (mínimo ${Math.ceil(required)})` : ''}`;

  return (
    <div className="flex min-w-24 items-center gap-2 rounded-lg bg-bunker-900/70 px-2.5 py-1.5" title={title}>
      <Icon size={18} style={{ color: hexColor(RESOURCE_COLORS[resource]) }} className={low ? 'animate-pulse' : ''} />
      <div className="flex-1">
        <div className={`text-xs font-bold tabular-nums ${low ? 'text-red-400' : ''}`}>
          {Math.floor(value)}
          <span className="font-normal text-pvc/50">/{cap}</span>
        </div>
        <div className="relative mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-black/60">
          <div className="h-full rounded-full" style={{ width: pct(value), background: hexColor(RESOURCE_COLORS[resource]) }} />
          {required !== undefined && required > 0 && (
            <div className="absolute top-0 h-full w-0.5 bg-red-500" style={{ left: pct(required) }} />
          )}
        </div>
      </div>
    </div>
  );
}

export function TopBar() {
  const grid = useGameStore((s) => s.grid);
  const codos = useGameStore((s) => s.resources.codos);
  const cinta = useGameStore((s) => s.resources.cinta);
  const dwellers = useGameStore((s) => s.dwellers);
  const setDwellersOpen = useGameStore((s) => s.setDwellersOpen);

  // Los topes solo cambian cuando cambia el grid, no en cada tick.
  const caps = useMemo(
    () => ({
      energy: storageCap(grid, 'energy'),
      food: storageCap(grid, 'food'),
      water: storageCap(grid, 'water'),
      required: requiredEnergy(grid),
      population: populationCap(grid),
    }),
    [grid],
  );
  const alive = Object.values(dwellers).filter((d) => d.alive).length;
  const happiness = Math.round(globalHappiness({ dwellers }) * 100);

  return (
    <header className="pointer-events-auto absolute inset-x-0 top-0 flex items-center gap-2 overflow-x-auto border-b-2 border-bunker-600 bg-bunker-800/95 px-3 py-1.5 shadow-lg scrollbar-none">
      <ResourceMeter resource="energy" cap={caps.energy} required={caps.required} />
      <ResourceMeter resource="food" cap={caps.food} />
      <ResourceMeter resource="water" cap={caps.water} />
      <button
        type="button"
        onClick={() => setDwellersOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-bunker-900/70 px-3 py-2 hover:bg-bunker-600"
        title={`Habitantes (máximo ${caps.population}, sube con Salas de Descanso)`}
      >
        <Users size={18} />
        <span className="font-bold tabular-nums">
          {alive}
          <span className="font-normal text-pvc/50">/{caps.population}</span>
        </span>
      </button>
      <div
        className="flex items-center gap-1.5 rounded-lg bg-bunker-900/70 px-3 py-2"
        title="Felicidad global: por encima del 50% acelera la producción; por debajo la frena"
      >
        <Smile size={18} className={happiness >= 50 ? 'text-emerald-300' : 'text-red-300'} />
        <span className="font-bold tabular-nums">{happiness}%</span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-lg bg-bunker-900/70 px-3 py-2" title="Codos de PVC">
          <Wrench size={16} className="text-tape" />
          <span className="font-bold tabular-nums">{codos.toLocaleString('es')}</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg bg-bunker-900/70 px-3 py-2" title="Rollos de Cinta">
          <Disc3 size={16} />
          <span className="font-bold tabular-nums">{cinta}</span>
        </div>
      </div>
    </header>
  );
}
