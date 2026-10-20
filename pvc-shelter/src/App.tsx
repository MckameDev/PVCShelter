import { useEffect } from 'react';
import { GameLoop } from './core/GameLoop';
import { useGameStore } from './store/useGameStore';
import { BuildMenu } from './ui/BuildMenu';
import { DwellersPanel } from './ui/DwellersPanel';
import { GameCanvas } from './ui/GameCanvas';
import { ExpeditionDialog } from './ui/ExpeditionDialog';
import { InventoryPanel } from './ui/InventoryPanel';
import { QuestModal } from './ui/QuestModal';
import { WastelandPanel } from './ui/WastelandPanel';
import { PatronModal } from './ui/PatronModal';
import { RaidBanner } from './ui/RaidBanner';
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
      const { inventoryOpen, setInventoryOpen, openQuestId, openQuest, expeditionDraft, setExpeditionDraft } =
        useGameStore.getState();
      const { wastelandOpen, setWastelandOpen } = useGameStore.getState();
      if (expeditionDraft) setExpeditionDraft(null);
      else if (openQuestId) openQuest(null);
      else if (dwellerModalId) openDweller(null);
      else if (wastelandOpen) setWastelandOpen(false);
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
        <RaidBanner />
        <Toast />
        <DwellersPanel />
        <InventoryPanel />
        <WastelandPanel />
        <SelectionPanel />
        <BuildMenu />
        <PatronModal />
        <QuestModal />
        <ExpeditionDialog />
      </div>
    </main>
  );
}
