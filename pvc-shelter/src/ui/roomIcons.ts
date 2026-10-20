import { ArrowUpDown, BedDouble, DoorClosed, Droplets, Sprout, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { RoomType } from '../core/types';

export const ROOM_ICONS: Record<RoomType, LucideIcon> = {
  entrance: DoorClosed,
  elevator: ArrowUpDown,
  power: Zap,
  food: Sprout,
  water: Droplets,
  living: BedDouble,
};

/** Color CSS a partir del acento hex de RoomDef. */
export const hexColor = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
