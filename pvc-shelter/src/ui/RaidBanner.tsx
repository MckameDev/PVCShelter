import { ShieldAlert } from 'lucide-react';
import { RAID_DEFS, ROOM_DEFS } from '../core/config';
import { raidRoomId } from '../core/Raids';
import { useGameStore } from '../store/useGameStore';

/** Aviso persistente mientras dura un asalto, con acceso rápido a la sala atacada. */
export function RaidBanner() {
  const raid = useGameStore((s) => s.raid);
  const rooms = useGameStore((s) => s.grid.rooms);
  const select = useGameStore((s) => s.select);
  if (!raid) return null;

  const def = RAID_DEFS[raid.kind];
  const alive = raid.enemies.filter((e) => e.hp > 0);
  const hp = alive.reduce((s, e) => s + e.hp, 0);
  const maxHp = raid.enemies.reduce((s, e) => s + e.maxHp, 0);
  const roomId = raidRoomId(raid);
  const room = roomId ? rooms[roomId] : Object.values(rooms).find((r) => r.type === 'entrance');

  return (
    <div
      role="alert"
      className="pointer-events-auto absolute top-28 left-1/2 w-[min(28rem,calc(100%-6rem))] -translate-x-1/2 rounded-xl border-2 border-red-500 bg-red-950/95 p-2 text-sm shadow-2xl"
    >
      <div className="flex items-center gap-2">
        <ShieldAlert size={18} className="shrink-0 animate-pulse text-red-300" />
        <b className="flex-1">
          {def.name}: {alive.length}/{raid.enemies.length}
        </b>
        {room && (
          <button
            type="button"
            onClick={() => select({ kind: 'room', id: room.id })}
            className="rounded-md border border-red-400 px-2 py-0.5 text-xs font-bold hover:bg-red-500/30"
          >
            Ir a {ROOM_DEFS[room.type].name}
          </button>
        )}
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/60" aria-label="Vida de los asaltantes">
        <div className="h-full bg-red-400" style={{ width: `${(hp / maxHp) * 100}%` }} />
      </div>
      <p className="mt-1 text-xs text-red-200">
        {raid.phase === 'door'
          ? `Golpean la puerta (${Math.ceil(raid.doorHp)}/${raid.doorMaxHp}). Pon guardias en la entrada.`
          : raid.stealTimer > 0
            ? `Saqueando ${room ? ROOM_DEFS[room.type].name : 'una sala'}: no hay defensores.`
            : `Combatiendo en ${room ? ROOM_DEFS[room.type].name : 'el búnker'}.`}
      </p>
    </div>
  );
}
