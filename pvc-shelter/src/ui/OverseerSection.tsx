import { CircleCheck, ClipboardList } from 'lucide-react';
import { useState } from 'react';
import { QUEST_SQUAD_SIZE } from '../core/config';
import { isAdult } from '../core/Dwellers';
import { QUESTS, questById } from '../core/questCatalog';
import { canStartQuest } from '../core/Quests';
import type { Room } from '../core/types';
import { useGameStore } from '../store/useGameStore';
import { formatDuration } from './format';

const STATUS_TEXT = {
  traveling: 'De camino',
  exploring: 'Explorando',
  returning: 'Volviendo',
  done: 'De vuelta: recoge el botín',
} as const;

/** Oficina del Capataz: elegir misión, formar escuadra y seguir la misión activa. */
export function OverseerSection({ room }: { room: Room }) {
  const game = useGameStore();
  const [questId, setQuestId] = useState<string | null>(null);
  const [squad, setSquad] = useState<string[]>([]);
  if (room.type !== 'overseer') return null;

  if (game.quest) {
    const def = questById(game.quest.questId);
    return (
      <div className="mb-3 space-y-2 rounded-lg bg-black/30 p-2 text-sm">
        <div className="flex items-center gap-1 font-bold">
          <ClipboardList size={14} /> {def?.name}
        </div>
        <p className="text-xs text-pvc/70">{STATUS_TEXT[game.quest.status]}</p>
        <button
          type="button"
          onClick={() => game.setQuestOpen(true)}
          className="w-full rounded-lg border-2 border-sky-400/70 bg-sky-500/15 py-1.5 font-bold hover:bg-sky-500/30"
        >
          Abrir misión
        </button>
      </div>
    );
  }

  const candidates = Object.values(game.dwellers)
    .filter((d) => d.alive && isAdult(d) && !d.pregnancy && d.location === 'bunker')
    .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
  const toggle = (id: string) =>
    setSquad((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < QUEST_SQUAD_SIZE ? [...prev, id] : prev));
  const check = questId ? canStartQuest(game, questId, squad) : null;

  return (
    <div className="mb-3 space-y-2 rounded-lg bg-black/30 p-2 text-sm">
      <h3 className="text-xs font-bold uppercase tracking-wider text-pvc/50">Misiones</h3>
      <ul className="space-y-1">
        {QUESTS.map((q) => (
          <li key={q.id}>
            <button
              type="button"
              onClick={() => setQuestId(q.id === questId ? null : q.id)}
              aria-pressed={q.id === questId}
              className={`w-full rounded-md border-2 p-1.5 text-left ${q.id === questId ? 'border-sky-400 bg-sky-500/10' : 'border-transparent bg-black/30 hover:border-bunker-600'}`}
            >
              <div className="flex items-center gap-1 font-semibold">
                {game.questsDone.includes(q.id) && <CircleCheck size={14} className="text-emerald-300" aria-label="Completada" />}
                {q.name}
              </div>
              <div className="text-xs text-pvc/60">
                Nivel recomendado {q.recommendedLevel} · {q.rooms.length} salas · viaje {formatDuration(q.travelSeconds)} ·{' '}
                {q.rewardCodos} Codos
              </div>
            </button>
          </li>
        ))}
      </ul>

      {questId && (
        <>
          <p className="text-xs text-pvc/70">{questById(questId)?.description}</p>
          <h3 className="text-xs font-bold uppercase tracking-wider text-pvc/50">
            Escuadra ({squad.length}/{QUEST_SQUAD_SIZE})
          </h3>
          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {candidates.map((d) => (
              <li key={d.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded bg-black/30 px-2 py-1 text-xs">
                  <input type="checkbox" checked={squad.includes(d.id)} onChange={() => toggle(d.id)} />
                  <span className="flex-1">{d.name}</span>
                  <span className="text-pvc/60">Nv {d.level}</span>
                  <span className="text-pvc/60">{d.equipment.weapon ? '⚔' : 'sin arma'}</span>
                </label>
              </li>
            ))}
          </ul>
          {check && !check.ok && squad.length > 0 && <p className="text-xs text-red-300">{check.reason}</p>}
          <button
            type="button"
            disabled={!check?.ok}
            onClick={() => {
              if (game.sendQuest(questId, squad)) setSquad([]);
            }}
            className="w-full rounded-lg border-2 border-emerald-400/70 bg-emerald-500/15 py-1.5 font-bold hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Enviar escuadra
          </button>
        </>
      )}
    </div>
  );
}
