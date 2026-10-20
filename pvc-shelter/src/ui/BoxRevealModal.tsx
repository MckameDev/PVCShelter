import { Bandage, Disc3, Droplets, FlaskConical, PawPrint, Puzzle, Shirt, Sword, UserRound, Utensils, Wrench, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ITEMS, itemSummary, RARITY_NAMES } from '../core/items';
import type { Card } from '../core/Lunchbox';
import { RESOURCE_NAMES } from '../core/Production';
import { useGameStore } from '../store/useGameStore';
import { RARITY_CLASS } from './itemFormat';

function describe(card: Card): { Icon: LucideIcon; title: string; detail: string; tone: string } {
  switch (card.kind) {
    case 'codos':
      return { Icon: Wrench, title: `${card.amount} Codos`, detail: card.note ?? 'Codos de PVC', tone: 'text-tape' };
    case 'cinta':
      return { Icon: Disc3, title: `${card.amount} Rollos`, detail: 'Rollos de Cinta', tone: 'text-pvc' };
    case 'resource': {
      const Icon = card.resource === 'energy' ? Zap : card.resource === 'food' ? Utensils : Droplets;
      return { Icon, title: `+${card.amount}`, detail: RESOURCE_NAMES[card.resource], tone: 'text-emerald-300' };
    }
    case 'med':
      return {
        Icon: card.med === 'stimpaks' ? Bandage : FlaskConical,
        title: `+${card.amount}`,
        detail: RESOURCE_NAMES[card.med],
        tone: 'text-red-300',
      };
    case 'junk':
      return { Icon: Puzzle, title: `×${card.amount}`, detail: `Chatarra ${RARITY_NAMES[card.rarity].toLowerCase()}`, tone: RARITY_CLASS[card.rarity] };
    case 'item': {
      const def = ITEMS[card.defId];
      return { Icon: def.kind === 'weapon' ? Sword : Shirt, title: def.name, detail: itemSummary(def), tone: RARITY_CLASS[def.rarity] };
    }
    case 'pet': {
      const def = ITEMS[card.defId];
      return { Icon: PawPrint, title: def.name, detail: def.description, tone: 'text-sky-300' };
    }
    case 'dweller':
      return {
        Icon: UserRound,
        title: card.name,
        detail: card.rarity === 'legendary' ? '¡Habitante legendario!' : 'Habitante raro',
        tone: card.rarity === 'legendary' ? 'text-amber-300' : 'text-sky-300',
      };
  }
}

/** Revela las 5 cartas de la caja abierta. */
export function BoxRevealModal() {
  const reveal = useGameStore((s) => s.boxReveal);
  const close = useGameStore((s) => s.closeBoxReveal);
  if (!reveal) return null;

  return (
    <div className="pointer-events-auto absolute inset-0 grid place-items-center bg-black/70 p-4" onClick={close}>
      <section
        role="dialog"
        aria-label="Contenido de la caja"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl space-y-3 rounded-xl border-2 border-bunker-600 bg-bunker-800 p-4 shadow-2xl"
      >
        <h2 className="text-center text-lg font-bold">
          {reveal.kind === 'rare' ? 'Caja de Herramientas rara' : 'Caja de Herramientas'}
        </h2>
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {reveal.cards.map((card, i) => {
            const { Icon, title, detail, tone } = describe(card);
            return (
              <li
                key={i}
                className="flex flex-col items-center gap-1 rounded-lg border-2 border-bunker-600 bg-black/40 p-2 text-center"
                style={{ animation: `pvc-card-in 350ms ease-out ${i * 140}ms both` }}
              >
                <Icon size={28} className={tone} />
                <b className={`text-sm ${tone}`}>{title}</b>
                <span className="text-xs text-pvc/60">{detail}</span>
              </li>
            );
          })}
        </ol>
        <button type="button" onClick={close} className="w-full rounded-lg border-2 border-tape bg-tape/20 py-2 font-bold hover:bg-tape/35">
          ¡Genial!
        </button>
      </section>
    </div>
  );
}
