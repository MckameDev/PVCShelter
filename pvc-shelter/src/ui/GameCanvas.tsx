import { LocateFixed, Maximize, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { BunkerStage } from '../canvas/BunkerStage';

const CAMERA_CONTROLS = [
  { icon: ZoomIn, label: 'Acercar', run: (s: BunkerStage) => s.zoomBy(1.25) },
  { icon: ZoomOut, label: 'Alejar', run: (s: BunkerStage) => s.zoomBy(0.8) },
  { icon: Maximize, label: 'Ver todo el búnker', run: (s: BunkerStage) => s.fitAll() },
  { icon: LocateFixed, label: 'Ir a la entrada', run: (s: BunkerStage) => s.focusEntrance() },
];

/** Monta la escena Pixi y expone los controles de cámara como botones. */
export function GameCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<BunkerStage | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const stage = new BunkerStage();
    stageRef.current = stage;
    stage.init(host).catch((err: unknown) => {
      console.error('No se pudo iniciar el motor gráfico', err);
    });
    return () => {
      stage.destroy();
      stageRef.current = null;
    };
  }, []);

  const handleControl = (index: number) => {
    const stage = stageRef.current;
    if (stage) CAMERA_CONTROLS[index].run(stage);
  };

  return (
    <div className="absolute inset-0">
      <div ref={hostRef} className="absolute inset-0" />
      <div className="absolute top-16 right-3 flex flex-col gap-2">
        {CAMERA_CONTROLS.map(({ icon: Icon, label }, i) => (
          <button
            key={label}
            type="button"
            title={label}
            aria-label={label}
            onClick={() => handleControl(i)}
            className="grid size-10 place-items-center rounded-lg border-2 border-bunker-600 bg-bunker-800/90 text-pvc shadow-lg hover:border-tape active:scale-95"
          >
            <Icon size={20} />
          </button>
        ))}
      </div>
    </div>
  );
}
