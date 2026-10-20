# PROYECTO: PVC SHELTER (Clon Web de Fallout Shelter)

Actúa como un Arquitecto de Software Senior y Desarrollador de Videojuegos Web. Vamos a desarrollar **PVC Shelter**, un juego de gestión de refugios subterráneos en 2D para navegador (estilo Fallout Shelter), con autenticación de usuarios y guardado en la nube.

## 1. CONTEXTO Y REGLAS DEL UNIVERSO
* **Temática:** Un búnker subterráneo precario construido con tubos de PVC, lonas, bidones reciclados y cinta americana.
* **Moneda:** "Codos de PVC" (equivalente a las Chapas/Caps) y "Rollos de Cinta" (equivalente a Nuka-Cola Quantum para acelerar procesos).
* **Estadísticas de Habitantes (Sistema P.A.T.R.O.N.):** Cada habitante tiene 6 atributos del 1 al 10:
  * **P - Poderío (Fuerza):** Para salas de Energía (Generadores a pedales).
  * **A - Astucia (Agilidad):** Para salas de Comida (Cultivos hidropónicos en tubos).
  * **T - Tenacidad (Resistencia):** Determina los puntos de vida (HP) al subir de nivel, resistencia a intoxicaciones y sirve para salas de Fabricación/Almacén.
  * **R - Rebusque (Suerte/Ingenio):** Aumenta la probabilidad de encontrar "Codos de PVC" al recolectar recursos y mejora el botín en el exterior.
  * **O - Optimismo (Carisma):** Para la Sala de Descanso (reproducción), Radio casera y comercio.
  * **N - Ñeque (Valentía/Percepción):** Para salas de Agua (Filtros de bidones) y eficacia en combate/exploración.

---

## 2. PLAN DE DESARROLLO POR SPRINTS (TODAS LAS MECÁNICAS)

Por favor, confirma que entiendes esta arquitectura. Trabajaremos **un Sprint a la vez**. Cuando te pida iniciar un Sprint, genera el código modular, limpio y funcional correspondiente.

### SPRINT 1: Core Grid, Cámara, Construcción y Fusión de Salas
1. **Cuadrícula Subterránea (Grid):** Sistema basado en celdas (pisos hacia abajo y columnas a los lados).
2. **Rocas obstáculo:** Generación aleatoria de rocas en el subsuelo que cuestan "Codos de PVC" para ser destruidas antes de construir.
3. **Reglas de Construcción:**
   * Puerta del Búnker fija en el Nivel 0 (arriba a la izquierda).
   * Toda sala nueva debe estar conectada a una sala existente o a un ascensor.
   * Los ascensores conectan pisos verticalmente sin costo de energía.
4. **Fusión de Salas (Merge):** Si se construyen 2 o 3 salas del mismo tipo y mismo nivel juntas horizontalmente, se fusionan automáticamente en una sala doble o triple (mayor capacidad de trabajadores y mayor eficiencia).
5. **Mejora (Upgrade) y Demolición:** Cada sala se puede mejorar hasta Nivel 3. Solo se puede demoler una sala si no deja a otras salas desconectadas de la entrada.
6. **Controles de Cámara:** Panorámica (arrastrar) y Zoom (acercar/alejar para ver todo el búnker o el detalle de una sala).

### SPRINT 2: Economía de Recursos, Consumo y Modo "Exprés" (Rush)
1. **Los 3 Recursos Vitales:**
   * **Energía:** Si baja del mínimo requerido, las salas más lejanas al generador se apagan (dejan de funcionar).
   * **Agua:** Si escasea, los habitantes sufren intoxicación/contaminación (barra roja que reduce el HP máximo).
   * **Comida:** Si escasea, los habitantes pierden vida (HP) gradualmente.
2. **Ciclos de Producción:** Temporizadores por sala. El tiempo se reduce según la suma del atributo P.A.T.R.O.N. correspondiente de los habitantes asignados. Al completarse, aparece un icono flotante para recolectar (y probabilidad de ganar Codos de PVC según el atributo **R**).
3. **Modo Exprés (Rush):** Botón para forzar la producción inmediata de una sala.
   * Tiene un % de fallo basado en los atributos **R** (Rebusque) y el atributo de la sala. Cada uso consecutivo aumenta el % de fallo.
   * Si tiene éxito: da recursos + Codos de PVC + XP.
   * Si falla: provoca un incidente inmediato en esa sala.

### SPRINT 3: Habitantes (Dwellers), Pathfinding y Ciclo de Vida
1. **Movimiento y Drag & Drop:** Arrastrar habitantes con el ratón/dedo de una sala a otra.
2. **Algoritmo de Pathfinding:** El habitante debe caminar hacia el ascensor más cercano, bajar/subir al piso destino y entrar en la sala asignada.
3. **Límite de Capacidad por Sala:** Salas de 1 bloque = máx 2 habitantes; 2 bloques = máx 4; 3 bloques = máx 6.
4. **Niveles y Felicidad:** Trabajar en la sala adecuada sube XP (Nivel 1 al 50, da Codos de PVC al subir). La felicidad global (0-100%) da un bono al tiempo de producción.
5. **Reproducción y Crecimiento:**
   * Asignar 1 hombre y 1 mujer a la "Sala de Descanso". La velocidad de cortejo depende del atributo **O** (Optimismo).
   * Estado de Embarazo: Las embarazadas pueden trabajar, pero huyen ante cualquier incidente/combate.
   * Nacimiento y Niñez: El niño consume recursos y camina por el búnker sin poder trabajar durante un tiempo determinado hasta volverse adulto.

