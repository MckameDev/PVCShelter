import type { SaveEnvelope } from '../core/SaveFormat';

// Guardado del modo invitado en el navegador. localStorage puede no estar
// disponible (modo privado, almacenamiento bloqueado o lleno): toda lectura y
// escritura va protegida y el juego sigue funcionando sin él.

const KEY = 'pvc-shelter:guest-save';

interface LocalSave {
  envelope: unknown;
  /** Milisegundos (reloj del dispositivo) del último guardado. */
  savedAt: number;
}

export function loadLocalSave(): LocalSave | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || !('savedAt' in parsed) || typeof parsed.savedAt !== 'number') return null;
    return parsed as LocalSave;
  } catch {
    return null;
  }
}

/** Devuelve false si no se pudo guardar (sin almacenamiento o lleno). */
export function saveLocal(envelope: SaveEnvelope): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify({ envelope, savedAt: Date.now() } satisfies LocalSave));
    return true;
  } catch {
    return false;
  }
}

export function clearLocalSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Sin almacenamiento: no hay nada que borrar.
  }
}
