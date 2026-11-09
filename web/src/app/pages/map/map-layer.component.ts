import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import type { MapCoords } from '../../variables';
import { MAP_COORDS } from '../../variables';

@Component({
  selector: 'app-map-layer',
  standalone: true,
  templateUrl: './map-layer.component.html',
  styleUrls: ['./map-layer.component.scss']
})
export class MapLayerComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapRoot', { static: true }) mapRoot!: ElementRef<HTMLDivElement>;
  private map: any;

  ngAfterViewInit(): void {
    if (typeof window === 'undefined') return;
    // Leaflet is loaded via CDN and exposes global `L`
    const L = (window as any).L;
    if (!L) return;

    const coords: MapCoords = MAP_COORDS as unknown as MapCoords;

    const initialZoom = typeof coords.zoom === 'number' ? coords.zoom : 12;
    const useZoom = Math.min(Math.round(initialZoom), 19);
    this.map = L.map(this.mapRoot.nativeElement, {
      center: coords.center,
      zoom: useZoom,
      zoomControl: false,
      attributionControl: false,
      maxBounds: coords.bounds,
      maxBoundsViscosity: 1.0,
      minZoom: 9
    });

    // expose the map for other layers/components to attach to
    try {
      (window as any)._parmap_map = this.map;
      // also dispatch a DOM event so listeners can react immediately
      try {
        window.dispatchEvent(new CustomEvent('parmap:map-ready', { detail: this.map }));
      } catch (e) {}
    } catch (e) {
      // ignore
    }

    // The dark theme darkens these same tiles with a CSS filter (see styles.scss).
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      className: 'parmap-tiles'
    }).addTo(this.map);

    // log zoom changes to console so user can request the data
    this.map.on('zoomend', () => {
      try {
        const z = this.map.getZoom();
        const c = this.map.getCenter();
        console.log('map:zoomend', { zoom: z, center: { lat: c.lat, lng: c.lng } });
      } catch (e) {
        console.log('map:zoomend error', e);
      }
    });
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
      this.map = undefined;
    }
  }
}
