import { SIM_STEP } from './Simulation';

/** Máximo de tiempo real que se recupera de golpe (p. ej. tras volver a una pestaña dormida). */
const MAX_CATCHUP_SECONDS = 60;

/**
 * Reloj maestro: mide el tiempo real transcurrido y lo entrega en múltiplos de
 * SIM_STEP. Usa setInterval y no requestAnimationFrame para que la economía siga
 * corriendo (más lento) con la pestaña en segundo plano. Ausencias largas las
 * resolverá el cálculo offline del Sprint 8.
 */
export class GameLoop {
  private readonly onTick: (seconds: number) => void;
  private readonly now: () => number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private last = 0;
  private pending = 0;

  constructor(onTick: (seconds: number) => void, now: () => number = () => performance.now()) {
    this.onTick = onTick;
    this.now = now;
  }

  start(): void {
    if (this.timer !== null) return;
    this.last = this.now();
    this.pending = 0;
    this.timer = setInterval(() => this.frame(), SIM_STEP * 1000);
  }

  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  /** Público para poder testearlo sin temporizadores reales. */
  frame(): void {
    const now = this.now();
    this.pending += Math.min((now - this.last) / 1000, MAX_CATCHUP_SECONDS);
    this.last = now;
    const steps = Math.floor(this.pending / SIM_STEP);
    if (steps === 0) return;
    const seconds = steps * SIM_STEP;
    this.pending -= seconds;
    this.onTick(seconds);
  }
}
