import { useEffect } from 'react';
import { GameLoop } from './core/GameLoop';
import { useGameStore } from './store/useGameStore';
import { BuildMenu } from './ui/BuildMenu';
import { DwellersPanel } from './ui/DwellersPanel';
import { GameCanvas } from './ui/GameCanvas';
import { InventoryPanel } from './ui/InventoryPanel';
import { PatronModal } from './ui/PatronModal';
import { SelectionPanel } from './ui/SelectionPanel';
import { Toast } from './ui/Toast';
import { TopBar } from './ui/TopBar';

export default function App() {
  // Reloj maestro de la simulación.
  useEffect(() => {
    const loop = new GameLoop((seconds) => useGameStore.getState().tick(seconds));
    loop.start();
    return () => loop.stop();
  }, []);

  // Esc: cierra paneles en orden (ficha, construcción, habitantes, selección).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const { buildType, cancelBuild, dwellersOpen, setDwellersOpen, select, dwellerModalId, openDweller } =
        useGameStore.getState();
      const { inventoryOpen, setInventoryOpen } = useGameStore.getState();
      if (dwellerModalId) openDweller(null);
      else if (inventoryOpen) setInventoryOpen(false);
      else if (buildType) cancelBuild();
      else if (dwellersOpen) setDwellersOpen(false);
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
        <DwellersPanel />
        <InventoryPanel />
        <SelectionPanel />
        <BuildMenu />
        <PatronModal />
      </div>
    </main>
  );
}
