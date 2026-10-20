import {
  ArrowUpDown,
  BedDouble,
  BookOpen,
  Crosshair,
  Dices,
  DoorClosed,
  Droplets,
  Dumbbell,
  FlaskConical,
  Footprints,
  Hospital,
  Mic,
  Package,
  Radio,
  Sprout,
  Warehouse,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { RoomType } from '../core/types';

export const ROOM_ICONS: Record<RoomType, LucideIcon> = {
  entrance: DoorClosed,
  elevator: ArrowUpDown,
  power: Zap,
  food: Sprout,
  water: Droplets,
  living: BedDouble,
  storage: Package,
  medbay: Hospital,
  detox: FlaskConical,
  radio: Radio,
  barracks: Warehouse,
  'train-P': Dumbbell,
  'train-A': BookOpen,
  'train-T': Footprints,
  'train-R': Dices,
  'train-O': Mic,
  'train-N': Crosshair,
};

/** Color CSS a partir del acento hex de RoomDef. */
export const hexColor = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
