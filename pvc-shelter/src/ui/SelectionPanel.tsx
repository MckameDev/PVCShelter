import {
  ArrowBigUp,
  Baby,
  Flame,
  Heart,
  Mountain,
  Pickaxe,
  Radio,
  ShieldAlert,
  Trash,
  UserMinus,
  Wrench,
  X,
  Zap,
  ZapOff,
} from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { canDemolish } from '../core/Bunker';
import { canFight } from '../core/Combat';
import { raidRoomId } from '../core/Raids';
import {
  COURTSHIP_SECONDS,
  DOOR_HP,
  ENTRANCE_GUARDS,
  INCIDENT_DEFS,
  INCIDENT_SPREAD_SECONDS,
  RAID_DEFS,
  ITEM_CAPACITY_PER_STORAGE_BLOCK,
  LEVEL_EFFICIENCY,
  MAX_BASE_STAT,
  POPULATION_PER_BARRACKS_BLOCK,
  POPULATION_PER_LIVING_BLOCK,
  ROOM_DEFS,
} from '../core/config';
import { dwellersInRoom, globalHappiness, isAdult, PATRON_NAMES } from '../core/Dwellers';
import { demolishRefund, rockClearCost, roomCapacity, roomEfficiency, upgradeCost } from '../core/Economy';
import { radioHappinessBonus, recruitChance, trainingSeconds } from '../core/LifeCycle';
import { canUpgradeRoom } from '../core/GridManager';
import { canRush, cycleTime, cycleYield, getRuntime, RESOURCE_NAMES } from '../core/Production';
import type { Rock, Room } from '../core/types';
import { useGameStore } from '../store/useGameStore';
import { CraftingSection } from './CraftingSection';
import { OverseerSection } from './OverseerSection';
import { HealthBar } from './HealthBar';
import { hexColor, ROOM_ICONS } from './roomIcons';

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  const select = useGameStore((s) => s.select);
  return (
    <aside className="pointer-events-auto absolute right-3 bottom-28 left-3 max-h-[65vh] overflow-y-auto rounded-xl border-2 border-bunker-600 bg-bunker-800/95 p-3 shadow-2xl sm:left-auto sm:w-80">
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

function ActionButton(props: {
  onClick: () => void;
  disabled?: boolean;
  tone: 'primary' | 'danger' | 'go';
  children: ReactNode;
  title?: string;
}) {
  const tones = {
    primary: 'border-tape/70 bg-tape/15 hover:bg-tape/30',
    danger: 'border-red-500/70 bg-red-500/15 hover:bg-red-500/30',
    go: 'border-emerald-400/70 bg-emerald-500/15 hover:bg-emerald-500/30',
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

/** Estado del ciclo de producción, Exprés y recolección. */
function ProductionSection({ room }: { room: Room }) {
  const state = useGameStore();
  const def = ROOM_DEFS[room.type];
  if (!def.produces) return null;

  const runtime = getRuntime(state, room.id);
  const workers = dwellersInRoom(state, room.id);
  const cycle = cycleTime(room, workers, globalHappiness(state));
  const rush = canRush(state, room.id);
  const resourceName = RESOURCE_NAMES[def.produces];

  let status: ReactNode;
  if (runtime.incident || raidRoomId(state.raid) === room.id) {
    status = <span className="text-red-300">Producción detenida mientras dure el peligro.</span>;
  } else if (!runtime.powered) {
    status = (
      <span className="flex items-center gap-1 text-red-300">
        <ZapOff size={14} /> Sin energía: está demasiado lejos de un generador
      </span>
    );
  } else if (runtime.ready) {
    status = <span className="text-emerald-300">¡{resourceName} lista para recolectar!</span>;
  } else if (cycle === null) {
    status = <span className="text-pvc/60">Sin trabajadores: asigna habitantes para producir.</span>;
  } else {
    const pct = Math.min(100, (runtime.progress / cycle) * 100);
    status = (
      <div>
        <div className="flex justify-between text-xs text-pvc/70">
          <span>Produciendo {cycleYield(room)} de {resourceName}</span>
          <span className="tabular-nums">{Math.ceil(cycle - runtime.progress)} s</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/60">
          <div className="h-full rounded-full bg-emerald-400" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-lg bg-black/30 p-2 text-sm">
      {status}
      <div className="mt-2 flex gap-2">
        {runtime.ready ? (
          <ActionButton tone="go" onClick={() => state.collect(def.produces!)}>
            Recolectar
          </ActionButton>
        ) : (
          <ActionButton
            tone="primary"
            onClick={() => state.rush(room.id)}
            disabled={!rush.ok}
            title={rush.ok ? 'Producir al instante. Si falla, provoca un incidente.' : rush.reason}
          >
            <Zap size={14} /> Exprés
            {rush.ok && (
              <span className="text-xs font-normal text-red-300">{Math.round(rush.value.failChance * 100)}% fallo</span>
            )}
          </ActionButton>
        )}
      </div>
    </div>
  );
}

/** Habitantes asignados y selector para asignar a otros. */
function WorkersSection({ room }: { room: Room }) {
  const dwellers = useGameStore((s) => s.dwellers);
  const rooms = useGameStore((s) => s.grid.rooms);
  const assign = useGameStore((s) => s.assign);
  const openDweller = useGameStore((s) => s.openDweller);
  const capacity = roomCapacity(room);
  const stat = ROOM_DEFS[room.type].stat;
  if (capacity === 0) return null;

  const workers = dwellersInRoom({ dwellers }, room.id);
  // Candidatos: primero los sin asignar, luego por el stat que usa la sala.
  const candidates = Object.values(dwellers)
    .filter((d) => d.alive && isAdult(d) && d.roomId !== room.id)
    .sort((a, b) => Number(a.roomId !== null) - Number(b.roomId !== null) || (stat ? b.stats[stat] - a.stats[stat] : 0));

  return (
    <div className="mb-3">
      <div className="mb-1 flex justify-between text-xs font-bold uppercase tracking-wider text-pvc/50">
        <span>Habitantes</span>
        <span>
          {workers.length} / {capacity}
        </span>
      </div>
      <ul className="space-y-1">
        {workers.map((d) => (
          <li key={d.id} className="flex items-center gap-2 rounded-md bg-black/30 px-2 py-1 text-sm">
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-2">
                <button type="button" onClick={() => openDweller(d.id)} className="truncate hover:underline">
                  {d.name}
                </button>
                {stat && (
                  <span className="text-xs text-tape" title={PATRON_NAMES[stat]}>
                    {stat} {d.stats[stat]}
                  </span>
                )}
              </div>
              <HealthBar dweller={d} className="mt-1" />
            </div>
            <button
              type="button"
              aria-label={`Sacar a ${d.name}`}
              title="Sacar de la sala"
              onClick={() => assign(d.id, null)}
              className="rounded p-1 hover:bg-bunker-600"
            >
              <UserMinus size={14} />
            </button>
          </li>
        ))}
      </ul>
      {workers.length < capacity && candidates.length > 0 && (
        <select
          value=""
          onChange={(e) => e.target.value && assign(e.target.value, room.id)}
          className="mt-1.5 w-full rounded-md border border-bunker-600 bg-bunker-900 px-2 py-1.5 text-sm"
          aria-label="Asignar habitante"
        >
          <option value="">+ Asignar habitante…</option>
          {candidates.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
              {stat ? ` · ${stat} ${d.stats[stat]}` : ''}
              {d.roomId && rooms[d.roomId] ? ` (en ${ROOM_DEFS[rooms[d.roomId].type].name})` : ''}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

/** Sala de Descanso: parejas cortejando y embarazos de quienes están dentro. */
function LivingSection({ room }: { room: Room }) {
  const dwellers = useGameStore((s) => s.dwellers);
  if (room.type !== 'living') return null;
  const occupants = dwellersInRoom({ dwellers }, room.id);
  const couples = occupants.filter((d) => d.courtship);
  const pregnant = occupants.filter((d) => d.pregnancy);
  const beds = Math.floor(POPULATION_PER_LIVING_BLOCK * room.blocks * LEVEL_EFFICIENCY[room.level]);

  return (
    <div className="mb-3 space-y-1.5 rounded-lg bg-black/30 p-2 text-sm">
      <p className="text-xs text-pvc/70">
        Aporta {beds} plazas de población. Un hombre y una mujer adultos (sin parentesco) aquí dentro se cortejan; el
        Optimismo (O) lo acelera.
      </p>
      {couples.map((w) => (
        <div key={w.id}>
          <div className="flex items-center gap-1 text-xs">
            <Heart size={12} className="text-pink-400" />
            {w.name} y {dwellers[w.courtship!.partnerId]?.name}
          </div>
          <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-black/60">
            <div className="h-full bg-pink-400" style={{ width: `${(w.courtship!.progress / COURTSHIP_SECONDS) * 100}%` }} />
          </div>
        </div>
      ))}
      {pregnant.map((w) => (
        <div key={w.id} className="flex items-center gap-1 text-xs text-pink-200">
          <Baby size={12} /> {w.name} está embarazada
        </div>
      ))}
    </div>
  );
}

/** Progreso de cada habitante hacia el siguiente punto del stat que entrena la sala. */
function TrainingSection({ room }: { room: Room }) {
  const dwellers = useGameStore((s) => s.dwellers);
  // Lectura directa: getRuntime() crea un objeto nuevo si falta y el selector re-renderizaría en bucle.
  const powered = useGameStore((s) => s.runtime[room.id]?.powered ?? true);
  const stat = ROOM_DEFS[room.type].trains;
  if (!stat) return null;
  const trainees = dwellersInRoom({ dwellers }, room.id);

  return (
    <div className="mb-3 space-y-1.5 rounded-lg bg-black/30 p-2 text-sm">
      <p className="text-xs text-pvc/70">
        Entrena {PATRON_NAMES[stat]} ({stat}) hasta {MAX_BASE_STAT}. Más nivel de sala = entrenamiento más rápido.
      </p>
      {!powered && <p className="text-xs text-red-300">Sin energía: el entrenamiento está en pausa.</p>}
      {trainees.length === 0 && <p className="text-xs text-pvc/60">Asigna habitantes para entrenar.</p>}
      {trainees.map((d) => {
        const maxed = d.stats[stat] >= MAX_BASE_STAT;
        const need = trainingSeconds(d.stats[stat], room);
        return (
          <div key={d.id}>
            <div className="flex justify-between text-xs">
              <span>
                {d.name}: {stat} {d.stats[stat]}
                {!maxed && ` → ${d.stats[stat] + 1}`}
              </span>
              <span className="tabular-nums text-pvc/60">{maxed ? 'Máximo' : `${Math.ceil(need - d.training)} s`}</span>
            </div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-black/60">
              <div className="h-full bg-tape" style={{ width: `${maxed ? 100 : (d.training / need) * 100}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Antena: progreso de la transmisión, probabilidad de atraer a alguien y bono de felicidad. */
function RadioSection({ room }: { room: Room }) {
  const state = useGameStore();
  if (room.type !== 'radio') return null;
  const runtime = getRuntime(state, room.id);
  const workers = dwellersInRoom(state, room.id);
  const cycle = cycleTime(room, workers, globalHappiness(state));
  const bonus = radioHappinessBonus(Object.values(state.grid.rooms), state.runtime, (id) => dwellersInRoom(state, id).length > 0);

  return (
    <div className="mb-3 space-y-1.5 rounded-lg bg-black/30 p-2 text-sm">
      <div className="flex items-center gap-1 text-xs text-pvc/70">
        <Radio size={12} /> Felicidad global de las radios: +{Math.round(bonus)} puntos
      </div>
      {cycle === null ? (
        <p className="text-xs text-pvc/60">Asigna habitantes (Optimismo) para transmitir.</p>
      ) : (
        <div>
          <div className="flex justify-between text-xs text-pvc/70">
            <span>Transmitiendo · {Math.round(recruitChance(workers) * 100)}% de atraer a alguien</span>
            <span className="tabular-nums">{runtime.powered ? `${Math.ceil(cycle - runtime.progress)} s` : 'Sin energía'}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/60">
            <div className="h-full bg-purple-400" style={{ width: `${Math.min(100, (runtime.progress / cycle) * 100)}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Incidente o asaltantes en esta sala: estado del combate y cuenta atrás de propagación. */
function DangerSection({ room }: { room: Room }) {
  const state = useGameStore();
  const incident = state.runtime[room.id]?.incident;
  const raidHere = raidRoomId(state.raid) === room.id;
  if (!incident && !raidHere) return null;
  const defenders = dwellersInRoom(state, room.id).filter(canFight);

  return (
    <div className="mb-3 space-y-1.5 rounded-lg border border-red-500/60 bg-red-950/60 p-2 text-sm">
      {incident && (
        <div>
          <div className="flex items-center justify-between gap-2 text-red-200">
            <span className="flex items-center gap-1 font-bold">
              <Flame size={14} /> {INCIDENT_DEFS[incident.kind].name}
            </span>
            <span className="tabular-nums text-xs">{Math.ceil((incident.hp / incident.maxHp) * 100)}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/60">
            <div className="h-full bg-red-400" style={{ width: `${(incident.hp / incident.maxHp) * 100}%` }} />
          </div>
          <p className="mt-1 text-xs text-red-200">
            {defenders.length > 0
              ? `${defenders.length} combatiendo. El daño recibido se reparte entre ellos.`
              : `¡Sala vacía! Se propagará en ${Math.max(0, Math.ceil(INCIDENT_SPREAD_SECONDS - incident.spread))} s. Asigna habitantes.`}
          </p>
        </div>
      )}
      {raidHere && state.raid && (
        <p className="flex items-center gap-1 text-xs text-red-200">
          <ShieldAlert size={14} />
          {RAID_DEFS[state.raid.kind].name} en esta sala:{' '}
          {defenders.length > 0 ? `${defenders.length} defensores combatiendo.` : 'la están saqueando.'}
        </p>
      )}
    </div>
  );
}

/** Puerta del Búnker: resistencia según nivel y guardias. */
function DoorSection({ room }: { room: Room }) {
  if (room.type !== 'entrance') return null;
  return (
    <p className="mb-3 rounded-lg bg-black/30 p-2 text-xs text-pvc/70">
      La puerta aguanta {DOOR_HP[room.level]} de daño antes de ceder
      {room.level < 3 && ` (nivel ${room.level + 1}: ${DOOR_HP[(room.level + 1) as 2 | 3]})`}. Los {ENTRANCE_GUARDS} guardias
      disparan a los asaltantes mientras golpean la puerta.
    </p>
  );
}

function RoomDetails({ room }: { room: Room }) {
  const state = useGameStore();
  // Se reinicia al cambiar de sala porque el padre usa key={room.id}.
  const [confirming, setConfirming] = useState(false);

  const def = ROOM_DEFS[room.type];
  const Icon = ROOM_ICONS[room.type];
  const upCheck = canUpgradeRoom(state.grid, room.id);
  const upCost = upgradeCost(room);
  const demoCheck = canDemolish(state, room.id);

  return (
    <Panel title={def.name} icon={<Icon size={20} style={{ color: hexColor(def.accent) }} />}>
      <p className="mb-2 text-xs text-pvc/70">{def.description}</p>
      <div className="mb-3 space-y-0.5">
        {def.maxLevel > 1 && <Row label="Nivel" value={`${room.level} / ${def.maxLevel}`} />}
        {def.mergeable && <Row label="Tamaño" value={['Simple', 'Doble', 'Triple'][room.blocks - 1]} />}
        {def.stat && <Row label="Atributo" value={`${PATRON_NAMES[def.stat]} (${def.stat})`} />}
        {def.produces && <Row label="Eficiencia" value={`×${roomEfficiency(room).toFixed(1)}`} />}
        {def.energyDraw > 0 && <Row label="Consumo" value={`${(def.energyDraw * room.blocks * 60).toFixed(1)} energía/min`} />}
        {room.type === 'storage' && (
          <Row
            label="Inventario"
            value={`+${Math.floor(ITEM_CAPACITY_PER_STORAGE_BLOCK * room.blocks * LEVEL_EFFICIENCY[room.level])} plazas`}
          />
        )}
        {room.type === 'barracks' && (
          <Row
            label="Población"
            value={`+${Math.floor(POPULATION_PER_BARRACKS_BLOCK * room.blocks * LEVEL_EFFICIENCY[room.level])} plazas`}
          />
        )}
        <Row label="Piso" value={room.floor} />
      </div>

      <DangerSection room={room} />
      <DoorSection room={room} />
      <ProductionSection room={room} />
      <LivingSection room={room} />
      <TrainingSection room={room} />
      <RadioSection room={room} />
      <CraftingSection room={room} />
      <OverseerSection key={room.id} room={room} />
      {room.type === 'barber' && (
        <p className="mb-3 rounded-lg bg-black/30 p-2 text-xs text-pvc/70">
          Abre la ficha de cualquier habitante para cambiarle piel, color de pelo y peinado.
        </p>
      )}

      <WorkersSection room={room} />

      <div className="flex gap-2">
        {def.maxLevel > 1 && (
          <ActionButton
            tone="primary"
            onClick={() => state.upgradeRoom(room.id)}
            disabled={!upCheck.ok || upCost === null || state.resources.codos < upCost}
            title={upCheck.ok ? undefined : upCheck.reason}
          >
            <ArrowBigUp size={16} />
            {upCost === null ? 'Nivel máx.' : <>Mejorar <Wrench size={12} /> {upCost}</>}
          </ActionButton>
        )}
        {def.demolishable &&
          (confirming ? (
            <ActionButton tone="danger" onClick={() => state.demolishRoom(room.id)}>
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
