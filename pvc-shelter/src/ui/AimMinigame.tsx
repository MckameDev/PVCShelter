import { useEffect, useRef, useState } from 'react';
import { CRIT_MULTIPLIERS } from '../core/config';

/** Segundos que tarda el marcador en ir de un extremo al otro. */
const SWEEP_SECONDS = 0.9;

/** Ancho (en fracción de la barra) de cada zona centrada, según la precisión mínima. */
const zoneWidth = (minAccuracy: number) => 1 - minAccuracy;

/**
 * Minijuego de puntería: un marcador barre la barra de lado a lado; al pulsar
 * "¡Disparar!" se mide lo cerca del centro que estaba (precisión 0..1).
 */
export function AimMinigame({ onShoot }: { onShoot: (accuracy: number) => void }) {
  const [pos, setPos] = useState(0);
  const posRef = useRef(0);

  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = ((now - start) / 1000 / SWEEP_SECONDS) % 2;
      posRef.current = t < 1 ? t : 2 - t; // ida y vuelta
      setPos(posRef.current);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const shoot = () => onShoot(1 - Math.abs(posRef.current - 0.5) * 2);

  return (
    <div className="space-y-2">
      <div
        className="relative h-8 cursor-crosshair overflow-hidden rounded-lg border-2 border-bunker-600 bg-red-900/60"
        onClick={shoot}
        role="presentation"
      >
        {/* Zonas concéntricas: cuanto más al centro, mayor multiplicador */}
        {[...CRIT_MULTIPLIERS]
          .filter((c) => c.mult > 0)
          .reverse()
          .map((c) => (
            <div
              key={c.min}
              className={`absolute inset-y-0 ${c.min >= 0.9 ? 'bg-emerald-400' : c.min >= 0.6 ? 'bg-yellow-400/80' : 'bg-orange-500/70'}`}
              style={{ left: `${(1 - zoneWidth(c.min)) * 50}%`, width: `${zoneWidth(c.min) * 100}%` }}
            />
          ))}
        <div className="absolute inset-y-0 w-1 -translate-x-1/2 bg-white shadow-[0_0_6px_white]" style={{ left: `${pos * 100}%` }} />
      </div>
      <button
        type="button"
        onClick={shoot}
        className="w-full rounded-lg border-2 border-tape bg-tape/20 py-2 font-black tracking-wide hover:bg-tape/40"
      >
        ¡Disparar!
      </button>
    </div>
  );
}
