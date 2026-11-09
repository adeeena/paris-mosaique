import { AfterViewInit, Component, OnDestroy, effect, inject, signal, untracked } from '@angular/core';
import { Delaunay } from 'd3-delaunay';
import { language, t } from '../../i18n';
import type { IdfRoute } from './idf-datapoints';
import { DEFAULT_LINE_COLOR } from './idf-line-config';
import type { IdfTrackLine } from './idf-tracks';
import type { Site } from './transport-data';
import { lineKey } from './transport-data';
import { Bounds, LatLngTuple, intersects } from './track-geometry';
import { getTrackWay } from './track-ways';
import { LatLon, haversineM } from './distance';
import { CARD_CONTENT_WIDTH, defunctCard, distanceRows, stationCard, stationPopup } from './station-card';
import { lineStyle, visibleLines } from './transport-lines';
import { TransportStore } from './transport-store.service';
import { MAX_ROUTE_M, WALK_DEBOUNCE_MS, WalkOutcome, WalkingRouteService } from './walking-route.service';

/** Project geographic coords into Web Mercator (unit: radians) for Voronoi computation */
function toMerc(lat: number, lon: number): [number, number] {
  const x = (lon * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  const y = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  return [x, y];
}

/** Inverse Web Mercator → [lat, lon] in degrees */
function fromMerc(x: number, y: number): [number, number] {
  const lon = (x * 180) / Math.PI;
  const lat = (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * (180 / Math.PI);
  return [lat, lon];
}

/** Closed stations get their own colour and dashed cells, so they are not mistaken for live ones. */
const DEFUNCT_COLOR = '#7c3aed';

/** Pick the first visible line's colour from a site, falling back to the default */
function siteColor(site: Site): string {
  if (site.defunct) return DEFUNCT_COLOR;
  const first = visibleLines(site.lines)[0];
  return first ? lineStyle(first).color : DEFAULT_LINE_COLOR;
}

const BASE_STYLE = { fillOpacity: 0.15, weight: 2, opacity: 0.7 };
const HOVER_STYLE = { fillOpacity: 0.40, weight: 3.5, opacity: 1 };
const MIN_ZOOM_TO_SHOW = 12;
const MIN_CLOSED_CELL_SEPARATION_M = 20;

@Component({
  selector: 'app-map-transport-layer',
  standalone: true,
  templateUrl: './map-transport-layer.component.html',
})
export class MapTransportLayerComponent implements AfterViewInit, OnDestroy {
  private readonly store = inject(TransportStore);
  private readonly walking = inject(WalkingRouteService);
  private readonly walkDebounceMs = inject(WALK_DEBOUNCE_MS);
  private readonly mapReady = signal(false);

  /** What the hover tooltip currently shows; null while no cell is hovered. */
  private tip: { site: Site; baseHtml: string; walk: WalkOutcome | null; html: string } | null = null;
  private walkTimer: any = null;
  private walkAbort: AbortController | null = null;
  private walkSeq = 0;
  /** Marker whose popup is open: kept across re-renders, or Leaflet's auto-pan would close it. */
  private openMarker: any = null;

  private voronoiLayerGroup: any; // Voronoi cells — rendered first (bottom-most)
  private routeLayerGroup: any;  // polylines — added second (above Voronoi)
  private layerGroup: any;       // station markers — topmost
  private map: any;
  private L: any;
  private sharedTip: any;
  private moveHandler: any;
  private mapClickHandler: any;
  private renderTimer: any = null;

  private sites: Site[] = [];
  private routes: IdfRoute[] = [];
  private tracks: IdfTrackLine[] = [];
  private delaunay: Delaunay | null = null;
  /** Indices into `sites` of the sites that have a cell: delaunay point k is site cellSites[k]. */
  private cellSites: number[] = [];
  private polys: any[] = []; // polys[i] mirrors sites[i]; null for skipped cells
  private activePoly: any = null;
  private hoveredPoly: any = null;

  constructor() {
    // Rebuild the map content when the selected modes, the lazily loaded data or the language change.
    effect(() => {
      if (!this.mapReady()) return;
      language();
      const sites = this.store.sites();
      const routes = this.store.routes();
      const tracks = this.store.tracks();
      untracked(() => {
        this.sites = sites;
        this.routes = routes;
        this.tracks = tracks;
        this.buildVoronoi();
        this.renderViewport();
      });
    });
  }

  async ngAfterViewInit(): Promise<void> {
    // do nothing during server-side rendering
    if (typeof window === 'undefined') return;

    // wait for the map to be ready on window (created by map-layer)
    this.map = (window as any)._parmap_map;
    if (!this.map) {
      await new Promise<void>(resolve => {
        const onReady = (ev: any) => {
          this.map = ev && ev.detail ? ev.detail : (window as any)._parmap_map;
          window.removeEventListener('parmap:map-ready', onReady as any);
          resolve();
        };
        window.addEventListener('parmap:map-ready', onReady as any);
        // fallback timeout
        setTimeout(() => {
          this.map = (window as any)._parmap_map;
          window.removeEventListener('parmap:map-ready', onReady as any);
          resolve();
        }, 10000);
      });
    }

    if (!this.map) {
      console.warn('MapTransportLayer: map not available; aborting transport layer load');
      return;
    }

    const L = (window as any).L;
    if (!L) {
      console.warn('MapTransportLayer: Leaflet not available');
      return;
    }
    this.L = L;

    // Voronoi cells at the bottom, then route polylines, then station markers
    this.voronoiLayerGroup = L.layerGroup().addTo(this.map);
    this.routeLayerGroup = L.layerGroup().addTo(this.map);
    this.layerGroup = L.layerGroup().addTo(this.map);

    // Single shared tooltip — guarantees only one is ever visible
    this.sharedTip = L.tooltip({
      className: 'parmap-voronoi-tooltip',
      direction: 'auto',
      offset: [0, -6],
      permanent: false
    });

    const deselect = () => {
      if (this.activePoly) { this.activePoly.setStyle(BASE_STYLE); this.activePoly = null; }
    };

    // Clicking the map background deselects the pinned cell
    this.mapClickHandler = deselect;
    this.map.on('click', this.mapClickHandler);

    // Expose layer groups and selection helpers for MapOverlayComponent
    (window as any)._parmap_layers = {
      voronoi:  this.voronoiLayerGroup,
      routes:   this.routeLayerGroup,
      stations: this.layerGroup,
      deselect,
      selectByLatLon: (lat: number, lon: number) => this.selectByLatLon(lat, lon)
    };

    this.moveHandler = () => this.renderViewport();
    this.map.on('moveend zoomend', this.moveHandler);

    this.mapReady.set(true);
  }

  private selectByLatLon(lat: number, lon: number): number {
    if (!this.delaunay) return -1;
    const [x, y] = toMerc(lat, lon);
    const idx = this.cellSites[this.delaunay.find(x, y)] ?? -1;
    if (idx < 0 || idx >= this.polys.length || !this.polys[idx]) return -1;
    if (this.activePoly && this.activePoly !== this.polys[idx]) this.activePoly.setStyle(BASE_STYLE);
    this.activePoly = this.polys[idx];
    this.activePoly.setStyle(HOVER_STYLE);
    this.activePoly.bringToFront();
    return idx;
  }

  /**
   * A closed station almost on top of a live one (Martin Nadaud and Gambetta are 6 m apart) would only split that
   * station's cell in two, and such near-duplicate points make the Voronoi produce a cell reaching the map corner.
   * It keeps its marker but takes no part in the Voronoi.
   */
  private sitesWithCells(): number[] {
    const live = this.sites.filter(s => !s.defunct);
    const indices: number[] = [];
    this.sites.forEach((site, i) => {
      if (!site.defunct || !live.some(other => haversineM(site, other) < MIN_CLOSED_CELL_SEPARATION_M)) indices.push(i);
    });
    return indices;
  }

  /** Rebuilds the Voronoi from the current sites; layer group visibility is left untouched. */
  private buildVoronoi(): void {
    const L = this.L;
    this.voronoiLayerGroup.clearLayers();
    this.stopTip();
    this.sharedTip.remove();
    this.map.closePopup?.();
    this.openMarker = null;
    this.activePoly = null;
    this.hoveredPoly = null;
    this.polys = [];
    this.delaunay = null;
    this.cellSites = [];
    if (this.sites.length === 0) return;

    this.cellSites = this.sitesWithCells();

    const [xMin, yMin] = toMerc(48.0, 1.5); // IDF south-west
    const [xMax, yMax] = toMerc(49.2, 3.5); // IDF north-east

    this.delaunay = Delaunay.from(this.cellSites.map(i => toMerc(this.sites[i].lat, this.sites[i].lon)));
    const voronoi = this.delaunay.voronoi([xMin, yMin, xMax, yMax]);
    this.polys = new Array(this.sites.length).fill(null);

    for (let k = 0; k < this.cellSites.length; k++) {
      const i = this.cellSites[k];
      const cell = voronoi.cellPolygon(k);
      if (!cell || cell.length < 3) continue;

      // cellPolygon returns [[x,y], ...] in mercator — convert back to [lat,lon]
      const latLngs = cell.map(([x, y]: [number, number]) => fromMerc(x, y));
      const st = this.sites[i];
      const color = siteColor(st);
      const tipContent = stationCard(st);

      const poly = L.polygon(latLngs, {
        color,
        ...BASE_STYLE,
        fillColor: color,
        ...(st.defunct ? { dashArray: '6 4' } : {}),
        interactive: true,
        bubblingMouseEvents: false   // prevent click bubbling to map
      });

      poly.on('mouseover', (e: any) => {
        // Explicitly reset previous hover — handles fast mouse movement
        if (this.hoveredPoly && this.hoveredPoly !== poly && this.hoveredPoly !== this.activePoly) {
          this.hoveredPoly.setStyle(BASE_STYLE);
        }
        this.hoveredPoly = poly;
        poly.setStyle(HOVER_STYLE);
        poly.bringToFront();
        this.sharedTip.setLatLng(e.latlng).addTo(this.map);
        this.startTip(st, tipContent, e.latlng);
      });

      poly.on('mousemove', (e: any) => {
        this.sharedTip.setLatLng(e.latlng);
        this.updateTip(e.latlng);
      });

      poly.on('mouseout', () => {
        if (this.hoveredPoly === poly) this.hoveredPoly = null;
        // Only restore if this cell isn’t pinned by a click
        if (poly !== this.activePoly) poly.setStyle(BASE_STYLE);
        this.stopTip();
        this.sharedTip.remove();
      });

      poly.on('click', () => {
        if (this.activePoly === poly) {
          // Second click on same cell → unpin
          this.activePoly = null;
        } else {
          if (this.activePoly && this.activePoly !== poly) this.activePoly.setStyle(BASE_STYLE);
          this.activePoly = poly;
        }
        // Always keep highlight on the clicked cell
        poly.setStyle(HOVER_STYLE);
      });

      poly.addTo(this.voronoiLayerGroup);
      this.polys[i] = poly;
    }
  }

  private startTip(site: Site, baseHtml: string, cursor: { lat: number; lng: number }): void {
    this.stopTip();
    this.tip = { site, baseHtml, walk: null, html: '' };
    this.updateTip(cursor);
  }

  private stopTip(): void {
    this.tip = null;
    this.walkSeq++;
    clearTimeout(this.walkTimer);
    this.walkAbort?.abort();
    this.walkAbort = null;
  }

  /** Refreshes the live straight-line figure and (re)schedules the debounced walking route. */
  private updateTip(cursor: { lat: number; lng: number }): void {
    const tip = this.tip;
    if (!tip) return;
    const from: LatLon = { lat: cursor.lat, lon: cursor.lng };
    const to: LatLon = { lat: tip.site.lat, lon: tip.site.lon };
    const straight = haversineM(from, to);

    // The pending walk is invalid as soon as the cursor moves.
    this.walkSeq++;
    clearTimeout(this.walkTimer);
    this.walkAbort?.abort();
    this.walkAbort = null;

    if (straight > MAX_ROUTE_M) {
      tip.walk = 'unavailable';
    } else {
      const cached = this.walking.peek(from, to);
      if (cached) tip.walk = cached;
      else {
        tip.walk = null;
        this.walkTimer = setTimeout(() => void this.fetchWalk(from, to), this.walkDebounceMs);
      }
    }
    this.paintTip(straight);
  }

  private async fetchWalk(from: LatLon, to: LatLon): Promise<void> {
    const tip = this.tip;
    if (!tip) return;
    const seq = ++this.walkSeq;
    const abort = new AbortController();
    this.walkAbort = abort;

    const outcome = await this.walking.route(from, to, abort.signal);
    if (outcome === null || seq !== this.walkSeq || this.tip !== tip) return;
    this.walkAbort = null;
    tip.walk = outcome;
    this.paintTip(haversineM(from, to));
  }

  private paintTip(straightM: number): void {
    const tip = this.tip;
    if (!tip) return;
    const html = tip.baseHtml + distanceRows(straightM, tip.walk);
    if (html === tip.html) return;
    tip.html = html;
    this.sharedTip.setContent(html);
  }

  private renderViewport(): void {
    if (!this.map || !this.layerGroup) return;
    if (this.renderTimer) clearTimeout(this.renderTimer);

    if (this.map.getZoom() < MIN_ZOOM_TO_SHOW) {
      this.routeLayerGroup.clearLayers();
      this.layerGroup.clearLayers();
      this.openMarker = null;
      return;
    }
    const bounds = this.map.getBounds();
    this.renderTimer = setTimeout(() => this.renderForBounds(bounds), 100);
  }

  private renderForBounds(bounds: any): void {
    const L = this.L;
    // small padding to include stations/routes near the viewport edge
    const padLat = (bounds.getNorth() - bounds.getSouth()) * 0.05;
    const padLng = (bounds.getEast() - bounds.getWest()) * 0.05;
    const s = bounds.getSouth() - padLat;
    const w = bounds.getWest() - padLng;
    const n = bounds.getNorth() + padLat;
    const e = bounds.getEast() + padLng;

    this.routeLayerGroup.clearLayers();
    const keep = this.openMarker;
    this.layerGroup.eachLayer((layer: any) => { if (layer !== keep) this.layerGroup.removeLayer(layer); });

    // --- Draw route polylines (below markers) ---
    // A line with real track geometry is drawn along its track; the others fall back to stop-to-stop chords.
    const view: Bounds = [s, w, n, e];
    const tracked = new Set(this.tracks.map(lineKey));

    for (const line of this.tracks) {
      const paths: LatLngTuple[][] = [];
      for (const index of line.ways) {
        const way = getTrackWay(index);
        if (intersects(view, way.bounds)) paths.push(...way.paths);
      }
      if (paths.length === 0) continue;

      const style = lineStyle(line);
      L.polyline(paths, {
        color: style.color,
        weight: style.weight,
        opacity: 0.85,
        lineJoin: 'round',
        lineCap: 'round'
      }).addTo(this.routeLayerGroup);
    }

    for (const route of this.routes) {
      if (tracked.has(lineKey(route))) continue;
      const hasVisible = route.coords.some(([lat, lon]) => lat >= s && lat <= n && lon >= w && lon <= e);
      if (!hasVisible) continue;

      const style = lineStyle(route);
      L.polyline(route.coords, {
        color: style.color,
        weight: style.weight,
        opacity: 0.85,
        lineJoin: 'round',
        lineCap: 'round'
      }).addTo(this.routeLayerGroup);
    }

    // --- Draw station markers (above routes) ---
    for (const st of this.sites) {
      if (st.lat < s || st.lat > n || st.lon < w || st.lon > e) continue;
      if (keep && keep.getLatLng().lat === st.lat && keep.getLatLng().lng === st.lon) continue;

      const popupHtml = st.defunct ? defunctCard(st.defunct) : st.name ? stationPopup(st) : undefined;

      const icon = st.defunct
        ? L.divIcon({
          className: 'parmap-defunct-icon',
          html: '<div class="defunct-dot">\u{1F47B}</div>',
          iconSize: [24, 24],
          iconAnchor: [12, 12],
          popupAnchor: [0, -14]
        })
        : L.divIcon({
          className: 'parmap-transport-x-icon',
          html: '<span>✖</span>',
          iconSize: [18, 18],
          iconAnchor: [9, 9],
          popupAnchor: [0, -12]
        });

      const marker = L.marker([st.lat, st.lon], { icon, ...(st.defunct ? { zIndexOffset: 500, title: t('defunct.title', { name: st.name }) } : {}) });
      if (popupHtml) {
        marker.bindPopup(popupHtml, {
          className: 'parmap-station-popup',
          closeButton: false,
          minWidth: CARD_CONTENT_WIDTH,
          maxWidth: CARD_CONTENT_WIDTH
        });
        marker.on('popupopen', () => { this.openMarker = marker; });
        marker.on('popupclose', () => { if (this.openMarker === marker) this.openMarker = null; });
      }
      marker.addTo(this.layerGroup);
    }
  }

  ngOnDestroy(): void {
    try {
      if (this.renderTimer) clearTimeout(this.renderTimer);
      this.stopTip();
      if (this.map && this.moveHandler) {
        this.map.off('moveend zoomend', this.moveHandler);
        this.moveHandler = null;
      }
      if (this.map && this.mapClickHandler) {
        this.map.off('click', this.mapClickHandler);
        this.mapClickHandler = null;
      }
      this.voronoiLayerGroup?.clearLayers();
      this.routeLayerGroup?.clearLayers();
      this.layerGroup?.clearLayers();
      this.voronoiLayerGroup?.remove();
      this.routeLayerGroup?.remove();
      this.layerGroup?.remove();
    } catch (_e) {}
  }
}
