import { Baby, Bandage, FlaskConical, Heart, Skull, Smile, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { CHILDHOOD_SECONDS, COURTSHIP_SECONDS, PREGNANCY_SECONDS, ROOM_DEFS } from '../core/config';
import { effectiveMaxHp, isAdult, PATRON_KEYS, PATRON_NAMES, xpToNextLevel } from '../core/Dwellers';
import { effectiveStat } from '../core/Equipment';
import { canApplyMed } from '../core/Health';
import { canRevive, reviveCost } from '../core/Revival';
import { useGameStore } from '../store/useGameStore';
import { BarberSection } from './BarberSection';
import { EquipmentSection } from './EquipmentSection';
import { HealthBar } from './HealthBar';

function Meter({ value, max, color, label }: { value: number; max: number; color: string; label: ReactNode }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-pvc/70">{label}</div>
      <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-black/60">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color }} />
      </div>
    </div>
  );
}

/** Ficha del habitante con sus barras P.A.T.R.O.N. */
export function PatronModal() {
  const id = useGameStore((s) => s.dwellerModalId);
  const dweller = useGameStore((s) => (s.dwellerModalId ? s.dwellers[s.dwellerModalId] : undefined));
  const rooms = useGameStore((s) => s.grid.rooms);
  const dwellers = useGameStore((s) => s.dwellers);
  const close = useGameStore((s) => s.openDweller);
  const heal = useGameStore((s) => s.heal);
  const revive = useGameStore((s) => s.revive);
  const expel = useGameStore((s) => s.expel);
  const meds = useGameStore((s) => s.resources);
  const game = useGameStore();
  const select = useGameStore((s) => s.select);

  if (!id || !dweller) return null;
  const room = dweller.roomId ? rooms[dweller.roomId] : undefined;
  const nextXp = xpToNextLevel(dweller.level);
  const adult = isAdult(dweller);
  const partner = dweller.courtship ? dwellers[dweller.courtship.partnerId] : undefined;

  return (
    <div className="pointer-events-auto absolute inset-0 grid place-items-center bg-black/50 p-4" onClick={() => close(null)}>
      <section
        role="dialog"
        aria-label={`Ficha de ${dweller.name}`}
        className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-xl border-2 border-bunker-600 bg-bunker-800 p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-3 flex items-start gap-2">
          <div className="flex-1">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              {!dweller.alive && <Skull size={18} className="text-red-400" />}
              {dweller.name}
            </h2>
            <p className="text-xs text-pvc/60">
              {dweller.sex === 'M' ? 'Hombre' : 'Mujer'} · Nivel {dweller.level}
              {room ? ` · ${ROOM_DEFS[room.type].name}` : dweller.alive ? ' · Sin asignar' : ' · Fallecido'}
            </p>
          </div>
          <button type="button" aria-label="Cerrar" onClick={() => close(null)} className="rounded p-1 hover:bg-bunker-600">
            <X size={18} />
          </button>
        </header>

        {!dweller.alive && (
          <div className="mb-3 space-y-2 rounded-lg border border-red-500/60 bg-red-950/50 p-2">
            <p className="text-xs text-red-200">Ha muerto. Puedes revivirlo pagando Codos o expulsarlo definitivamente.</p>
            <div className="flex gap-2">
              {(() => {
                const check = canRevive(game, dweller.id);
                return (
                  <button
                    type="button"
                    onClick={() => revive(dweller.id)}
                    disabled={!check.ok}
                    title={check.ok ? undefined : check.reason}
                    className="flex-1 rounded-lg border-2 border-emerald-400/70 py-1.5 text-sm font-bold hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Revivir ({reviveCost(dweller)} Codos)
                  </button>
                );
              })()}
              <button
                type="button"
                onClick={() => expel(dweller.id)}
                className="flex-1 rounded-lg border-2 border-red-400/70 py-1.5 text-sm font-bold hover:bg-red-500/20"
              >
                Expulsar
              </button>
            </div>
          </div>
        )}

        {dweller.alive && (
          <div className="mb-3 space-y-2">
            <div>
              <div className="flex justify-between text-xs text-pvc/70">
                <span>Salud</span>
                <span className="tabular-nums">
                  {Math.ceil(dweller.hp)} / {Math.round(effectiveMaxHp(dweller))}
                  {dweller.intox >= 1 && <span className="text-red-400"> (−{Math.round(dweller.intox)} intox.)</span>}
                </span>
              </div>
              <HealthBar dweller={dweller} className="mt-0.5 h-2" />
            </div>
            <Meter
              value={dweller.xp}
              max={Number.isFinite(nextXp) ? nextXp : 1}
              color="#6ec6ff"
              label={
                <>
                  <span>Experiencia</span>
                  <span className="tabular-nums">
                    {Number.isFinite(nextXp) ? `${Math.floor(dweller.xp)} / ${nextXp}` : 'Nivel máximo'}
                  </span>
                </>
              }
            />
            <Meter
              value={dweller.happiness}
              max={100}
              color="#f2c94c"
              label={
                <>
                  <span className="flex items-center gap-1">
                    <Smile size={12} /> Felicidad
                  </span>
                  <span className="tabular-nums">{Math.round(dweller.happiness)}%</span>
                </>
              }
            />
          </div>
        )}

        {dweller.alive && (
          <div className="mb-3 flex gap-2">
            {(
              [
                { med: 'stimpaks', label: 'Venda', Icon: Bandage, color: 'border-red-400/70 hover:bg-red-500/20' },
                { med: 'radaways', label: 'Desintoxicante', Icon: FlaskConical, color: 'border-orange-400/70 hover:bg-orange-500/20' },
              ] as const
            ).map(({ med, label, Icon, color }) => {
              const check = canApplyMed(game, dweller.id, med);
              return (
                <button
                  key={med}
                  type="button"
                  onClick={() => heal(dweller.id, med)}
                  disabled={!check.ok}
                  title={check.ok ? undefined : check.reason}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border-2 py-1.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40 ${color}`}
                >
                  <Icon size={14} /> {label} ({meds[med]})
                </button>
              );
            })}
          </div>
        )}

        {/* Estados del ciclo de vida */}

        <div className="mb-3 space-y-2">
          {!adult && (
            <Meter
              value={CHILDHOOD_SECONDS - dweller.childTime}
              max={CHILDHOOD_SECONDS}
              color="#7ee08a"
              label={
                <>
                  <span className="flex items-center gap-1">
                    <Baby size={12} /> Niño: aún no puede trabajar
                  </span>
                  <span className="tabular-nums">{Math.ceil(dweller.childTime)} s</span>
                </>
              }
            />
          )}
          {dweller.pregnancy && (
            <Meter
              value={dweller.pregnancy.elapsed}
              max={PREGNANCY_SECONDS}
              color="#ff9ecf"
              label={
                <>
                  <span className="flex items-center gap-1">
                    <Baby size={12} /> Embarazada (huirá de los incidentes)
                  </span>
                  <span className="tabular-nums">
                    {dweller.pregnancy.elapsed >= PREGNANCY_SECONDS
                      ? 'Esperando sitio'
                      : `${Math.ceil(PREGNANCY_SECONDS - dweller.pregnancy.elapsed)} s`}
                  </span>
                </>
              }
            />
          )}
          {dweller.courtship && (
            <Meter
              value={dweller.courtship.progress}
              max={COURTSHIP_SECONDS}
              color="#ff6b8a"
              label={
                <span className="flex items-center gap-1">
                  <Heart size={12} /> Cortejo con {partner?.name ?? '…'}
                </span>
              }
            />
          )}
        </div>

        <EquipmentSection dweller={dweller} />

        <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-pvc/50">P.A.T.R.O.N.</h3>
        <ul className="mb-3 space-y-1">
          {PATRON_KEYS.map((k) => {
            const base = dweller.stats[k];
            const bonus = effectiveStat(dweller, k) - base;
            return (
              <li key={k} className="flex items-center gap-2 text-sm">
                <b className="w-4 text-tape">{k}</b>
                <span className="w-20 text-xs text-pvc/70">{PATRON_NAMES[k]}</span>
                <div className="flex flex-1 gap-0.5" aria-label={`${PATRON_NAMES[k]} ${base} de 10${bonus ? `, +${bonus} por atuendo` : ''}`}>
                  {Array.from({ length: 10 }, (_, i) => (
                    <span
                      key={i}
                      className={`h-3 flex-1 rounded-sm ${i < base ? 'bg-tape' : i < base + bonus ? 'bg-emerald-400' : 'bg-black/50'}`}
                    />
                  ))}
                </div>
                <span className="w-9 text-right tabular-nums">
                  {base}
                  {bonus > 0 && <span className="text-emerald-300">+{bonus}</span>}
                </span>
              </li>
            );
          })}
        </ul>

        <BarberSection key={dweller.id} dweller={dweller} />

        {room && (
          <button
            type="button"
            onClick={() => {
              select({ kind: 'room', id: room.id });
              close(null);
            }}
            className="mt-3 w-full rounded-lg border-2 border-bunker-600 py-1.5 text-sm font-bold hover:border-tape"
          >
            Ir a su sala
          </button>
        )}
      </section>
    </div>
  );
}
