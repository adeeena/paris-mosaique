import { ChangeDetectorRef, Component, HostBinding, HostListener, inject, OnDestroy } from '@angular/core';
import { t } from '../../i18n';
import { SettingsService } from '../../settings.service';
import type { IdfLine } from './idf-datapoints';
import { LocateMeService } from './locate-me.service';
import { MapLegendComponent } from './map-legend.component';
import { SettingsDialogComponent } from './settings-dialog.component';
import { cleanName, lineShape, lineStyle, visibleLines } from './transport-lines';
import { TransportStore } from './transport-store.service';

interface LineBadge { line: string; bg: string; fg: string; shape: string; }

interface SearchResult {
  type: 'station' | 'address';
  label: string;
  sublabel: string;
  /** The alias the query matched, when it did not match the station name itself. */
  alias?: string;
  badges: LineBadge[];
  lat: number;
  lon: number;
}

const KONAMI_CODE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
const KONAMI_DURATION_MS = 5200;

function makeBadges(lines: readonly IdfLine[]): LineBadge[] {
  return lines.map(line => {
    const style = lineStyle(line);
    return { line: line.ref, bg: style.color, fg: style.textColor, shape: lineShape(line.mode) };
  });
}

/** Accent- and case-insensitive match */
function normalize(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

@Component({
  selector: 'app-map-overlay',
  standalone: true,
  imports: [MapLegendComponent, SettingsDialogComponent],
  templateUrl: './map-overlay.component.html',
  styleUrls: ['./map-overlay.component.scss']
})
export class MapOverlayComponent implements OnDestroy {
  constructor(private cdr: ChangeDetectorRef) {}

  readonly store = inject(TransportStore);
  readonly locate = inject(LocateMeService);
  readonly settings = inject(SettingsService);
  readonly t = t;

  // ── search ─────────────────────────────────────────────────────
  searchQuery   = '';
  results: SearchResult[] = [];
  showDropdown  = false;
  isSearching   = false;
  searchStatus: 'idle' | 'no-results' | 'unavailable' = 'idle';
  @HostBinding('class.konami-active') konamiActive = false;

  private pinMarker: any  = null;
  private konamiIndex = 0;
  private konamiTimeout: ReturnType<typeof setTimeout> | null = null;
  /** Identifies the current search; bumped whenever the query changes or is cleared. */
  private searchSeq = 0;
  private geocodeAbort: AbortController | null = null;
  private readonly addressCache = new Map<string, SearchResult[]>();
  private addressSearchedKey: string | null = null;

  get canSearchAddresses(): boolean {
    return !!this.searchQuery.trim() && !this.isSearching
      && this.addressSearchedKey !== this.cacheKey(this.searchQuery);
  }

  get dropdownVisible(): boolean {
    return this.showDropdown
      && (this.results.length > 0 || this.searchStatus !== 'idle' || this.canSearchAddresses);
  }

  /** Invalidates in-flight address requests and clears every search state. */
  private resetSearch(query = ''): void {
    this.searchSeq++;
    this.geocodeAbort?.abort();
    this.geocodeAbort = null;
    this.searchQuery   = query;
    this.results       = [];
    this.showDropdown  = false;
    this.isSearching   = false;
    this.searchStatus  = 'idle';
    this.addressSearchedKey = null;
  }

  onInput(e: Event): void {
    const q = (e.target as HTMLInputElement).value;
    this.resetSearch(q);

    if (!q.trim()) {
      this.clearPin();
      return;
    }

    // Typing only filters local stations; address geocoding waits for an explicit submit.
    this.results      = this.matchStations(q);
    this.showDropdown = true;
  }

  onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.resetSearch();
      this.clearPin();
    } else if (e.key === 'Enter' && this.results.length > 0) {
      this.select(this.results[0]);
    } else if (e.key === 'Enter' && this.searchQuery.trim()) {
      void this.searchAddresses().then(applied => {
        if (applied && this.results.length > 0) this.select(this.results[0]);
      });
    }
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    const target = event.target;
    if (event.repeat || (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]'))) return;

    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (key === KONAMI_CODE[this.konamiIndex]) {
      this.konamiIndex++;
      if (key.startsWith('Arrow')) event.preventDefault();
      if (this.konamiIndex === KONAMI_CODE.length) {
        this.konamiIndex = 0;
        this.activateKonami();
      }
      return;
    }

    this.konamiIndex = key === KONAMI_CODE[0] ? 1 : 0;
    if (this.konamiIndex > 0) event.preventDefault();
  }

  ngOnDestroy(): void {
    if (this.konamiTimeout !== null) clearTimeout(this.konamiTimeout);
  }

  onBlur(): void {
    // Delay so a click on a dropdown item can register first
    setTimeout(() => { this.showDropdown = false; this.cdr.detectChanges(); }, 160);
  }

  select(r: SearchResult): void {
    this.resetSearch(r.label);
    this.clearPin();

    const map = this.map;
    const L   = (window as any).L;
    if (!map || !L) return;

    // Place pin
    const icon = L.divIcon({
      className: 'parmap-search-pin',
      html:      '<div class="pin-inner"></div>',
      iconSize:  [14, 14],
      iconAnchor:[7, 7]
    });
    this.pinMarker = L.marker([r.lat, r.lon], { icon, zIndexOffset: 1000 }).addTo(map);

    // Fly
    map.flyTo([r.lat, r.lon], Math.max(map.getZoom(), 15), { duration: 0.8 });

    // Highlight nearest Voronoi cell
    const layers = this.layers;
    if (layers?.selectByLatLon) layers.selectByLatLon(r.lat, r.lon);
    this.cdr.detectChanges();
  }

  // ── internals ──────────────────────────────────────────────────
  private get layers(): any { return (window as any)._parmap_layers; }
  private get map(): any    { return (window as any)._parmap_map; }

  private matchStations(q: string): SearchResult[] {
    const nq   = normalize(q);
    const seen = new Set<string>();
    const out: SearchResult[] = [];

    for (const st of this.store.sites()) {
      const name = cleanName(st.name || '');
      if (!name) continue;
      const alias = normalize(name).includes(nq)
        ? undefined
        : (st.aliases ?? []).map(cleanName).find(a => normalize(a).includes(nq));
      if (!normalize(name).includes(nq) && !alias) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      const fl = visibleLines(st.lines);
      out.push({
        type:     'station',
        label:    name,
        sublabel: fl.map(l => l.ref).join(' \u00b7 '),
        alias,
        badges:   makeBadges(fl.slice(0, 12)),
        lat:      st.lat,
        lon:      st.lon
      });
      if (out.length >= 6) break;
    }
    return out;
  }

  private cacheKey(q: string): string {
    return normalize(q).trim().replace(/\s+/g, ' ');
  }

  private remember(key: string, results: SearchResult[]): void {
    this.addressCache.set(key, results);
    if (this.addressCache.size > 50) this.addressCache.delete(this.addressCache.keys().next().value as string);
  }

  /** Geocodes the current query. Resolves true when its outcome was applied to the UI. */
  async searchAddresses(): Promise<boolean> {
    const q = this.searchQuery;
    if (!q.trim()) return false;

    const key      = this.cacheKey(q);
    const stations = this.matchStations(q);
    this.geocodeAbort?.abort();
    const seq = ++this.searchSeq;
    this.addressSearchedKey = key;
    this.showDropdown = true;

    const cached = this.addressCache.get(key);
    if (cached) {
      this.applyAddressResults(stations, cached);
      this.cdr.detectChanges();
      return true;
    }

    const abort = new AbortController();
    this.geocodeAbort = abort;
    this.results      = stations;
    this.searchStatus = 'idle';
    this.isSearching  = true;
    this.cdr.detectChanges();

    let addresses: SearchResult[] | null = null;
    try {
      const url = [
        'https://nominatim.openstreetmap.org/search',
        `?q=${encodeURIComponent(q)}`,
        '&format=json&limit=4&countrycodes=fr',
        '&viewbox=1.5,49.2,3.5,48.0&bounded=0'
      ].join('');
      const res = await fetch(url, { headers: { 'Accept-Language': 'fr,en' }, signal: abort.signal });
      if (res.ok) {
        const json = await res.json() as any[];
        addresses = json.slice(0, 4).map(r => {
          const parts    = (r.display_name as string).split(',');
          const label    = parts.slice(0, 2).join(',').trim();
          const sublabel = parts.slice(2, 4).join(',').trim();
          return { type: 'address' as const, label, sublabel, badges: [], lat: +r.lat, lon: +r.lon };
        });
      }
    } catch { /* aborted or network error: addresses stay null */ }

    // A newer search, edit, or clear took over while this request was in flight.
    if (seq !== this.searchSeq) return false;

    this.geocodeAbort = null;
    this.isSearching  = false;
    if (addresses) {
      this.remember(key, addresses);
      this.applyAddressResults(stations, addresses);
    } else {
      this.results      = stations;
      this.searchStatus = 'unavailable';
    }
    this.cdr.detectChanges();
    return true;
  }

  /** Merge: station hits first, then address hits (deduplicated by label). */
  private applyAddressResults(stations: SearchResult[], addresses: SearchResult[]): void {
    const stLabels = new Set(stations.map(s => s.label));
    this.results      = [...stations, ...addresses.filter(a => !stLabels.has(a.label))];
    this.searchStatus = this.results.length === 0 ? 'no-results' : 'idle';
    this.isSearching  = false;
  }

  private activateKonami(): void {
    if (this.konamiTimeout !== null) clearTimeout(this.konamiTimeout);
    this.konamiTimeout = null;
    if (this.konamiActive) {
      this.konamiActive = false;
      this.cdr.detectChanges();
    }
    this.konamiActive = true;
    this.cdr.detectChanges();
    this.konamiTimeout = setTimeout(() => {
      this.konamiActive = false;
      this.konamiTimeout = null;
      this.cdr.detectChanges();
    }, KONAMI_DURATION_MS);
  }

  onClear(): void {
    this.resetSearch();
    this.clearPin();
  }

  clearPin(): void {
    if (this.pinMarker) { this.pinMarker.remove(); this.pinMarker = null; }
    this.layers?.deselect?.();
  }
}
