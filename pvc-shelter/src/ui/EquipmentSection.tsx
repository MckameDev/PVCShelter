import { PawPrint, Shirt, Sword } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { isAdult } from '../core/Dwellers';
import { ITEMS, itemSummary, KIND_NAMES } from '../core/items';
import type { Dweller, ItemKind } from '../core/types';
import { useGameStore } from '../store/useGameStore';
import { RARITY_CLASS } from './itemFormat';

const SLOTS: { kind: ItemKind; Icon: LucideIcon }[] = [
  { kind: 'weapon', Icon: Sword },
  { kind: 'outfit', Icon: Shirt },
  { kind: 'pet', Icon: PawPrint },
];

/** Las 3 ranuras del habitante: arma, atuendo y mascota. */
export function EquipmentSection({ dweller }: { dweller: Dweller }) {
  const items = useGameStore((s) => s.inventory.items);
  const equip = useGameStore((s) => s.equip);
  const unequip = useGameStore((s) => s.unequip);
  if (!dweller.alive || !isAdult(dweller)) return null;

  return (
    <div className="mb-3">
      <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-pvc/50">Equipo</h3>
      <ul className="space-y-1">
        {SLOTS.map(({ kind, Icon }) => {
          const equipped = dweller.equipment[kind];
          const def = equipped ? ITEMS[equipped.defId] : undefined;
          const options = Object.values(items).filter((i) => ITEMS[i.defId].kind === kind);
          return (
            <li key={kind} className="flex items-center gap-2 rounded-md bg-black/30 px-2 py-1 text-sm">
              <Icon size={14} className="shrink-0 text-pvc/60" aria-label={KIND_NAMES[kind]} />
              <div className="min-w-0 flex-1">
                {def ? (
                  <>
                    <div className={`truncate font-semibold ${RARITY_CLASS[def.rarity]}`}>{def.name}</div>
                    <div className="truncate text-xs text-pvc/60">{itemSummary(def)}</div>
                  </>
                ) : (
                  <span className="text-xs text-pvc/50">Sin {KIND_NAMES[kind].toLowerCase()}</span>
                )}
              </div>
              {options.length > 0 && (
                <select
                  value=""
                  onChange={(e) => e.target.value && equip(dweller.id, e.target.value)}
                  aria-label={`Equipar ${KIND_NAMES[kind].toLowerCase()}`}
                  className="w-24 rounded border border-bunker-600 bg-bunker-900 px-1 py-0.5 text-xs"
                >
                  <option value="">{def ? 'Cambiar…' : 'Equipar…'}</option>
                  {options.map((i) => (
                    <option key={i.id} value={i.id}>
                      {ITEMS[i.defId].name} ({itemSummary(ITEMS[i.defId])})
                    </option>
                  ))}
                </select>
              )}
              {def && (
                <button
                  type="button"
                  onClick={() => unequip(dweller.id, kind)}
                  className="rounded border border-bunker-600 px-1.5 py-0.5 text-xs hover:border-red-400"
                >
                  Quitar
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
