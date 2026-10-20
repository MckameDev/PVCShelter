// Medidas en píxeles de mundo (antes del zoom de cámara).
export const CELL_W = 48;
export const FLOOR_H = 96;
/** Franja de superficie (cielo + tierra) dibujada sobre el piso 0. */
export const SURFACE_H = 220;
/** Margen a la izquierda del grid para los números de piso. */
export const GUTTER_W = 56;

/** Alto aproximado de la TopBar de React que se superpone al canvas. */
export const TOP_BAR_H = 56;

/** Piso absoluto del zoom; el mínimo real es el que encuadra el búnker entero. */
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 2.5;
/** Píxeles que hay que mover el puntero para que cuente como arrastre y no como clic. */
export const DRAG_THRESHOLD = 6;
