import { Disc3, Package, Target, Wrench, X } from 'lucide-react';
import { isComplete } from '../core/Objectives';
import type { ObjectiveReward } from '../core/types';
import { useGameStore } from '../store/useGameStore';

function RewardLabel({ reward }: { reward: ObjectiveReward }) {
  if ('codos' in reward) {
    return (
      <span className="flex items-center gap-1 text-tape">
        <Wrench size={12} /> {reward.codos}
      </span>
    );
  }
  if ('cinta' in reward) {
    return (
      <span className="flex items-center gap-1">
        <Disc3 size={12} /> {reward.cinta} rollos
      </span>
    );
  }
  return (
    <span className={`flex items-center gap-1 ${reward.box === 'rare' ? 'text-sky-300' : ''}`}>
      <Package size={12} /> Caja{reward.box === 'rare' ? ' rara' : ''}
    </span>
  );
}

/** Los 3 objetivos diarios: progreso, reclamar recompensa o descartar (1 al día). */
export function ObjectivesPanel() {
  const open = useGameStore((s) => s.objectivesOpen);
  const objectives = useGameStore((s) => s.objectives);
  const setOpen = useGameStore((s) => s.setObjectivesOpen);
  const claim = useGameStore((s) => s.claimObjective);
  const discard = useGameStore((s) => s.discardObjective);
  if (!open) return null;

  return (
    <aside className="pointer-events-auto absolute top-16 left-3 w-[calc(100%-1.5rem)] space-y-2 rounded-xl border-2 border-bunker-600 bg-bunker-800/95 p-3 shadow-2xl sm:w-96">
      <div className="flex items-center gap-2">
        <Target size={18} className="text-tape" />
        <h2 className="flex-1 font-bold">Objetivos</h2>
        <button type="button" aria-label="Cerrar" onClick={() => setOpen(false)} className="rounded p-1 hover:bg-bunker-600">
          <X size={16} />
        </button>
      </div>
      <ul className="space-y-2">
        {objectives.active.map((o) => {
          const done = isComplete(o);
          return (
            <li key={o.id} className={`rounded-lg border-2 p-2 text-sm ${done ? 'border-emerald-500/70 bg-emerald-950/40' : 'border-transparent bg-black/30'}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold">{o.text}</span>
                <span className="shrink-0 text-xs">
                  <RewardLabel reward={o.reward} />
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/60">
                  <div className="h-full bg-emerald-400" style={{ width: `${(o.progress / o.target) * 100}%` }} />
                </div>
                <span className="text-xs tabular-nums text-pvc/60">
                  {Math.floor(o.progress)}/{o.target}
                </span>
              </div>
              <div className="mt-1.5 flex gap-2">
                {done ? (
                  <button
                    type="button"
                    onClick={() => claim(o.id)}
                    className="flex-1 rounded-md border-2 border-emerald-400/70 bg-emerald-500/15 py-1 text-xs font-bold hover:bg-emerald-500/30"
                  >
                    Reclamar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => discard(o.id)}
                    className="rounded-md border border-bunker-600 px-2 py-0.5 text-xs text-pvc/60 hover:border-red-400 hover:text-pvc"
                    title="Solo se puede descartar un objetivo al día"
                  >
                    Descartar
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-pvc/50">Al reclamar un objetivo aparece otro nuevo. Puedes descartar uno al día.</p>
    </aside>
  );
}
