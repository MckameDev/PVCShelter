import { Recycle, ScrollText, X } from 'lucide-react';
import { useState } from 'react';
import { craftCost } from '../core/Crafting';
import { itemCapacity } from '../core/Economy';
import { ITEMS, itemSummary, KIND_NAMES, RARITY_NAMES } from '../core/items';
import type { ItemKind, Rarity } from '../core/types';
import { useGameStore } from '../store/useGameStore';
import { junkText, RARITY_CLASS } from './itemFormat';

type Tab = ItemKind | 'junk';
const TABS: { id: Tab; label: string }[] = [
  { id: 'weapon', label: 'Armas' },
  { id: 'outfit', label: 'Atuendos' },
  { id: 'pet', label: 'Mascotas' },
  { id: 'junk', label: 'Chatarra y planos' },
];

export function InventoryPanel() {
  const open = useGameStore((s) => s.inventoryOpen);
  const inventory = useGameStore((s) => s.inventory);
  const grid = useGameStore((s) => s.grid);
  const setOpen = useGameStore((s) => s.setInventoryOpen);
  const scrap = useGameStore((s) => s.scrap);
  const [tab, setTab] = useState<Tab>('weapon');
  const [confirming, setConfirming] = useState<string | null>(null);

  if (!open) return null;
  const items = Object.values(inventory.items);
  const capacity = itemCapacity(grid);
  const visible = items
    .filter((i) => ITEMS[i.defId].kind === tab)
    .sort((a, b) => ITEMS[a.defId].name.localeCompare(ITEMS[b.defId].name));

  return (
    <aside className="pointer-events-auto absolute top-16 bottom-28 left-3 flex w-[calc(100%-1.5rem)] flex-col rounded-xl border-2 border-bunker-600 bg-bunker-800/95 shadow-2xl sm:w-96">
      <div className="flex items-center gap-2 border-b border-bunker-600 p-3">
        <h2 className="flex-1 font-bold">Inventario</h2>
        <span className={`text-xs tabular-nums ${items.length >= capacity ? 'text-red-400' : 'text-pvc/60'}`}>
          {items.length} / {capacity} plazas
        </span>
        <button type="button" aria-label="Cerrar" onClick={() => setOpen(false)} className="rounded p-1 hover:bg-bunker-600">
          <X size={16} />
        </button>
      </div>
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-bunker-600 px-2 pt-1.5 scrollbar-none">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-t-md px-2.5 py-1 text-xs font-bold ${tab === t.id ? 'bg-bunker-600 text-tape' : 'text-pvc/50 hover:text-pvc'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {tab === 'junk' ? (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-3 gap-2 text-center">
              {(Object.keys(RARITY_NAMES) as Rarity[]).map((r) => (
                <div key={r} className="rounded-lg bg-black/30 p-2">
                  <div className={`text-lg font-bold tabular-nums ${RARITY_CLASS[r]}`}>{inventory.junk[r]}</div>
                  <div className="text-xs text-pvc/60">Chatarra {RARITY_NAMES[r].toLowerCase()}</div>
                </div>
              ))}
            </div>
            <div>
              <h3 className="mb-1 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-pvc/50">
                <ScrollText size={12} /> Planos conocidos
              </h3>
              <ul className="space-y-1">
                {inventory.recipes.map((id) => {
                  const def = ITEMS[id];
                  const cost = craftCost(def);
                  return (
                    <li key={id} className="rounded-md bg-black/30 px-2 py-1">
                      <div className="flex justify-between gap-2">
                        <span className={`font-semibold ${RARITY_CLASS[def.rarity]}`}>{def.name}</span>
                        <span className="text-xs text-pvc/60">{KIND_NAMES[def.kind]}</span>
                      </div>
                      <div className="text-xs text-pvc/60">
                        {junkText(cost.junk)} · {cost.codos} Codos
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-xs text-pvc/50">Se fabrican en el Taller de Armas o el de Costura. Más planos, en el Yermo.</p>
            </div>
          </div>
        ) : visible.length === 0 ? (
          <p className="p-2 text-sm text-pvc/60">No hay {TABS.find((t) => t.id === tab)?.label.toLowerCase()} sin equipar.</p>
        ) : (
          <ul className="space-y-1.5">
            {visible.map((item) => {
              const def = ITEMS[item.defId];
              return (
                <li key={item.id} className="flex items-center gap-2 rounded-lg bg-black/30 p-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className={`font-semibold ${RARITY_CLASS[def.rarity]}`}>{def.name}</div>
                    <div className="text-xs text-pvc/60">
                      {RARITY_NAMES[def.rarity]} · {itemSummary(def)}
                    </div>
                  </div>
                  {def.kind !== 'pet' && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirming === item.id) {
                          scrap(item.id);
                          setConfirming(null);
                        } else {
                          setConfirming(item.id);
                        }
                      }}
                      className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-bold ${
                        confirming === item.id ? 'border-red-400 bg-red-500/20' : 'border-bunker-600 hover:border-red-400'
                      }`}
                    >
                      <Recycle size={12} /> {confirming === item.id ? '¿Seguro?' : 'Desguazar'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="border-t border-bunker-600 p-2 text-xs text-pvc/50">Para equipar, abre la ficha de un habitante.</p>
    </aside>
  );
}
