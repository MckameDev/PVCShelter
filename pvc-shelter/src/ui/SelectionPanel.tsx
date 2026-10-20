import { ArrowBigUp, Mountain, Pickaxe, Trash, Wrench, X } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { ROOM_DEFS } from '../core/config';
import { demolishRefund, rockClearCost, roomCapacity, roomEfficiency, upgradeCost } from '../core/Economy';
import { canDemolishRoom, canUpgradeRoom } from '../core/GridManager';
import type { Rock, Room } from '../core/types';
import { useGameStore } from '../store/useGameStore';
import { hexColor, ROOM_ICONS } from './roomIcons';

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  const select = useGameStore((s) => s.select);
  return (
    <aside className="pointer-events-auto absolute right-3 bottom-28 left-3 rounded-xl border-2 border-bunker-600 bg-bunker-800/95 p-3 shadow-2xl sm:left-auto sm:w-80">
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <h2 className="flex-1 text-base font-bold">{title}</h2>
        <button type="button" aria-label="Cerrar" onClick={() => select(null)} className="rounded p-1 hover:bg-bunker-600">
          <X size={16} />
        </button>
      </div>
      {children}
    </aside>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-pvc/60">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function ActionButton(props: { onClick: () => void; disabled?: boolean; tone: 'primary' | 'danger'; children: ReactNode; title?: string }) {
  const tones = {
    primary: 'border-tape/70 bg-tape/15 hover:bg-tape/30',
    danger: 'border-red-500/70 bg-red-500/15 hover:bg-red-500/30',
  };
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border-2 px-2 py-1.5 text-sm font-bold active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${tones[props.tone]}`}
    >
      {props.children}
    </button>
  );
}

function RoomDetails({ room }: { room: Room }) {
  const grid = useGameStore((s) => s.grid);
  const codos = useGameStore((s) => s.resources.codos);
  const upgrade = useGameStore((s) => s.upgradeRoom);
  const demolish = useGameStore((s) => s.demolishRoom);
  // Se reinicia al cambiar de sala porque el padre usa key={room.id}.
  const [confirming, setConfirming] = useState(false);

  const def = ROOM_DEFS[room.type];
  const Icon = ROOM_ICONS[room.type];
  const upCheck = canUpgradeRoom(grid, room.id);
  const upCost = upgradeCost(room);
  const demoCheck = canDemolishRoom(grid, room.id);
  const capacity = roomCapacity(room);

  return (
    <Panel title={def.name} icon={<Icon size={20} style={{ color: hexColor(def.accent) }} />}>
      <p className="mb-2 text-xs text-pvc/70">{def.description}</p>
      <div className="mb-3 space-y-0.5">
        {def.maxLevel > 1 && <Row label="Nivel" value={`${room.level} / ${def.maxLevel}`} />}
        {def.mergeable && <Row label="Tamaño" value={['Simple', 'Doble', 'Triple'][room.blocks - 1]} />}
        {capacity > 0 && <Row label="Capacidad" value={`${capacity} habitantes`} />}
        {def.stat && <Row label="Atributo" value={def.stat} />}
        {def.stat && <Row label="Eficiencia" value={`×${roomEfficiency(room).toFixed(1)}`} />}
        <Row label="Piso" value={room.floor} />
      </div>

      <div className="flex gap-2">
        {def.maxLevel > 1 && (
          <ActionButton
            tone="primary"
            onClick={() => upgrade(room.id)}
            disabled={!upCheck.ok || upCost === null || codos < upCost}
            title={upCheck.ok ? undefined : upCheck.reason}
          >
            <ArrowBigUp size={16} />
            {upCost === null ? 'Nivel máx.' : <>Mejorar <Wrench size={12} /> {upCost}</>}
          </ActionButton>
        )}
        {def.demolishable &&
          (confirming ? (
            <ActionButton tone="danger" onClick={() => demolish(room.id)}>
              ¿Seguro? +{demolishRefund(room)}
            </ActionButton>
          ) : (
            <ActionButton
              tone="danger"
              onClick={() => setConfirming(true)}
              disabled={!demoCheck.ok}
              title={demoCheck.ok ? undefined : demoCheck.reason}
            >
              <Trash size={16} /> Demoler
            </ActionButton>
          ))}
      </div>
      {!demoCheck.ok && def.demolishable && <p className="mt-2 text-xs text-red-300">{demoCheck.reason}</p>}
    </Panel>
  );
}

function RockDetails({ rock }: { rock: Rock }) {
  const codos = useGameStore((s) => s.resources.codos);
  const clear = useGameStore((s) => s.clearRock);
  const cost = rockClearCost(rock);
  return (
    <Panel title="Roca" icon={<Mountain size={20} className="text-stone-400" />}>
      <p className="mb-3 text-xs text-pvc/70">Hay que picarla antes de poder construir en este espacio.</p>
      <ActionButton tone="primary" onClick={() => clear(rock.id)} disabled={codos < cost}>
        <Pickaxe size={16} /> Romper <Wrench size={12} /> {cost}
      </ActionButton>
    </Panel>
  );
}

export function SelectionPanel() {
  const selection = useGameStore((s) => s.selection);
  const room = useGameStore((s) => (s.selection?.kind === 'room' ? s.grid.rooms[s.selection.id] : undefined));
  const rock = useGameStore((s) => (s.selection?.kind === 'rock' ? s.grid.rocks[s.selection.id] : undefined));

  if (!selection) return null;
  if (room) return <RoomDetails key={room.id} room={room} />;
  if (rock) return <RockDetails rock={rock} />;
  return null;
}