### SPRINT 4: Progresión, Salas de Entrenamiento, Salud y Radio
1. **Desbloqueo por Población:** Las salas se desbloquean según el número total de habitantes (ej. 12 habs = Enfermería; 24 habs = Gimnasio de Poderío).
2. **Salas de Entrenamiento P.A.T.R.O.N.:** 6 salas distintas (una por cada letra del acrónimo) donde los habitantes entrenan con temporizador para subir sus estadísticas hasta 10.
3. **Salud y Curación:**
   * **Enfermería:** Produce "Vendas Caseras" (Stimpaks) para curar HP.
   * **Planta Depuradora:** Produce "Desintoxicantes" (RadAway) para curar el daño por agua sucia/radiación.
4. **Almacenes y Barracones:** Salas pasivas que aumentan el límite máximo de inventario y el límite máximo de población (hasta 200 habitantes).
5. **Antena de Radio Casera:** Sube la felicidad global y tiene un temporizador con probabilidad de atraer nuevos habitantes desde el exterior (escala con **O**).

### SPRINT 5: Inventario, Equipamiento, Mascotas y Fabricación (Crafting)
1. **Ranuras de Habitante:** Cada habitante tiene 3 slots:
   * **Arma:** Define el daño por segundo (ej. Tubo de plomo, Pistola de clavos).
   * **Atuendo (Ropa):** Suma puntos adicionales a las estadísticas P.A.T.R.O.N. (puede superar el límite de 10).
   * **Mascota:** Da bonos pasivos (ej. Loro reciclador: +15% velocidad de producción).
2. **Chatarra (Junk) y Taller de Bricolaje:**
   * Posibilidad de desguazar armas/atuendos sobrantes para obtener chatarra (Común, Rara, Legendaria).
   * Salas de Taller para fabricar armas y ropa usando "Planos/Recetas" + Chatarra + Codos de PVC.
3. **Peluquería/Estética:** Sala para personalizar la apariencia de los habitantes.

### SPRINT 6: Incidentes Internos, Asaltos y Sistema de Combate
1. **Incidentes Internos (por fallo de Rush o aleatorios):**
   * *Fugas de gas / Incendios:* Dañan a los habitantes y drenan energía.
   * *Plagas (Cucarachas/Ratas mutantes/Topos):* Drenan energía/recursos y atacan.
   * **Propagación:** Si una sala está vacía o los habitantes mueren/huyen, el incidente se propaga a las salas adyacentes (arriba, abajo, lados).
2. **Asaltos Externos (Enemigos en la Puerta):**
   * Saqueadores, Perros salvajes o Mutantes pesados que rompen la Puerta del Búnker (la puerta se puede mejorar para resistir más tiempo).
   * Una vez dentro, recorren el búnker sala por sala, piso por piso, robando recursos hasta ser eliminados.
3. **Resolución de Combate:** El daño recibido se reparte entre los habitantes de la sala y el daño infligido es la suma del daño de las armas equipadas en esa sala.
4. **Muerte y Resurrección:** Si el HP llega a 0, el habitante muere (baja la felicidad de la sala). Se puede revivir pagando Codos de PVC o expulsar definitivamente.

### SPRINT 7: Exploración del Exterior (Yermo) y Sistema de Misiones
1. **Exploración Pasiva (Texto en tiempo real):**
   * Arrastrar un habitante fuera del búnker con Vendas y Desintoxicantes.
   * Generador de eventos por minuto en un registro de texto (encuentros con enemigos, hallazgo de Codos de PVC, armas, ropa y planos).
   * Botón "Regresar": El viaje de vuelta tarda exactamente la mitad del tiempo que llevó explorando.
2. **Oficina del Capataz y Misiones Activas:**
   * Permite enviar escuadrones de hasta 3 habitantes a ubicaciones externas (edificios abandonados, vertederos).
   * En la misión, el jugador explora un edificio habitación por habitación (con niebla de guerra), recoge botín brilhante y participa en combates semi-automáticos con críticos manuales (minijuego de puntería al hacer clic).
3. **Eventos aleatorios internos:** Un "Inspector Fisgón" (equivalente al Misterioso Desconocido) que aparece escondido en alguna sala del búnker durante unos segundos y da Codos de PVC si el jugador le hace clic.

### SPRINT 8: Metajuego, Monetización Simulada, Autenticación y Progreso Offline
1. **Objetivos Diarios y Cajas de Herramientas (Lunchboxes):**
   * 3 misiones activas simultáneas (ej. "Recolecta 100 de agua", "Apaga 2 incendios"). Se puede descartar 1 al día.
   * Recompensas: Codos de PVC o "Cajas de Herramientas" (sobres de 5 cartas aleatorias con recursos, armas o habitantes raros/legendarios).
2. **Autenticación y Base de Datos (Supabase/Firebase):**
   * Registro e inicio de sesión de usuarios.
   * Guardado automático del estado completo del búnker (Grid, Habitantes, Inventario, Timers) en formato JSON en la nube.
3. **Cálculo de Progreso Offline:**
   * Al iniciar sesión, calcular `Tiempo_Ausente = Hora_Actual - Ultimo_Guardado`.
   * Procesar recursos consumidos/producidos (hasta un límite de minutos para no destruir el búnker si el jugador no entra en días), entrenamientos completados y avance de exploradores en el exterior.