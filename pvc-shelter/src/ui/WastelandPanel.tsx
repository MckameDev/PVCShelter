import { Bandage, FastForward, FlaskConical, Skull, X } from 'lucide-react';
import { lootSummary } from '../core/Loot';
import { canRevive, reviveCost } from '../core/Revival';
import { speedupCost } from '../core/Shop';
import type { Expedition } from '../core/types';
import { useGameStore } from '../store/useGameStore';
import { formatDuration } from './format';
import { HealthBar } from './HealthBar';

const TONE_CLASS = { info: 'text-pvc/70', good: 'text-emerald-300', bad: 'text-red-300' } as const;

function ExpeditionCard({ exp }: { exp: Expedition }) {
  const game = useGameStore();
  const d = game.dwellers[exp.dwellerId];
  if (!d) return null;

  const status =
    exp.status === 'exploring'
      ? `Explorando · ${formatDuration(exp.elapsed)}`
      : exp.status === 'returning'
        ? `Volviendo · llega en ${formatDuration(exp.returnLeft)}`
        : exp.status === 'back'
          ? 'En la puerta del búnker'
          : 'Muerto en el Yermo';
  const revive = canRevive(game, d.id);

  return (
    <li className="space-y-1.5 rounded-lg bg-black/30 p-2 text-sm">
      <div className="flex items-center gap-2">
        {exp.status === 'dead' && <Skull size={14} className="text-red-400" />}
        <b className="flex-1">{d.name}</b>
        <span className="text-xs text-pvc/60">{status}</span>
      </div>
      {d.alive && <HealthBar dweller={d} />}
      <div className="flex items-center gap-3 text-xs text-pvc/70">
        <span className="flex items-center gap-1">
          <Bandage size={12} /> {exp.stimpaks}
        </span>
        <span className="flex items-center gap-1">
          <FlaskConical size={12} /> {exp.radaways}
        </span>
        <span className="truncate">Botín: {lootSummary(exp.loot)}</span>
      </div>
      <ol className="max-h-28 space-y-0.5 overflow-y-auto rounded bg-black/30 p-1.5 text-xs" aria-label="Registro">
        {[...exp.log].reverse().map((entry, i) => (
          <li key={`${entry.t}-${i}`} className={TONE_CLASS[entry.tone]}>
            <span className="text-pvc/40 tabular-nums">[{formatDuration(entry.t)}]</span> {entry.text}
          </li>
        ))}
      </ol>
      <div className="flex gap-2">
        {exp.status === 'exploring' && (
          <button
            type="button"
            onClick={() => game.recallExplorer(d.id)}
            className="flex-1 rounded-md border-2 border-tape/70 py-1 text-xs font-bold hover:bg-tape/20"
          >
            Regresar (tarda {formatDuration(exp.elapsed / 2)})
          </button>
        )}
        {exp.status === 'returning' && (
          <button
            type="button"
            onClick={() => game.speedupExpedition(d.id)}
            disabled={game.resources.cinta < speedupCost(exp.returnLeft)}
            className="flex flex-1 items-center justify-center gap-1 rounded-md border-2 border-bunker-600 py-1 text-xs font-bold hover:border-tape disabled:opacity-40"
          >
            <FastForward size={12} /> Llegar ya ({speedupCost(exp.returnLeft)} rollos)
          </button>
        )}
        {exp.status === 'back' && (
          <button
            type="button"
            onClick={() => game.collectExplorer(d.id)}
            className="flex-1 rounded-md border-2 border-emerald-400/70 bg-emerald-500/15 py-1 text-xs font-bold hover:bg-emerald-500/30"
          >
            Recoger botín
          </button>
        )}
        {exp.status === 'dead' && (
          <>
            <button
              type="button"
              disabled={!revive.ok}
              title={revive.ok ? undefined : revive.reason}
              onClick={() => game.revive(d.id)}
              className="flex-1 rounded-md border-2 border-emerald-400/70 py-1 text-xs font-bold hover:bg-emerald-500/20 disabled:opacity-40"
            >
              Revivir ({reviveCost(d)} Codos)
            </button>
            <button
              type="button"
              onClick={() => game.expel(d.id)}
              className="flex-1 rounded-md border-2 border-red-400/70 py-1 text-xs font-bold hover:bg-red-500/20"
            >
              Abandonar
            </button>
          </>
        )}
      </div>
    </li>
  );
}

/** Exploradores del Yermo con su registro de eventos. */
export function WastelandPanel() {
  const open = useGameStore((s) => s.wastelandOpen);
  const expeditions = useGameStore((s) => s.expeditions);
  const setOpen = useGameStore((s) => s.setWastelandOpen);
  if (!open) return null;
  const list = Object.values(expeditions);

  return (
    <aside className="pointer-events-auto absolute top-16 bottom-28 left-3 flex w-[calc(100%-1.5rem)] flex-col rounded-xl border-2 border-bunker-600 bg-bunker-800/95 shadow-2xl sm:w-96">
      <div className="flex items-center gap-2 border-b border-bunker-600 p-3">
        <h2 className="flex-1 font-bold">El Yermo</h2>
        <button type="button" aria-label="Cerrar" onClick={() => setOpen(false)} className="rounded p-1 hover:bg-bunker-600">
          <X size={16} />
        </button>
      </div>
      {list.length === 0 ? (
        <p className="p-3 text-sm text-pvc/60">
          Nadie está explorando. Arrastra a un habitante a la superficie, o usa “Enviar al Yermo” en su ficha.
        </p>
      ) : (
        <ul className="flex-1 space-y-2 overflow-y-auto p-2">
          {list.map((exp) => (
            <ExpeditionCard key={exp.dwellerId} exp={exp} />
          ))}
        </ul>
      )}
    </aside>
  );
}
