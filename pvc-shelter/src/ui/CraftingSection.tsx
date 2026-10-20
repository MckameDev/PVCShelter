import { FastForward, Hammer, PackageCheck } from 'lucide-react';
import { canStartCraft, craftCost, craftTime, workshopRecipes, WORKSHOP_KIND } from '../core/Crafting';
import { dwellersInRoom } from '../core/Dwellers';
import { ITEMS, itemSummary } from '../core/items';
import { craftWait, speedupCost } from '../core/Shop';
import type { Room } from '../core/types';
import { useGameStore } from '../store/useGameStore';
import { junkText, RARITY_CLASS } from './itemFormat';

/** Taller: fabricación en curso, objeto listo para recoger o lista de planos. */
export function CraftingSection({ room }: { room: Room }) {
  const state = useGameStore();
  if (!WORKSHOP_KIND[room.type]) return null;

  const runtime = state.runtime[room.id];
  const workers = dwellersInRoom(state, room.id);
  const craft = runtime?.craft;

  if (craft) {
    const def = ITEMS[craft.defId];
    const total = craftTime(room, craft.defId, workers);
    const wait = craftWait(state, room.id);
    return (
      <div className="mb-3 rounded-lg bg-black/30 p-2 text-sm">
        {runtime.ready ? (
          <button
            type="button"
            onClick={() => state.collectCrafted(room.id)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-emerald-400/70 bg-emerald-500/15 py-1.5 font-bold hover:bg-emerald-500/30"
          >
            <PackageCheck size={16} /> Recoger {def.name}
          </button>
        ) : (
          <>
            <div className="flex justify-between text-xs text-pvc/70">
              <span>
                Fabricando <b className={RARITY_CLASS[def.rarity]}>{def.name}</b>
              </span>
              <span className="tabular-nums">
                {total === null ? 'Sin trabajadores' : !runtime.powered ? 'Sin energía' : `${Math.ceil(total - craft.progress)} s`}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/60">
              <div className="h-full bg-tape" style={{ width: `${total ? Math.min(100, (craft.progress / total) * 100) : 0}%` }} />
            </div>
            {wait !== null && (
              <button
                type="button"
                onClick={() => state.speedupCraft(room.id)}
                disabled={state.resources.cinta < speedupCost(wait)}
                className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border-2 border-bunker-600 py-1 text-xs font-bold hover:border-tape disabled:opacity-40"
              >
                <FastForward size={12} /> Terminar ya ({speedupCost(wait)} rollos de cinta)
              </button>
            )}
          </>
        )}
      </div>
    );
  }

  const recipes = workshopRecipes(state, room);
  return (
    <div className="mb-3 rounded-lg bg-black/30 p-2 text-sm">
      <h3 className="mb-1 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-pvc/50">
        <Hammer size={12} /> Planos
      </h3>
      {workers.length === 0 && <p className="mb-1 text-xs text-amber-300">Asigna habitantes: sin ellos la fabricación no avanza.</p>}
      <ul className="space-y-1">
        {recipes.map((def) => {
          const cost = craftCost(def);
          const check = canStartCraft(state, room.id, def.id);
          return (
            <li key={def.id} className="flex items-center gap-2 rounded-md bg-black/30 px-2 py-1">
              <div className="min-w-0 flex-1">
                <div className={`truncate font-semibold ${RARITY_CLASS[def.rarity]}`}>{def.name}</div>
                <div className="truncate text-xs text-pvc/60">
                  {itemSummary(def)} · {junkText(cost.junk)} · {cost.codos} Codos
                </div>
              </div>
              <button
                type="button"
                disabled={!check.ok}
                title={check.ok ? undefined : check.reason}
                onClick={() => state.craft(room.id, def.id)}
                className="rounded-md border-2 border-tape/70 px-2 py-0.5 text-xs font-bold hover:bg-tape/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Fabricar
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
