import { Disc3, House, Wrench } from 'lucide-react';
import type { ReactNode } from 'react';
import { useGameStore } from '../store/useGameStore';

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-bunker-900/70 px-3 py-1.5" title={label}>
      {icon}
      <span className="font-bold tabular-nums">{value}</span>
      <span className="hidden text-xs text-pvc/60 sm:inline">{label}</span>
    </div>
  );
}

// Energía, Comida, Agua y Población se suman en los Sprints 2 y 3.
export function TopBar() {
  const codos = useGameStore((s) => s.resources.codos);
  const cinta = useGameStore((s) => s.resources.cinta);
  const roomCount = useGameStore((s) => Object.keys(s.grid.rooms).length);

  return (
    <header className="pointer-events-auto absolute inset-x-0 top-0 flex items-center gap-2 overflow-x-auto border-b-2 border-bunker-600 bg-bunker-800/95 px-3 py-2 shadow-lg">
      <Stat icon={<Wrench size={18} className="text-tape" />} label="Codos de PVC" value={codos.toLocaleString('es')} />
      <Stat icon={<Disc3 size={18} className="text-pvc" />} label="Rollos de Cinta" value={cinta} />
      <Stat icon={<House size={18} className="text-pvc/70" />} label="Salas" value={roomCount} />
    </header>
  );
}
