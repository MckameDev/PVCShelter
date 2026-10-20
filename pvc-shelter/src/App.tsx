import { useEffect } from 'react';
import { useGameStore } from './store/useGameStore';
import { BuildMenu } from './ui/BuildMenu';
import { GameCanvas } from './ui/GameCanvas';
import { SelectionPanel } from './ui/SelectionPanel';
import { Toast } from './ui/Toast';
import { TopBar } from './ui/TopBar';

export default function App() {
  // Esc: primero cancela la construcción, luego la selección.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const { buildType, cancelBuild, select } = useGameStore.getState();
      if (buildType) cancelBuild();
      else select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <main className="relative h-full w-full select-none">
      <GameCanvas />
      {/* La capa de UI no captura eventos salvo en sus paneles, para no bloquear la cámara. */}
      <div className="pointer-events-none absolute inset-0">
        <TopBar />
        <Toast />
        <SelectionPanel />
        <BuildMenu />
      </div>
    </main>
  );
}
