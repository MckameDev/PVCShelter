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
│   ├── Economy.ts       Costos, reembolsos, capacidad, eficiencia y almacenamiento
│   ├── Bunker.ts        Partida nueva y operaciones que arrastran habitantes/temporizadores
│   ├── Dwellers.ts      Habitantes (stats P.A.T.R.O.N., parentesco, niveles, población, asignación)
│   ├── LifeCycle.ts     Niveles, felicidad, cortejo, embarazo, nacimiento, niñez, entrenamiento y radio
│   ├── Health.ts        Uso de curativos (Vendas Caseras y Desintoxicantes)
│   ├── Pathfinding.ts   Rutas entre salas (Dijkstra; ascensores como aristas verticales)
│   ├── Production.ts    Ciclos de producción, recolección y Modo Exprés
│   ├── Simulation.ts    Tick determinista: energía por distancia, consumo, salud, incidentes
│   ├── GameLoop.ts      Reloj maestro (tiempo real → pasos fijos de simulación)
│   └── random.ts        PRNG con semilla (rocas y habitantes reproducibles)
├── store/     Estado central (Zustand). Orquesta core/ y valida recursos.
├── canvas/    Motor gráfico (PixiJS). Dibuja el estado y traduce la entrada en acciones.
│   ├── BunkerStage.ts   Cámara (paneo, zoom con rueda y pinch) e input
│   ├── RoomSprite.ts    Dibujo procedural de salas y rocas
│   ├── StatusSprite.ts  Progreso, iconos de recolección, apagones e incidentes (cada frame)
│   ├── DwellerSprite.ts Habitantes: dibujo, caminata por waypoints y arrastre
│   └── TerrainSprite.ts Cielo, superficie y subsuelo
└── ui/        Interfaz React + Tailwind (TopBar, BuildMenu, SelectionPanel, DwellersPanel, PatronModal, Toast)
```

Reglas de dependencia: `core/` no importa nada del resto; `canvas/` y `ui/` leen el store y despachan acciones, nunca mutan el estado directamente.

La simulación (`Simulation.simulate`) es pura y no usa RNG ni reloj: el mismo estado y el mismo `dt` dan siempre el mismo resultado. La aleatoriedad solo entra en acciones del jugador (recolectar, Exprés) a través de un `Rng` inyectado; los nacimientos usan un RNG derivado del propio estado, así que también son reproducibles.

El movimiento de los habitantes es solo visual (`canvas/DwellerSprite`): una asignación cuenta para la producción al instante y el habitante camina hasta su sala con la ruta de `core/Pathfinding`. Así el guardado no depende de posiciones en pantalla.

## Depuración

En desarrollo (`npm run dev`) el store está disponible en la consola como `window.__pvcStore` (por ejemplo `__pvcStore.getState()`). No existe en el build de producción.

## Controles

- **Arrastrar**: mover la cámara. **Rueda / pinch**: zoom. Botones a la derecha: acercar, alejar, ver todo, ir a la entrada.
- **Construir**: elegir una sala en la barra inferior y tocar un hueco verde. `Esc` cancela.
- **Tocar una sala**: ver detalles, mejorar (hasta nivel 3) o demoler.
- **Tocar una roca**: romperla pagando Codos de PVC.
- **Habitantes**: arrastrarlos a otra sala (verde = válida, rojo = no). Tocar uno abre su ficha P.A.T.R.O.N. También se asignan desde el panel de la sala; el botón de población abre la lista completa.
- **Progresión**: las salas se desbloquean por población (pestañas del menú de construcción). Enfermería y Planta Depuradora producen curativos que se usan desde la ficha del habitante; las salas de entrenamiento suben un stat hasta 10; Almacenes y Barracones amplían inventario y población; la radio sube la felicidad y atrae gente.
- **Reproducción**: un hombre y una mujer adultos sin parentesco en una Sala de Descanso se cortejan; luego vienen embarazo, nacimiento y niñez (los niños comen pero no trabajan).
- **Producción**: tocar el icono flotante recolecta todas las salas listas de ese recurso. **Exprés** produce al instante con un % de fallo; si falla, provoca un incidente.
