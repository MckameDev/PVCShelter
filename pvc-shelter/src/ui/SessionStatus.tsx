import { Cloud, CloudCheck, CloudOff, HardDrive, LogOut, RefreshCw } from 'lucide-react';
import { useSessionStore } from '../store/useSessionStore';

/** Estado del guardado (nube o navegador) y botón para cerrar sesión. */
export function SessionStatus() {
  const { mode, user, saveStatus, saveError, lastSavedAt, saveNow, logout } = useSessionStore();
  const cloud = mode === 'cloud';
  const Icon =
    saveStatus === 'error' || saveStatus === 'conflict' ? CloudOff : saveStatus === 'saving' ? RefreshCw : cloud ? (saveStatus === 'saved' ? CloudCheck : Cloud) : HardDrive;
  const when = lastSavedAt ? new Date(lastSavedAt).toLocaleTimeString() : 'aún no';
  const title = saveError ?? `${cloud ? `Cuenta: ${user?.username}` : 'Invitado (solo este navegador)'} · Último guardado: ${when}. Pulsa para guardar ya.`;

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => void saveNow()}
        title={title}
        aria-label={title}
        className={`flex items-center gap-1.5 rounded-lg bg-bunker-900/70 px-2.5 py-2 hover:bg-bunker-600 ${saveStatus === 'error' || saveStatus === 'conflict' ? 'text-red-300' : ''}`}
      >
        <Icon size={16} className={saveStatus === 'saving' ? 'animate-spin' : ''} />
        <span className="hidden max-w-24 truncate text-xs md:inline">{cloud ? user?.username : 'Invitado'}</span>
      </button>
      <button
        type="button"
        onClick={() => void logout()}
        title={cloud ? 'Guardar y cerrar sesión' : 'Guardar y salir'}
        aria-label={cloud ? 'Guardar y cerrar sesión' : 'Guardar y salir'}
        className="rounded-lg bg-bunker-900/70 p-2 hover:bg-bunker-600"
      >
        <LogOut size={16} />
      </button>
    </div>
  );
}

/** Aviso cuando otra pestaña o dispositivo guardó después: no se pisa su progreso. */
export function SaveConflictBanner() {
  const saveStatus = useSessionStore((s) => s.saveStatus);
  const saveError = useSessionStore((s) => s.saveError);
  if (saveStatus !== 'conflict') return null;
  return (
    <div role="alert" className="pointer-events-auto absolute top-16 right-16 left-3 rounded-xl border-2 border-amber-500 bg-amber-950/95 p-3 text-sm shadow-2xl sm:left-auto sm:w-96">
      <p className="font-bold">Partida abierta en otro sitio</p>
      <p className="text-xs text-amber-100">
        {saveError} El guardado automático está en pausa para no borrar ese progreso.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-2 w-full rounded-lg border-2 border-amber-400 py-1 text-xs font-bold hover:bg-amber-500/20"
      >
        Recargar con la partida más reciente
      </button>
    </div>
  );
}
