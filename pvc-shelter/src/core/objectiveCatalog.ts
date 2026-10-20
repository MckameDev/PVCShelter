import type { ObjectiveKind, ObjectiveReward, VitalResource } from './types';

// Plantillas de objetivos diarios. Cada una define qué cuenta como progreso,
// los posibles objetivos numéricos y la recompensa.

export interface ObjectiveTemplate {
  id: string;
  kind: ObjectiveKind;
  resource?: VitalResource;
  targets: number[];
  text: (target: number) => string;
  reward: ObjectiveReward;
}

export const OBJECTIVE_TEMPLATES: ObjectiveTemplate[] = [
  { id: 'collect-water', kind: 'collect', resource: 'water', targets: [100, 200], text: (n) => `Recolecta ${n} de Agua`, reward: { codos: 150 } },
  { id: 'collect-food', kind: 'collect', resource: 'food', targets: [100, 200], text: (n) => `Recolecta ${n} de Comida`, reward: { codos: 150 } },
  { id: 'collect-energy', kind: 'collect', resource: 'energy', targets: [100, 200], text: (n) => `Recolecta ${n} de Energía`, reward: { box: 'common' } },
  { id: 'incidents', kind: 'incident', targets: [2, 3], text: (n) => `Apaga ${n} incidentes`, reward: { box: 'common' } },
  { id: 'raid', kind: 'raid', targets: [1], text: () => 'Rechaza 1 asalto', reward: { box: 'rare' } },
  { id: 'level-up', kind: 'level-up', targets: [3, 5], text: (n) => `Sube de nivel a habitantes ${n} veces`, reward: { codos: 250 } },
  { id: 'build', kind: 'build', targets: [2, 3], text: (n) => `Construye ${n} salas`, reward: { codos: 200 } },
  { id: 'explorer', kind: 'explorer', targets: [1], text: () => 'Trae de vuelta a un explorador del Yermo', reward: { box: 'common' } },
  { id: 'craft', kind: 'craft', targets: [1, 2], text: (n) => `Fabrica ${n} objeto${n > 1 ? 's' : ''}`, reward: { codos: 300 } },
  { id: 'rush', kind: 'rush', targets: [3], text: (n) => `Consigue ${n} Exprés exitosos`, reward: { cinta: 2 } },
  { id: 'train', kind: 'train', targets: [2, 4], text: (n) => `Entrena ${n} puntos de P.A.T.R.O.N.`, reward: { codos: 250 } },
  { id: 'birth', kind: 'birth', targets: [1], text: () => 'Celebra un nacimiento en el búnker', reward: { box: 'rare' } },
  { id: 'inspector', kind: 'inspector', targets: [1], text: () => 'Atrapa al Inspector Fisgón', reward: { cinta: 3 } },
  { id: 'quest', kind: 'quest', targets: [1], text: () => 'Completa una misión de la Oficina del Capataz', reward: { box: 'rare' } },
];

export const templateById = (id: string) => OBJECTIVE_TEMPLATES.find((t) => t.id === id);
