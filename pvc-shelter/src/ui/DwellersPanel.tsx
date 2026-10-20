import { Baby, Heart, Skull, X } from 'lucide-react';
import { ROOM_DEFS } from '../core/config';
import { isAdult, PATRON_KEYS, PATRON_NAMES } from '../core/Dwellers';
import { useGameStore } from '../store/useGameStore';
import { HealthBar } from './HealthBar';

/** Lista de habitantes con su salud, stats P.A.T.R.O.N. y sala asignada. */
export function DwellersPanel() {
  const open = useGameStore((s) => s.dwellersOpen);
  const dwellers = useGameStore((s) => s.dwellers);
  const rooms = useGameStore((s) => s.grid.rooms);
  const setOpen = useGameStore((s) => s.setDwellersOpen);
  const openDweller = useGameStore((s) => s.openDweller);

  if (!open) return null;
  const list = Object.values(dwellers).sort((a, b) => Number(b.alive) - Number(a.alive) || a.name.localeCompare(b.name));

  return (
    <aside className="pointer-events-auto absolute top-16 bottom-28 left-3 flex w-[calc(100%-1.5rem)] flex-col rounded-xl border-2 border-bunker-600 bg-bunker-800/95 shadow-2xl sm:w-96">
      <div className="flex items-center gap-2 border-b border-bunker-600 p-3">
        <h2 className="flex-1 font-bold">Habitantes</h2>
        <button type="button" aria-label="Cerrar" onClick={() => setOpen(false)} className="rounded p-1 hover:bg-bunker-600">
          <X size={16} />
        </button>
      </div>
      <ul className="flex-1 space-y-1.5 overflow-y-auto p-2">
        {list.map((d) => {
          const room = d.roomId ? rooms[d.roomId] : undefined;
          return (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => openDweller(d.id)}
                className={`w-full rounded-lg bg-bunker-900/70 p-2 text-left hover:bg-bunker-600 ${d.alive ? '' : 'opacity-50'}`}
              >
                <div className="flex items-center gap-2 text-sm">
                  {!d.alive && <Skull size={14} className="text-red-400" />}
                  <span className="font-bold">{d.name}</span>
                  <span className="text-xs text-pvc/50">{d.sex === 'M' ? '♂' : '♀'} · Nv {d.level}</span>
                  {d.alive && !isAdult(d) && <Baby size={14} className="text-emerald-300" aria-label="Niño" />}
                  {d.pregnancy && <Baby size={14} className="text-pink-300" aria-label="Embarazada" />}
                  {d.courtship && <Heart size={14} className="text-pink-400" aria-label="Cortejando" />}
                  <span className="ml-auto text-xs text-pvc/60">
                    {!d.alive ? 'Fallecido' : room ? ROOM_DEFS[room.type].name : isAdult(d) ? 'Sin asignar' : 'Paseando'}
                  </span>
                </div>
                {d.alive && <HealthBar dweller={d} className="mt-1.5" />}
                <div className="mt-1.5 grid grid-cols-6 gap-1 text-center text-xs">
                  {PATRON_KEYS.map((k) => (
                    <span key={k} title={PATRON_NAMES[k]} className="rounded bg-black/40 py-0.5">
                      <b className="text-tape">{k}</b> {d.stats[k]}
                    </span>
                  ))}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
