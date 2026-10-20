import { Bandage, Crosshair, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { aliveEnemies, dwellerDps } from '../core/Combat';
import { lootSummary } from '../core/Loot';
import { questById } from '../core/questCatalog';
import { squadMembers } from '../core/Quests';
import { useGameStore } from '../store/useGameStore';
import { AimMinigame } from './AimMinigame';
import { formatDuration } from './format';
import { HealthBar } from './HealthBar';

const TONE_CLASS = { info: 'text-pvc/70', good: 'text-emerald-300', bad: 'text-red-300' } as const;

/** Vista de la misión: salas con niebla de guerra, combate, críticos y botín. */
export function QuestModal() {
  const openId = useGameStore((s) => s.openQuestId);
  // key: el estado del minijuego no se comparte entre misiones.
  return openId ? <QuestView key={openId} openId={openId} /> : null;
}

function QuestView({ openId }: { openId: string }) {
  const game = useGameStore();
  const [aiming, setAiming] = useState(false);
  const quest = game.quests.find((q) => q.id === openId);
  if (!quest) return null;
  const def = questById(quest.questId);
  if (!def) return null;

  const squad = squadMembers(game, quest);
  const enemies = aliveEnemies(quest.enemies);
  const fighting = quest.status === 'exploring' && enemies.length > 0;
  const isLast = quest.roomIndex === def.rooms.length - 1;

  return (
    <div className="pointer-events-auto absolute inset-0 grid place-items-center bg-black/60 p-3" onClick={() => game.openQuest(null)}>
      <section
        role="dialog"
        aria-label={`Misión: ${def.name}`}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-2xl space-y-3 overflow-y-auto rounded-xl border-2 border-sky-700 bg-bunker-800 p-4 shadow-2xl"
      >
        <header className="flex items-start gap-2">
          <div className="flex-1">
            <h2 className="text-lg font-bold">{def.name}</h2>
            <p className="text-xs text-pvc/60">{def.description}</p>
          </div>
          <button type="button" aria-label="Cerrar" onClick={() => game.openQuest(null)} className="rounded p-1 hover:bg-bunker-600">
            <X size={18} />
          </button>
        </header>

        {/* Mapa del edificio con niebla de guerra */}
        <ol className="flex gap-1.5 overflow-x-auto pb-1" aria-label="Salas del edificio">
          {def.rooms.map((r, i) => {
            const current = quest.status === 'exploring' && i === quest.roomIndex;
            const cleared = quest.revealed[i] && (i < quest.roomIndex || quest.status === 'returning' || quest.status === 'done');
            return (
              <li
                key={r.name}
                className={`min-w-24 flex-1 rounded-md border-2 p-1.5 text-center text-xs ${
                  current
                    ? 'border-tape bg-tape/15'
                    : quest.revealed[i]
                      ? 'border-bunker-600 bg-black/30'
                      : 'border-dashed border-bunker-600 bg-black/60 text-pvc/30'
                }`}
              >
                <div className="font-bold">{i + 1}</div>
                <div className="truncate">{quest.revealed[i] ? r.name : '???'}</div>
                {cleared && <div className="text-emerald-300">despejada</div>}
              </li>
            );
          })}
        </ol>

        {(quest.status === 'traveling' || quest.status === 'returning') && (
          <div>
            <div className="flex justify-between text-xs text-pvc/70">
              <span>{quest.status === 'traveling' ? 'De camino al objetivo' : 'Volviendo al búnker'}</span>
              <span className="tabular-nums">{formatDuration(quest.travelLeft)}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/60">
              <div className="h-full bg-sky-400" style={{ width: `${(1 - quest.travelLeft / def.travelSeconds) * 100}%` }} />
            </div>
          </div>
        )}

        {quest.status === 'exploring' && (
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Enemigos y botín de la sala */}
            <div className="space-y-2 rounded-lg bg-black/30 p-2 text-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-pvc/50">{def.rooms[quest.roomIndex].name}</h3>
              {enemies.length === 0 ? (
                <p className="text-xs text-emerald-300">Sala despejada.</p>
              ) : (
                enemies.map((e) => (
                  <div key={e.id}>
                    <div className="flex justify-between text-xs">
                      <span className="text-red-300">{e.name}</span>
                      <span className="tabular-nums text-pvc/60">{Math.ceil(e.hp)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-black/60">
                      <div className="h-full bg-red-400" style={{ width: `${(e.hp / e.maxHp) * 100}%` }} />
                    </div>
                  </div>
                ))
              )}
              {quest.spots.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {quest.spots.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      disabled={fighting}
                      title={fighting ? 'Primero despeja la sala' : 'Recoger'}
                      onClick={() => game.pickQuestLoot(quest.id, s.id)}
                      className="flex animate-pulse items-center gap-1 rounded-md border border-tape/70 bg-tape/15 px-2 py-1 text-xs font-bold text-tape hover:bg-tape/30 disabled:animate-none disabled:opacity-40"
                    >
                      <Sparkles size={12} /> {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Escuadra y crítico manual */}
            <div className="space-y-2 rounded-lg bg-black/30 p-2 text-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-pvc/50">Escuadra</h3>
              {squad.map((d) => (
                <div key={d.id} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between text-xs">
                      <span className={d.alive ? '' : 'text-red-400 line-through'}>{d.name}</span>
                      <span className="text-pvc/50">{d.alive ? `${dwellerDps(d).toFixed(1)} daño/s` : 'caído'}</span>
                    </div>
                    {d.alive && <HealthBar dweller={d} />}
                  </div>
                  {d.alive && (
                    <button
                      type="button"
                      aria-label={`Usar Venda en ${d.name}`}
                      title={`Venda (${game.resources.stimpaks})`}
                      onClick={() => game.healInQuest(quest.id, d.id)}
                      className="rounded border border-red-400/60 p-1 hover:bg-red-500/20"
                    >
                      <Bandage size={12} />
                    </button>
                  )}
                </div>
              ))}
              {fighting && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs text-pvc/70">
                    <span className="flex items-center gap-1">
                      <Crosshair size={12} /> Crítico
                    </span>
                    <span>{quest.critCharge >= 1 ? '¡Listo!' : `${Math.floor(quest.critCharge * 100)}%`}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-black/60">
                    <div className="h-full bg-tape" style={{ width: `${quest.critCharge * 100}%` }} />
                  </div>
                  {aiming && quest.critCharge >= 1 ? (
                    <AimMinigame
                      onShoot={(accuracy) => {
                        game.fireCrit(quest.id, accuracy);
                        setAiming(false);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      disabled={quest.critCharge < 1}
                      onClick={() => setAiming(true)}
                      className="w-full rounded-lg border-2 border-tape/70 py-1.5 font-bold hover:bg-tape/20 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      ¡Crítico!
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {quest.status === 'exploring' && (
          <button
            type="button"
            disabled={fighting}
            onClick={() => game.advanceQuest(quest.id)}
            className="w-full rounded-lg border-2 border-sky-400/70 bg-sky-500/15 py-2 font-bold hover:bg-sky-500/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isLast ? 'Completar misión y volver' : 'Avanzar a la siguiente sala'}
            {quest.spots.length > 0 && !fighting && ` (quedan ${quest.spots.length} botines)`}
          </button>
        )}

        {quest.status === 'done' && (
          <button
            type="button"
            onClick={() => game.finishQuest(quest.id)}

            className="w-full rounded-lg border-2 border-emerald-400/70 bg-emerald-500/15 py-2 font-bold hover:bg-emerald-500/30"
          >
            {quest.failed ? 'Recibir a la escuadra' : `Recibir botín: ${lootSummary(quest.loot)}`}
          </button>
        )}

        <div>
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-pvc/50">
            Botín: {lootSummary(quest.loot)}
          </h3>
          <ol className="max-h-32 space-y-0.5 overflow-y-auto rounded bg-black/30 p-2 text-xs">
            {[...quest.log].reverse().map((entry, i) => (
              <li key={i} className={TONE_CLASS[entry.tone]}>
                {entry.text}
              </li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
}
