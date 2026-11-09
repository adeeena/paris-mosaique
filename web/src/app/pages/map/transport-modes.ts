import type { TransportMode } from './idf-datapoints';

export type { TransportMode };
export type RailMode = 'metro' | 'rer' | 'transilien' | 'tram';

export interface ModeOption {
  id: TransportMode;
  label: string;
  hint?: string;
  rail: boolean;
}

export const MODE_OPTIONS: readonly ModeOption[] = [
  { id: 'metro', label: 'Metro', rail: true },
  { id: 'rer', label: 'RER', rail: true },
  { id: 'transilien', label: 'Transilien', rail: true },
  { id: 'tram', label: 'Tram', rail: true },
  { id: 'cable_car', label: 'Cable car', rail: false },
  { id: 'bus', label: 'Bus', hint: 'Loads about 2 MB on first use', rail: false },
  { id: 'other', label: 'Other', hint: 'TER, TGV, shuttles, ferries', rail: false }
];

export const DEFAULT_MODES: ReadonlySet<TransportMode> = new Set(
  MODE_OPTIONS.filter(m => m.rail).map(m => m.id)
);

export function isRailMode(mode: TransportMode): mode is RailMode {
  return mode === 'metro' || mode === 'rer' || mode === 'transilien' || mode === 'tram';
}
