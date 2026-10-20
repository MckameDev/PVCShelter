import { create } from 'zustand';
import { computeOffline } from '../core/OfflineCalc';
import { parseSave, serializeGame } from '../core/SaveFormat';
import { api, ApiError } from '../services/api';
import type { ApiUser } from '../services/api';
import { loadLocalSave, saveLocal } from '../services/localSave';
import { selectGameData, useGameStore } from './useGameStore';

// Sesión y persistencia: cuenta en la nube (API PHP + MySQL) o modo invitado
// (solo en este navegador). Al cargar se aplica el progreso offline; luego el
// juego se autoguarda periódicamente (ver App).

export type SessionMode = 'checking' | 'auth' | 'cloud' | 'guest';
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';

interface SessionState {
  mode: SessionMode;
  user: ApiUser | null;
  /** Error para la pantalla de acceso. */
  authError: string | null;
  busy: boolean;
  /** Versión de la partida en la nube sobre la que trabajamos (bloqueo optimista). */
  version: number | null;
  saveStatus: SaveStatus;
  saveError: string | null;
  lastSavedAt: number | null;

  init: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  playGuest: () => void;
  logout: () => Promise<void>;
  saveNow: () => Promise<void>;
}

const messageOf = (err: unknown) => (err instanceof ApiError ? err.message : 'Algo salió mal. Inténtalo de nuevo.');

/** Carga una partida con el progreso offline aplicado, o empieza una nueva. */
function startFrom(raw: unknown | null, absentSeconds: number): string | null {
  const game = useGameStore.getState();
  if (raw === null) {
    game.newGame();
    return null;
  }
  const parsed = parseSave(raw);
  if (!parsed.ok) return parsed.reason;
  const offline = computeOffline(parsed.value, absentSeconds);
  game.loadGame(offline ? offline.data : parsed.value, offline?.summary ?? null);
  return null;
}

export const useSessionStore = create<SessionState>()((set, get) => {
  async function loadCloud(user: ApiUser): Promise<void> {
    const { save, serverNow } = await api.loadSave();
    // El tiempo de ausencia se mide con el reloj del servidor (no se puede adelantar el reloj del PC).
    const error = startFrom(save?.data ?? null, save ? serverNow - save.savedAt : 0);
    if (error) {
      set({ mode: 'auth', user: null, authError: error, busy: false });
      return;
    }
    set({ mode: 'cloud', user, version: save?.version ?? null, saveStatus: 'idle', saveError: null, authError: null, busy: false });
  }

  async function enter(action: () => Promise<ApiUser | null>): Promise<void> {
    set({ busy: true, authError: null });
    try {
      const user = await action();
      if (!user) throw new ApiError(401, 'No se pudo iniciar sesión.');
      await loadCloud(user);
    } catch (err) {
      set({ busy: false, authError: messageOf(err) });
    }
  }

  return {
    mode: 'checking',
    user: null,
    authError: null,
    busy: false,
    version: null,
    saveStatus: 'idle',
    saveError: null,
    lastSavedAt: null,

    init: async () => {
      try {
        const user = await api.session();
        if (user) await loadCloud(user);
        else set({ mode: 'auth' });
      } catch (err) {
        // Sin servidor (p. ej. desarrollo sin PHP) se puede jugar como invitado.
        set({ mode: 'auth', authError: messageOf(err) });
      }
    },

    login: (username, password) => enter(() => api.login(username, password)),
    register: (username, password) => enter(() => api.register(username, password)),

    playGuest: () => {
      const local = loadLocalSave();
      const error = startFrom(local?.envelope ?? null, local ? (Date.now() - local.savedAt) / 1000 : 0);
      if (error) {
        // Partida local dañada: se empieza de cero en lugar de bloquear el juego.
        useGameStore.getState().newGame();
      }
      set({ mode: 'guest', user: null, version: null, saveStatus: 'idle', authError: error });
    },

    logout: async () => {
      await get().saveNow();
      try {
        if (get().mode === 'cloud') await api.logout();
      } catch {
        // Si falla el cierre en el servidor, igualmente se sale localmente.
      }
      useGameStore.getState().newGame();
      set({ mode: 'auth', user: null, version: null, saveStatus: 'idle', saveError: null, lastSavedAt: null });
      // Token CSRF nuevo para la próxima sesión.
      api.session().catch(() => undefined);
    },

    saveNow: async () => {
      const { mode, saveStatus, version } = get();
      if (mode !== 'cloud' && mode !== 'guest') return;
      if (saveStatus === 'saving' || saveStatus === 'conflict') return;
      const envelope = serializeGame(selectGameData(useGameStore.getState()));

      if (mode === 'guest') {
        const okLocal = saveLocal(envelope);
        set(okLocal ? { saveStatus: 'saved', lastSavedAt: Date.now(), saveError: null } : { saveStatus: 'error', saveError: 'Este navegador no permite guardar.' });
        return;
      }

      set({ saveStatus: 'saving' });
      try {
        const res = await api.putSave(envelope, version);
        set({ version: res.version, saveStatus: 'saved', lastSavedAt: Date.now(), saveError: null });
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          // Otra pestaña/dispositivo guardó después: no se pisa su progreso.
          set({ saveStatus: 'conflict', saveError: err.message });
        } else if (err instanceof ApiError && err.status === 401) {
          set({ mode: 'auth', user: null, saveStatus: 'error', authError: 'Tu sesión caducó. Vuelve a iniciar sesión.' });
        } else {
          set({ saveStatus: 'error', saveError: messageOf(err) });
        }
      }
    },
  };
});
