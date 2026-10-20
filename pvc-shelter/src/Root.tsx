import { useEffect } from 'react';
import App from './App';
import { useSessionStore } from './store/useSessionStore';
import { AuthScreen } from './ui/AuthScreen';

/** Decide qué mostrar: comprobando sesión, acceso, o el juego (cuenta o invitado). */
export default function Root() {
  const mode = useSessionStore((s) => s.mode);
  const init = useSessionStore((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  if (mode === 'checking') {
    return (
      <main className="grid h-full place-items-center bg-bunker-900 text-pvc/70" aria-busy="true">
        Abriendo la compuerta del búnker…
      </main>
    );
  }
  if (mode === 'auth') return <AuthScreen />;
  return <App />;
}
