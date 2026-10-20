import { LogIn, UserPlus, UserRound } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useSessionStore } from '../store/useSessionStore';

const USERNAME_RE = /^[A-Za-z0-9_]{3,24}$/;

/** Validación en el cliente (el servidor vuelve a validar todo). */
function validate(mode: 'login' | 'register', username: string, password: string, confirm: string): string | null {
  if (mode === 'login') return username && password ? null : 'Escribe tu usuario y contraseña.';
  if (!USERNAME_RE.test(username)) return 'El usuario debe tener de 3 a 24 caracteres: letras, números o guion bajo.';
  const bytes = new TextEncoder().encode(password).length;
  if (bytes < 8 || bytes > 72) return 'La contraseña debe tener entre 8 y 72 caracteres.';
  if (password.toLowerCase() === username.toLowerCase()) return 'La contraseña no puede ser igual al usuario.';
  if (password !== confirm) return 'Las contraseñas no coinciden.';
  return null;
}

/** Inicio de sesión, registro o juego como invitado. */
export function AuthScreen() {
  const { login, register, playGuest, busy, authError } = useSessionStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const error = validate(mode, username.trim(), password, confirm);
    setLocalError(error);
    if (error) return;
    void (mode === 'login' ? login(username.trim(), password) : register(username.trim(), password));
  };

  const error = localError ?? authError;
  const field =
    'w-full rounded-lg border-2 border-bunker-600 bg-bunker-900 px-3 py-2 text-pvc outline-none focus:border-tape';

  return (
    <main className="grid min-h-full place-items-center bg-bunker-900 p-4">
      <section className="w-full max-w-sm space-y-4 rounded-2xl border-2 border-bunker-600 bg-bunker-800 p-6 shadow-2xl">
        <header className="text-center">
          <h1 className="text-3xl font-black tracking-wider text-tape">PVC SHELTER</h1>
          <p className="text-sm text-pvc/60">Tu búnker de tubos, lonas y cinta americana.</p>
        </header>

        <div role="tablist" className="grid grid-cols-2 gap-1 rounded-lg bg-black/30 p-1">
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                setLocalError(null);
              }}
              className={`rounded-md py-1.5 text-sm font-bold ${mode === m ? 'bg-bunker-600 text-tape' : 'text-pvc/60 hover:text-pvc'}`}
            >
              {m === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3" noValidate>
          <label className="block space-y-1 text-sm">
            <span className="text-pvc/70">Usuario</span>
            <input
              className={field}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              maxLength={24}
              required
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-pvc/70">Contraseña</span>
            <input
              className={field}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              maxLength={72}
              required
            />
          </label>
          {mode === 'register' && (
            <label className="block space-y-1 text-sm">
              <span className="text-pvc/70">Repite la contraseña</span>
              <input
                className={field}
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                maxLength={72}
                required
              />
            </label>
          )}
          {error && (
            <p role="alert" className="rounded-md border border-red-500/60 bg-red-950/60 p-2 text-sm text-red-200">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-tape bg-tape/20 py-2 font-bold hover:bg-tape/35 disabled:opacity-50"
          >
            {mode === 'login' ? <LogIn size={18} /> : <UserPlus size={18} />}
            {busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta y jugar'}
          </button>
        </form>

        <div className="border-t border-bunker-600 pt-3">
          <button
            type="button"
            onClick={playGuest}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-bunker-600 py-2 text-sm font-bold hover:border-pvc/50 disabled:opacity-50"
          >
            <UserRound size={16} /> Jugar sin cuenta
          </button>
          <p className="mt-1 text-center text-xs text-pvc/50">Como invitado la partida solo se guarda en este navegador.</p>
        </div>
      </section>
    </main>
  );
}
