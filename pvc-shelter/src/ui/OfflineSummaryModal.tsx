import { Moon } from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import { formatDuration } from './format';

const signed = (n: number) => `${n >= 0 ? '+' : ''}${Math.round(n)}`;

/** "Mientras no estabas…": lo que simuló el progreso offline al volver. */
export function OfflineSummaryModal() {
  const summary = useGameStore((s) => s.offlineSummary);
  const dismiss = useGameStore((s) => s.dismissOffline);
  if (!summary) return null;
  const { delta, counts } = summary;
  const lines = [
    counts.births > 0 && `${counts.births} nacimiento(s)`,
    counts.levelUps > 0 && `${counts.levelUps} subida(s) de nivel`,
    counts.trained > 0 && `${counts.trained} punto(s) entrenados`,
    counts.explorersBack > 0 && `${counts.explorersBack} explorador(es) en la puerta`,
    counts.questsBack > 0 && `${counts.questsBack} escuadra(s) de vuelta`,
    counts.deaths > 0 && `${counts.deaths} fallecido(s)`,
  ].filter(Boolean);

  return (
    <div className="pointer-events-auto absolute inset-0 grid place-items-center bg-black/60 p-4">
      <section role="dialog" aria-label="Mientras no estabas" className="w-full max-w-sm space-y-3 rounded-xl border-2 border-bunker-600 bg-bunker-800 p-4 shadow-2xl">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Moon size={18} className="text-tape" /> Mientras no estabas
        </h2>
        <p className="text-sm text-pvc/70">
          Estuviste fuera {formatDuration(summary.absentSeconds)}.
          {summary.capped && ` Se simularon solo ${formatDuration(summary.simulatedSeconds)} para no castigar las ausencias largas.`}
        </p>
        <dl className="grid grid-cols-2 gap-1 rounded-lg bg-black/30 p-2 text-sm">
          <dt className="text-pvc/60">Codos</dt>
          <dd className="text-right tabular-nums">{signed(delta.codos)}</dd>
          <dt className="text-pvc/60">Energía</dt>
          <dd className="text-right tabular-nums">{signed(delta.energy)}</dd>
          <dt className="text-pvc/60">Comida</dt>
          <dd className="text-right tabular-nums">{signed(delta.food)}</dd>
          <dt className="text-pvc/60">Agua</dt>
          <dd className="text-right tabular-nums">{signed(delta.water)}</dd>
        </dl>
        {lines.length > 0 && (
          <ul className="list-inside list-disc text-sm text-pvc/80">
            {lines.map((l) => (
              <li key={String(l)}>{l}</li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={dismiss}
          className="w-full rounded-lg border-2 border-tape bg-tape/20 py-2 font-bold hover:bg-tape/35"
        >
          Volver al búnker
        </button>
      </section>
    </div>
  );
}
