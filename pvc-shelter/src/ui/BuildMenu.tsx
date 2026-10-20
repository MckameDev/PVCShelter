import { Hammer, Wrench, X } from 'lucide-react';
import { BUILDABLE_TYPES, ROOM_DEFS } from '../core/config';
import { buildCost } from '../core/Economy';
import { useGameStore } from '../store/useGameStore';
import { hexColor, ROOM_ICONS } from './roomIcons';

export function BuildMenu() {
  const grid = useGameStore((s) => s.grid);
  const codos = useGameStore((s) => s.resources.codos);
  const buildType = useGameStore((s) => s.buildType);
  const startBuild = useGameStore((s) => s.startBuild);
  const cancelBuild = useGameStore((s) => s.cancelBuild);

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
      <div className="flex items-stretch gap-2 overflow-x-auto px-3 py-2 scrollbar-none">
        <div className="hidden items-center gap-1 pr-1 text-xs font-bold uppercase tracking-wider text-pvc/50 sm:flex">
          <Hammer size={14} /> Construir
        </div>
        {BUILDABLE_TYPES.map((type) => {
          const def = ROOM_DEFS[type];
          const Icon = ROOM_ICONS[type];
          const cost = buildCost(grid, type);
          const active = buildType === type;
          const affordable = codos >= cost;
          return (
            <button
              key={type}
              type="button"
              onClick={() => startBuild(type)}
              disabled={!affordable && !active}
              title={def.description}
              aria-pressed={active}
              className={`flex min-w-28 shrink-0 flex-col items-start gap-0.5 rounded-lg border-2 px-3 py-1.5 text-left transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${
                active ? 'border-emerald-400 bg-emerald-900/60' : 'border-bunker-600 bg-bunker-900/70 hover:border-tape'
              }`}
            >
              <span className="flex items-center gap-1.5 text-sm font-bold">
                <Icon size={16} style={{ color: hexColor(def.accent) }} />
                {def.name}
              </span>
              <span className={`flex items-center gap-1 text-xs tabular-nums ${affordable ? 'text-tape' : 'text-red-400'}`}>
                <Wrench size={12} /> {cost}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
