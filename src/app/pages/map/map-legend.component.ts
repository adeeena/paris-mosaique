import { Component, computed, inject } from '@angular/core';
import { MessageKey, t } from '../../i18n';
import { SettingsService } from '../../settings.service';
import { lineShape, lineStyle } from './transport-lines';
import { MODE_OPTIONS, TransportMode } from './transport-modes';
import { TransportStore } from './transport-store.service';

interface LegendBadge { ref: string; bg: string; fg: string; shape: string; }
interface LegendItem { id: TransportMode; label: MessageKey; badges: LegendBadge[]; }

/** A few real lines of each mode, so the legend shows the colours and shapes the map really uses. */
const SAMPLES: Record<TransportMode, readonly string[]> = {
  metro: ['1', '4', '7'],
  rer: ['A', 'B', 'C'],
  transilien: ['H', 'L', 'N'],
  tram: ['T3a', 'T7'],
  cable_car: ['C1'],
  bus: ['20'],
  other: ['TER']
};

/** What the colours and markers on the map mean; shown while the legend setting is on. */
@Component({
  selector: 'app-map-legend',
  standalone: true,
  templateUrl: './map-legend.component.html',
  styleUrls: ['./map-legend.component.scss']
})
export class MapLegendComponent {
  readonly settings = inject(SettingsService);
  readonly store = inject(TransportStore);
  readonly t = t;

  readonly items = computed<LegendItem[]>(() =>
    MODE_OPTIONS.filter(m => this.store.modes().has(m.id)).map(m => ({
      id: m.id,
      label: `mode.${m.id}` as MessageKey,
      badges: SAMPLES[m.id].map(ref => {
        const style = lineStyle({ ref, mode: m.id });
        return { ref, bg: style.color, fg: style.textColor, shape: lineShape(m.id) };
      })
    })));
}
