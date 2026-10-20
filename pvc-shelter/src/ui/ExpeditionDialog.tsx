import { Bandage, FlaskConical, Minus, Plus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { MAX_EXPEDITION_MEDS } from '../core/config';
import { canStartExpedition } from '../core/Wasteland';
import { useGameStore } from '../store/useGameStore';

function Counter(props: { label: string; Icon: LucideIcon; value: number; max: number; onChange: (n: number) => void }) {
  const { label, Icon, value, max, onChange } = props;
  return (
    <div className="flex items-center gap-2">
      <Icon size={16} className="text-pvc/70" />
      <span className="flex-1 text-sm">{label}</span>
      <button
        type="button"
        aria-label={`Menos ${label}`}
        onClick={() => onChange(Math.max(0, value - 1))}
        className="grid size-7 place-items-center rounded border border-bunker-600 hover:border-tape"
      >
        <Minus size={14} />
      </button>
      <span className="w-6 text-center font-bold tabular-nums">{value}</span>
      <button
        type="button"
        aria-label={`Más ${label}`}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="grid size-7 place-items-center rounded border border-bunker-600 hover:border-tape"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

/** Elegir cuántos curativos lleva un habitante que sale al Yermo. */
export function ExpeditionDialog() {
  const draft = useGameStore((s) => s.expeditionDraft);
  // key: los contadores se reinician para cada habitante.
  return draft ? <ExpeditionForm key={draft} draft={draft} /> : null;
}

function ExpeditionForm({ draft }: { draft: string }) {
  const dweller = useGameStore((s) => s.dwellers[draft]);
  const stock = useGameStore((s) => s.resources);
  const game = useGameStore();
  const close = useGameStore((s) => s.setExpeditionDraft);
  const send = useGameStore((s) => s.sendExpedition);
  const maxStim = Math.min(MAX_EXPEDITION_MEDS, stock.stimpaks);
  const maxRad = Math.min(MAX_EXPEDITION_MEDS, stock.radaways);
  const [stimpaks, setStimpaks] = useState(() => Math.min(3, maxStim));
  const [radaways, setRadaways] = useState(() => Math.min(2, maxRad));

  if (!dweller) return null;
  const check = canStartExpedition(game, draft, stimpaks, radaways);

  return (
    <div className="pointer-events-auto absolute inset-0 grid place-items-center bg-black/50 p-4" onClick={() => close(null)}>
      <section
        role="dialog"
        aria-label="Salir al Yermo"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm space-y-3 rounded-xl border-2 border-bunker-600 bg-bunker-800 p-4 shadow-2xl"
      >
        <h2 className="text-lg font-bold">Enviar a {dweller.name} al Yermo</h2>
        <p className="text-xs text-pvc/70">
          Cada minuto ocurrirá algo: hallazgos, peleas o agua contaminada. Usará los curativos por su cuenta. La vuelta tarda la
          mitad de lo explorado.
        </p>
        <Counter label="Vendas Caseras" Icon={Bandage} value={stimpaks} max={maxStim} onChange={setStimpaks} />
        <Counter label="Desintoxicantes" Icon={FlaskConical} value={radaways} max={maxRad} onChange={setRadaways} />
        {!check.ok && <p className="text-xs text-red-300">{check.reason}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => close(null)}
            className="flex-1 rounded-lg border-2 border-bunker-600 py-1.5 text-sm font-bold hover:border-pvc/50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!check.ok}
            onClick={() => send(draft, stimpaks, radaways)}
            className="flex-1 rounded-lg border-2 border-emerald-400/70 bg-emerald-500/15 py-1.5 text-sm font-bold hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Partir
          </button>
        </div>
      </section>
    </div>
  );
}
