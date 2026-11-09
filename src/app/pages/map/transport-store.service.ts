import { InjectionToken, Injectable, computed, inject, signal } from '@angular/core';
import { IDF_ROUTES, IDF_STATIONS } from './idf-datapoints';
import { DEFUNCT_STATIONS } from './defunct-stations';
import { IDF_TRACK_LINES } from './idf-tracks';
import { ExtraSnapshot, RawExtraModule, buildExtraSnapshot, needsExtra, selectRoutes, selectSites, selectTrackLines } from './transport-data';
import { DEFAULT_MODES, TransportMode } from './transport-modes';

export type ExtraStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Loads the non-rail snapshot on demand; overridable in tests. */
export const EXTRA_LOADER = new InjectionToken<() => Promise<RawExtraModule>>('EXTRA_LOADER', {
  providedIn: 'root',
  factory: () => () => import('./idf-datapoints-extra')
});

@Injectable({ providedIn: 'root' })
export class TransportStore {
  private readonly loadExtra = inject(EXTRA_LOADER);
  private readonly selected = signal<ReadonlySet<TransportMode>>(DEFAULT_MODES);
  private readonly extra = signal<ExtraSnapshot | null>(null);
  private readonly defunct = signal(false);

  readonly modes = this.selected.asReadonly();
  /** Whether the closed stations are shown and take part in the Voronoi. */
  readonly defunctShown = this.defunct.asReadonly();
  readonly extraStatus = signal<ExtraStatus>('idle');
  readonly sites = computed(() => selectSites(this.selected(), IDF_STATIONS, this.extra(), this.defunct() ? DEFUNCT_STATIONS : []));
  readonly routes = computed(() => selectRoutes(this.selected(), IDF_ROUTES, this.extra()));
  /** Lines drawn along their real track; their stop-to-stop routes are not drawn. */
  readonly tracks = computed(() => selectTrackLines(this.selected(), IDF_TRACK_LINES));

  setMode(mode: TransportMode, on: boolean): void {
    const next = new Set(this.selected());
    if (on) next.add(mode);
    else next.delete(mode);
    this.selected.set(next);
    if (needsExtra(next)) void this.ensureExtra();
  }

  setDefunct(on: boolean): void { this.defunct.set(on); }

  private async ensureExtra(): Promise<void> {
    if (this.extra() || this.extraStatus() === 'loading') return;
    this.extraStatus.set('loading');
    try {
      this.extra.set(buildExtraSnapshot(await this.loadExtra()));
      this.extraStatus.set('ready');
    } catch {
      this.extraStatus.set('error');
    }
  }
}
