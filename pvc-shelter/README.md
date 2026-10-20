# PVC Shelter

Juego de gestión de búnker en 2D para navegador (React + PixiJS + Zustand). El plan por sprints está en [`../sprints.md`](../sprints.md).

## Scripts

```bash
npm install
npm run dev        # servidor de desarrollo
npm test           # tests de la lógica pura (Vitest)
npm run build      # typecheck + build de producción
npm run lint       # oxlint
```

## Arquitectura

```
src/
├── core/      Lógica pura en TypeScript (sin React ni Pixi). Testeable en aislamiento.
│   ├── types.ts         Tipos serializables (GridState, Room, Rock, Result)
│   ├── config.ts        Definición de salas, dimensiones, costos y constantes de balance
│   ├── GridManager.ts   Construcción, conectividad, fusión, mejora, demolición, rocas
│   ├── Economy.ts       Fórmulas de costos, reembolsos, capacidad y eficiencia
│   └── random.ts        PRNG con semilla (rocas reproducibles)
├── store/     Estado central (Zustand). Orquesta core/ y valida recursos.
├── canvas/    Motor gráfico (PixiJS). Dibuja el estado y traduce la entrada en acciones.
│   ├── BunkerStage.ts   Cámara (paneo, zoom con rueda y pinch) e input
│   ├── RoomSprite.ts    Dibujo procedural de salas y rocas
│   └── TerrainSprite.ts Cielo, superficie y subsuelo
└── ui/        Interfaz React + Tailwind (TopBar, BuildMenu, SelectionPanel, Toast)
```

Reglas de dependencia: `core/` no importa nada del resto; `canvas/` y `ui/` leen el store y despachan acciones, nunca mutan el estado directamente.

## Controles

- **Arrastrar**: mover la cámara. **Rueda / pinch**: zoom. Botones a la derecha: acercar, alejar, ver todo, ir a la entrada.
- **Construir**: elegir una sala en la barra inferior y tocar un hueco verde. `Esc` cancela.
- **Tocar una sala**: ver detalles, mejorar (hasta nivel 3) o demoler.
- **Tocar una roca**: romperla pagando Codos de PVC.
