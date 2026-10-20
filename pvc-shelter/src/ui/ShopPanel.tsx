import { Disc3, Gift, Package, PackageOpen, X } from 'lucide-react';
import { BOX_PRICES, CINTA_PACKS } from '../core/config';
import type { BoxKind } from '../core/types';
import { useGameStore } from '../store/useGameStore';

const BOX_INFO: Record<BoxKind, { name: string; text: string; tone: string }> = {
  common: { name: 'Caja de Herramientas', text: '5 cartas: Codos, recursos, curativos, chatarra, objetos y a veces un habitante.', tone: 'border-bunker-600' },
  rare: { name: 'Caja de Herramientas rara', text: 'Siempre trae una mascota, mejores objetos y más habitantes legendarios.', tone: 'border-sky-500/70' },
};

/** Cajas (abrir y comprar con cinta) y paquetes de cinta de la tienda simulada. */
export function ShopPanel() {
  const open = useGameStore((s) => s.shopOpen);
  const boxes = useGameStore((s) => s.boxes);
  const cinta = useGameStore((s) => s.resources.cinta);
  const setOpen = useGameStore((s) => s.setShopOpen);
  const openBox = useGameStore((s) => s.openBox);
  const buyBox = useGameStore((s) => s.buyBox);
  const claimPack = useGameStore((s) => s.claimCintaPack);
  if (!open) return null;

  return (
    <aside className="pointer-events-auto absolute top-16 bottom-28 left-3 flex w-[calc(100%-1.5rem)] flex-col rounded-xl border-2 border-bunker-600 bg-bunker-800/95 shadow-2xl sm:w-96">
      <div className="flex items-center gap-2 border-b border-bunker-600 p-3">
        <Gift size={18} className="text-tape" />
        <h2 className="flex-1 font-bold">Cajas y tienda</h2>
        <span className="flex items-center gap-1 text-sm tabular-nums">
          <Disc3 size={14} /> {cinta}
        </span>
        <button type="button" aria-label="Cerrar" onClick={() => setOpen(false)} className="rounded p-1 hover:bg-bunker-600">
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3 text-sm">
        {(Object.keys(BOX_INFO) as BoxKind[]).map((kind) => (
          <div key={kind} className={`space-y-2 rounded-lg border-2 bg-black/30 p-2 ${BOX_INFO[kind].tone}`}>
            <div className="flex items-center gap-2">
              <Package size={18} className={kind === 'rare' ? 'text-sky-300' : 'text-tape'} />
              <b className="flex-1">{BOX_INFO[kind].name}</b>
              <span className="tabular-nums">×{boxes[kind]}</span>
            </div>
            <p className="text-xs text-pvc/60">{BOX_INFO[kind].text}</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={boxes[kind] < 1}
                onClick={() => openBox(kind)}
                className="flex flex-1 items-center justify-center gap-1 rounded-md border-2 border-emerald-400/70 bg-emerald-500/15 py-1 text-xs font-bold hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <PackageOpen size={14} /> Abrir
              </button>
              <button
                type="button"
                disabled={cinta < BOX_PRICES[kind]}
                onClick={() => buyBox(kind)}
                className="flex flex-1 items-center justify-center gap-1 rounded-md border-2 border-tape/70 py-1 text-xs font-bold hover:bg-tape/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Comprar · <Disc3 size={12} /> {BOX_PRICES[kind]}
              </button>
            </div>
          </div>
        ))}

        <div className="space-y-2 rounded-lg border-2 border-dashed border-bunker-600 p-2">
          <b>Rollos de Cinta</b>
          <p className="text-xs text-amber-200">
            Tienda SIMULADA: no se cobra dinero real ni se piden datos de pago. Los rollos aceleran esperas y compran cajas.
          </p>
          {CINTA_PACKS.map((pack) => (
            <button
              key={pack.id}
              type="button"
              onClick={() => claimPack(pack.id)}
              className="flex w-full items-center justify-between rounded-md bg-black/30 px-2 py-1.5 text-left hover:bg-bunker-600"
            >
              <span>{pack.name}</span>
              <span className="flex items-center gap-1 font-bold">
                <Disc3 size={12} /> +{pack.cinta} <span className="text-xs font-normal text-pvc/50">(simulado)</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
