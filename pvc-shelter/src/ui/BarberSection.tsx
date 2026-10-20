import { Scissors } from 'lucide-react';
import { useState } from 'react';
import { HAIR_COLORS, HAIR_STYLES, resolveAppearance, SKIN_TONES } from '../canvas/DwellerSprite';
import { hasWorkingBarber } from '../core/Barber';
import { BARBER_COST } from '../core/config';
import type { Appearance, Dweller, HairStyle } from '../core/types';
import { useGameStore } from '../store/useGameStore';
import { hexColor } from './roomIcons';

const STYLE_NAMES: Record<HairStyle, string> = { short: 'Corto', long: 'Largo', mohawk: 'Cresta', bald: 'Rapado' };

function Swatches({ colors, value, onPick, label }: { colors: number[]; value: number; onPick: (i: number) => void; label: string }) {
  return (
    <div className="flex items-center gap-1.5" role="radiogroup" aria-label={label}>
      <span className="w-14 text-xs text-pvc/60">{label}</span>
      {colors.map((c, i) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={`${label} ${i + 1}`}
          onClick={() => onPick(i)}
          className={`size-5 rounded-full border-2 ${value === i ? 'border-tape' : 'border-transparent'}`}
          style={{ background: hexColor(c) }}
        />
      ))}
    </div>
  );
}

/** Cambio de apariencia; solo aparece si hay una Peluquería con energía. */
export function BarberSection({ dweller }: { dweller: Dweller }) {
  const available = useGameStore((s) => hasWorkingBarber(s));
  const codos = useGameStore((s) => s.resources.codos);
  const restyle = useGameStore((s) => s.restyle);
  const [draft, setDraft] = useState<Appearance>(() => resolveAppearance(dweller));
  if (!available || !dweller.alive) return null;

  const current = resolveAppearance(dweller);
  const changed = JSON.stringify(current) !== JSON.stringify(draft);

  return (
    <div className="mb-3 space-y-1.5 rounded-lg bg-black/30 p-2">
      <h3 className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-pvc/50">
        <Scissors size={12} /> Peluquería
      </h3>
      <Swatches label="Piel" colors={SKIN_TONES} value={draft.skin} onPick={(skin) => setDraft({ ...draft, skin })} />
      <Swatches label="Pelo" colors={HAIR_COLORS} value={draft.hair} onPick={(hair) => setDraft({ ...draft, hair })} />
      <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Peinado">
        <span className="w-14 text-xs text-pvc/60">Peinado</span>
        {HAIR_STYLES.map((style) => (
          <button
            key={style}
            type="button"
            role="radio"
            aria-checked={draft.style === style}
            onClick={() => setDraft({ ...draft, style })}
            className={`rounded px-1.5 py-0.5 text-xs ${draft.style === style ? 'bg-tape text-bunker-900' : 'bg-bunker-900 hover:bg-bunker-600'}`}
          >
            {STYLE_NAMES[style]}
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={!changed || codos < BARBER_COST}
        onClick={() => restyle(dweller.id, draft)}
        className="w-full rounded-lg border-2 border-pink-400/70 py-1 text-sm font-bold hover:bg-pink-500/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Aplicar nuevo look ({BARBER_COST} Codos)
      </button>
    </div>
  );
}
