import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { MAP_COORDS } from '../../variables';
import { language, t } from '../../i18n';
import { GEOLOCATION, LocateProblem, locateMessage, problemFromError } from './browser-location';
import { LatLon, nearestSite } from './distance';
import { CARD_CONTENT_WIDTH, distanceRows, stationCard } from './station-card';
import { TransportStore } from './transport-store.service';
import { MAX_ROUTE_M, WalkOutcome, WalkingRouteService } from './walking-route.service';

const MESSAGE_MS = 6000;
const MIN_ZOOM = 15;
/** An accuracy circle larger than this (a coarse IP-based fix) would only clutter the map. */
const MAX_CIRCLE_M = 2000;
const GEOLOCATION_OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 };

const noStationCard = () => `<div class="parmap-tip-name">${t('card.none')}</div>`
  + `<div class="parmap-tip-badges"></div>`;

interface Position extends LatLon {
  accuracy: number;
}

/** Shows the browser's location on the map with a card for the closest station. */
@Injectable({ providedIn: 'root' })
export class LocateMeService {
  private readonly geolocation = inject(GEOLOCATION);
  private readonly store = inject(TransportStore);
  private readonly walking = inject(WalkingRouteService);

  readonly locating = signal(false);
  private readonly problem = signal<LocateProblem | null>(null);
  readonly message = computed(() => {
    const problem = this.problem();
    return problem ? locateMessage(problem) : null;
  });

  private position: Position | null = null;
  private marker: any = null;
  private circle: any = null;
  private messageTimer: ReturnType<typeof setTimeout> | null = null;
  private walkSeq = 0;
  private walkAbort: AbortController | null = null;

  constructor() {
    // The closest station depends on the selected modes, so the card follows them.
    effect(() => {
      this.store.sites();
      language();
      untracked(() => { if (this.position) this.refreshCard(); });
    });
  }

  locate(): void {
    if (this.locating()) return;
    this.setProblem(null);
    if (!this.geolocation) {
      this.setProblem('unsupported');
      return;
    }
    this.locating.set(true);
    this.geolocation.getCurrentPosition(
      pos => this.onPosition(pos),
      err => this.fail(problemFromError(err)),
      GEOLOCATION_OPTIONS
    );
  }

  private onPosition(pos: GeolocationPosition): void {
    const { latitude: lat, longitude: lon, accuracy } = pos.coords;
    const [[south, west], [north, east]] = MAP_COORDS.bounds;
    if (lat < south || lat > north || lon < west || lon > east) {
      this.fail('outside');
      return;
    }
    this.locating.set(false);
    this.position = { lat, lon, accuracy };
    this.showOnMap();
  }

  private fail(problem: LocateProblem): void {
    this.locating.set(false);
    this.setProblem(problem);
  }

  private setProblem(problem: LocateProblem | null): void {
    this.problem.set(problem);
    if (this.messageTimer) clearTimeout(this.messageTimer);
    this.messageTimer = problem ? setTimeout(() => this.problem.set(null), MESSAGE_MS) : null;
  }

  private showOnMap(): void {
    const w = window as any;
    const map = w._parmap_map;
    const L = w.L;
    const pos = this.position;
    if (!map || !L || !pos) return;

    this.marker?.remove();
    this.circle?.remove();
    this.circle = pos.accuracy <= MAX_CIRCLE_M
      ? L.circle([pos.lat, pos.lon], {
          radius: pos.accuracy, color: '#2f80ed', weight: 1, fillColor: '#2f80ed', fillOpacity: 0.12, interactive: false
        }).addTo(map)
      : null;

    const icon = L.divIcon({
      className: 'parmap-user-pin',
      html: '<div class="user-dot"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
      popupAnchor: [0, -12]
    });
    this.marker = L.marker([pos.lat, pos.lon], { icon, zIndexOffset: 1000, keyboard: false })
      .addTo(map)
      .bindPopup(noStationCard(), {
        className: 'parmap-station-popup',
        closeButton: false,
        autoPan: false,
        minWidth: CARD_CONTENT_WIDTH,
        maxWidth: CARD_CONTENT_WIDTH
      });

    this.refreshCard();
    this.marker.openPopup();
    w._parmap_layers?.selectByLatLon?.(pos.lat, pos.lon);
    map.flyTo([pos.lat, pos.lon], Math.max(map.getZoom(), MIN_ZOOM), { duration: 0.8 });
  }

  /** Fills the popup with the closest station of the selected modes, then adds the walking route. */
  private refreshCard(): void {
    const pos = this.position;
    const marker = this.marker;
    if (!pos || !marker) return;

    const seq = ++this.walkSeq;
    this.walkAbort?.abort();
    this.walkAbort = null;

    const hit = nearestSite(this.store.sites(), pos);
    if (!hit) {
      marker.setPopupContent(noStationCard());
      return;
    }

    const base = stationCard(hit.site);
    const paint = (walk: WalkOutcome | null) => marker.setPopupContent(base + distanceRows(hit.meters, walk));
    if (hit.meters > MAX_ROUTE_M) {
      paint('unavailable');
      return;
    }
    const cached = this.walking.peek(pos, hit.site);
    if (cached) {
      paint(cached);
      return;
    }

    paint(null);
    const abort = new AbortController();
    this.walkAbort = abort;
    void this.walking.route(pos, hit.site, abort.signal).then(outcome => {
      if (outcome !== null && seq === this.walkSeq) paint(outcome);
    });
  }
}
