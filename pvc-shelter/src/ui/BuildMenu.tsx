import { Lock, Users, Wrench, X } from 'lucide-react';
import { useState } from 'react';
import { BUILDABLE_TYPES, CATEGORY_NAMES, ROOM_DEFS } from '../core/config';
import type { RoomCategory } from '../core/config';
import { livingCount } from '../core/Dwellers';
import { buildCost } from '../core/Economy';
import { useGameStore } from '../store/useGameStore';
import { hexColor, ROOM_ICONS } from './roomIcons';

const CATEGORIES = (Object.keys(CATEGORY_NAMES) as RoomCategory[]).filter((c) =>
  BUILDABLE_TYPES.some((t) => ROOM_DEFS[t].category === c),
);

export function BuildMenu() {
  const grid = useGameStore((s) => s.grid);
  const codos = useGameStore((s) => s.resources.codos);
  const population = useGameStore((s) => livingCount(s));
  const buildType = useGameStore((s) => s.buildType);
  const startBuild = useGameStore((s) => s.startBuild);
  const cancelBuild = useGameStore((s) => s.cancelBuild);
  const [category, setCategory] = useState<RoomCategory>(CATEGORIES[0]);

  const types = BUILDABLE_TYPES.filter((t) => ROOM_DEFS[t].category === category);

  return (
    <nav className="pointer-events-auto absolute inset-x-0 bottom-0 border-t-2 border-bunker-600 bg-bunker-800/95 shadow-[0_-4px_16px_rgba(0,0,0,0.5)]">
      {buildType && (
        <div className="flex items-center justify-between gap-2 border-b border-bunker-600 bg-emerald-950/80 px-3 py-1.5 text-sm">
          <span>
            Construyendo <b>{ROOM_DEFS[buildType].name}</b>: toca un hueco verde.
          </span>
          <button
            type="button"
            onClick={cancelBuild}
            className="flex items-center gap-1 rounded-md bg-bunker-900 px-2 py-1 text-xs font-bold hover:bg-bunker-600"
          >
            <X size={14} /> Cancelar
          </button>
        </div>
      )}
      <div role="tablist" aria-label="Categorías de salas" className="flex gap-1 overflow-x-auto px-3 pt-1.5 scrollbar-none">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={c === category}
            onClick={() => setCategory(c)}
            className={`shrink-0 rounded-t-md px-3 py-1 text-xs font-bold uppercase tracking-wider ${
              c === category ? 'bg-bunker-600 text-tape' : 'text-pvc/50 hover:text-pvc'
            }`}
          >
            {CATEGORY_NAMES[c]}
          </button>
        ))}
      </div>
      <div className="flex items-stretch gap-2 overflow-x-auto border-t border-bunker-600 px-3 py-2 scrollbar-none">
        {types.map((type) => {
          const def = ROOM_DEFS[type];
          const Icon = ROOM_ICONS[type];
          const cost = buildCost(grid, type);
          const active = buildType === type;
          const locked = population < def.unlockPopulation;
          const affordable = codos >= cost;
          return (
            <button
              key={type}
              type="button"
              onClick={() => startBuild(type)}
              disabled={(locked || !affordable) && !active}
              title={locked ? `Se desbloquea con ${def.unlockPopulation} habitantes` : def.description}
              aria-pressed={active}
              className={`flex min-w-28 shrink-0 flex-col items-start gap-0.5 rounded-lg border-2 px-3 py-1.5 text-left transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${
                active ? 'border-emerald-400 bg-emerald-900/60' : 'border-bunker-600 bg-bunker-900/70 hover:border-tape'
              }`}
            >
              <span className="flex items-center gap-1.5 text-sm font-bold">
                {locked ? <Lock size={16} /> : <Icon size={16} style={{ color: hexColor(def.accent) }} />}
                {def.name}
              </span>
              {locked ? (
                <span className="flex items-center gap-1 text-xs text-pvc/60">
                  <Users size={12} /> {def.unlockPopulation} habitantes
                </span>
              ) : (
                <span className={`flex items-center gap-1 text-xs tabular-nums ${affordable ? 'text-tape' : 'text-red-400'}`}>
                  <Wrench size={12} /> {cost}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
