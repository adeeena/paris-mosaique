import { TestBed, ComponentFixture } from '@angular/core/testing';
import { MapTransportLayerComponent } from './map-transport-layer.component';
import { DEFUNCT_STATIONS } from './defunct-stations';
import { lineKey } from './transport-data';
import { EXTRA_LOADER, TransportStore } from './transport-store.service';
import { WALK_DEBOUNCE_MS } from './walking-route.service';

const flush = (ms = 0) => new Promise<void>(resolve => setTimeout(resolve, ms));

// The real snapshot has no station with more than 8 lines; the badge-cap tests need one.
jest.mock('./idf-datapoints', () => {
  const actual = jest.requireActual('./idf-datapoints');
  const hub = {
    lat: 48.9, lon: 2.3, name: 'Crowded Hub',
    lines: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].map(ref => ({ ref, mode: 'metro' }))
  };
  return { ...actual, IDF_STATIONS: [...actual.IDF_STATIONS, hub] };
});

function fakeLeaflet() {
  const makeGroup = () => {
    const group: any = {
      layers: [] as any[],
      attached: false,
      addTo: jest.fn(() => { group.attached = true; return group; }),
      remove: jest.fn(() => { group.attached = false; return group; }),
      clearLayers: jest.fn(() => { group.layers.length = 0; }),
      eachLayer: jest.fn((fn: (l: any) => void) => { [...group.layers].forEach(fn); }),
      removeLayer: jest.fn((l: any) => { const i = group.layers.indexOf(l); if (i >= 0) group.layers.splice(i, 1); })
    };
    return group;
  };
  const layer = (extra: object = {}) => {
    const l: any = {
      handlers: {} as Record<string, (e?: any) => void>,
      on: jest.fn((evt: string, fn: (e?: any) => void) => { l.handlers[evt] = fn; return l; }),
      setStyle: jest.fn(),
      bringToFront: jest.fn(),
      bindPopup: jest.fn(() => l),
      popups: [] as string[],
      popupOptions: [] as unknown[],
      addTo: jest.fn((group: any) => { group.layers.push(l); return l; }),
      ...extra
    };
    l.bindPopup = jest.fn((html: string, options?: unknown) => { l.popups.push(html); l.popupOptions.push(options); return l; });
    return l;
  };
  const tooltip: any = {
    html: '',
    setContent: jest.fn((html: string) => { tooltip.html = html; return tooltip; }),
    setLatLng: jest.fn(() => tooltip),
    addTo: jest.fn(() => tooltip),
    remove: jest.fn()
  };
  const groups: any[] = [];

  return {
    groups,
    tooltip,
    L: {
      layerGroup: () => { const g = makeGroup(); groups.push(g); return g; },
      polygon: jest.fn((latLngs: unknown) => layer({ latLngs })),
      polyline: jest.fn((coords: unknown, opts: unknown) => layer({ coords, opts })),
      marker: jest.fn((latLng: [number, number]) => layer({ latLng, getLatLng: () => ({ lat: latLng[0], lng: latLng[1] }) })),
      divIcon: jest.fn(() => ({})),
      tooltip: jest.fn(() => tooltip)
    }
  };
}

describe('MapTransportLayerComponent', () => {
  let fixture: ComponentFixture<MapTransportLayerComponent>;
  let store: TransportStore;
  let leaflet: ReturnType<typeof fakeLeaflet>;
  let voronoi: any, routes: any, stations: any;
  let fakeMap: any;

  beforeEach(async () => {
    leaflet = fakeLeaflet();
    const map = {
      on: jest.fn(), off: jest.fn(), closePopup: jest.fn(),
      getZoom: () => 14,
      getBounds: () => ({ getSouth: () => 48.0, getWest: () => 1.5, getNorth: () => 49.2, getEast: () => 3.5 })
    };
    fakeMap = map;
    (window as any).L = leaflet.L;
    (window as any)._parmap_map = map;

    await TestBed.configureTestingModule({
      imports: [MapTransportLayerComponent],
      providers: [{ provide: WALK_DEBOUNCE_MS, useValue: 30 }, {
        provide: EXTRA_LOADER,
        useValue: () => Promise.resolve({
          IDF_EXTRA_STATIONS: [
            { lat: 48.87, lon: 2.37, name: 'Gamma', lines: [{ ref: '4', mode: 'bus' }] },
            { lat: 48.88, lon: 2.38, name: 'Delta', lines: [{ ref: '9', mode: 'bus' }] }
          ],
          IDF_EXTRA_STATION_LINES: [],
          IDF_EXTRA_ROUTES: [{ ref: '4', mode: 'bus', coords: [[48.87, 2.37], [48.88, 2.38]] }]
        })
      }]
    }).compileComponents();

    store = TestBed.inject(TransportStore);
    fixture = TestBed.createComponent(MapTransportLayerComponent);
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
    await flush(150);
    [voronoi, routes, stations] = leaflet.groups;
  });

  afterEach(() => {
    delete (window as any).L;
    delete (window as any)._parmap_map;
    delete (window as any)._parmap_layers;
  });

  const refresh = async () => {
    fixture.detectChanges();
    await flush(150);
  };

  /** Lines with track geometry draw one polyline each; every other route is a chord. */
  const expectedRouteLayers = () => {
    const tracked = new Set(store.tracks().map(lineKey));
    return store.routes().filter(r => !tracked.has(lineKey(r))).length + store.tracks().length;
  };
  const isChord = (layer: any) => typeof layer.coords[0][0] === 'number';
  const isTrack = (layer: any) => !isChord(layer);

  describe('track geometry', () => {
    it('draws RER and Transilien along their track, one polyline per line', () => {
      const tracks = routes.layers.filter(isTrack);

      expect(tracks).toHaveLength(store.tracks().length);
      expect(store.tracks().length).toBeGreaterThanOrEqual(10);
      expect(tracks.every((l: any) => l.coords.every((path: unknown[]) => path.length >= 2))).toBe(true);
    });

    it('does not also draw the stop-to-stop chords of a tracked line', () => {
      const tracked = new Set(store.tracks().map(lineKey));
      const chordRoutes = store.routes().filter(r => !tracked.has(lineKey(r)));

      expect(routes.layers.filter(isChord)).toHaveLength(chordRoutes.length);
      expect(chordRoutes.every(r => r.mode !== 'rer' && r.mode !== 'transilien')).toBe(true);
    });

    it('follows the curve: a track polyline has far more points than the stops of its line', () => {
      const points = (l: any) => l.coords.reduce((n: number, p: unknown[]) => n + p.length, 0);
      const trackPoints = routes.layers.filter(isTrack).reduce((n: number, l: any) => n + points(l), 0);
      const chordPoints = store.routes().filter(r => r.mode === 'rer' || r.mode === 'transilien')
        .reduce((n, r) => n + r.coords.length, 0);

      expect(trackPoints).toBeGreaterThan(chordPoints * 2);
    });

    it('removes the track of a deselected mode', async () => {
      const before = routes.layers.filter(isTrack).length;
      store.setMode('transilien', false);
      await refresh();

      const transilien = store.tracks().filter(l => l.mode === 'transilien').length;
      expect(transilien).toBe(0);
      expect(routes.layers.filter(isTrack).length).toBe(before - 9); // H J K L N P R U V
    });

    it('draws only the track ways that are in the viewport', async () => {
      const all = routes.layers.filter(isTrack).reduce((n: number, l: any) => n + l.coords.length, 0);

      fakeMap.getBounds = () => ({ getSouth: () => 48.84, getWest: () => 2.28, getNorth: () => 48.88, getEast: () => 2.35 });
      fakeMap.on.mock.calls.find((c: unknown[]) => c[0] === 'moveend zoomend')[1]();
      await flush(150);

      const inView = routes.layers.filter(isTrack).reduce((n: number, l: any) => n + l.coords.length, 0);
      expect(inView).toBeGreaterThan(0);
      expect(inView).toBeLessThan(all / 4);
    });

    it('draws no track when the viewport is away from the network', async () => {
      fakeMap.getBounds = () => ({ getSouth: () => 10, getWest: () => 10, getNorth: () => 11, getEast: () => 11 });
      fakeMap.on.mock.calls.find((c: unknown[]) => c[0] === 'moveend zoomend')[1]();
      await flush(150);

      expect(routes.layers).toHaveLength(0);
    });
  });

  it('draws one Voronoi cell and one marker per rail site by default', () => {
    expect(store.sites().length).toBeGreaterThan(0);
    expect(voronoi.layers).toHaveLength(store.sites().length);
    expect(stations.layers).toHaveLength(store.sites().length);
    expect(routes.layers).toHaveLength(expectedRouteLayers());
  });

  it('lets Leaflet place the hover tooltip where there is room', () => {
    expect(leaflet.L.tooltip).toHaveBeenCalledWith(expect.objectContaining({
      className: 'parmap-voronoi-tooltip',
      direction: 'auto'
    }));
  });

  it('redraws cells, routes and markers for the selected modes', async () => {
    store.setMode('metro', false);
    await refresh();

    expect(voronoi.layers).toHaveLength(store.sites().length);
    expect(stations.layers).toHaveLength(store.sites().length);
    expect(routes.layers.every((l: any) => l.opts.color !== undefined)).toBe(true);
    expect(routes.layers).toHaveLength(expectedRouteLayers());
    expect(store.routes().some(r => r.mode === 'metro')).toBe(false);
  });

  it('adds bus sites and routes once the extra data is loaded', async () => {
    const railCount = store.sites().length;
    store.setMode('bus', true);
    await flush();
    await refresh();

    expect(store.sites().length).toBe(railCount + 2);
    expect(voronoi.layers).toHaveLength(railCount + 2);
    expect(routes.layers.some((l: any) => l.coords[0][0] === 48.87)).toBe(true);
    expect(stations.layers.some((l: any) => l.popups.some((p: string) => p.includes('Gamma')))).toBe(true);
  });

  it('shows only selected-mode lines in a marker popup', async () => {
    store.setMode('bus', true);
    await flush();
    await refresh();

    const shared = stations.layers.find((l: any) => l.popups[0]?.includes('Gamma'));
    expect(shared.popups[0]).toContain('>4<');
    expect(shared.popups[0]).not.toContain('background:#CF009E'); // Metro 4 colour must not leak onto bus 4
  });

  describe('station marker popup', () => {
    const popupMarker = () => stations.layers.find((l: any) => l.popups.length > 0);

    it('uses the same card rows as the hover tooltip', () => {
      const html: string = popupMarker().popups[0];

      for (const row of ['parmap-tip-name', 'parmap-tip-badges']) {
        expect(html).toContain(`class="${row}"`);
      }
      expect(html).not.toContain('parmap-voronoi-label');
    });

    it('has no close button and a fixed width, matching the tooltip', () => {
      const options: any = popupMarker().popupOptions[0];

      expect(options.closeButton).toBe(false);
      expect(options.className).toBe('parmap-station-popup');
      expect(options.minWidth).toBe(options.maxWidth);
      expect(options.maxWidth).toBe(219);
    });

    it('caps the badges at 8 on one row, like the tooltip', () => {
      const crowded = stations.layers.find((l: any) => />\+\d+</.test(l.popups[0] ?? ''));

      expect(crowded).toBeDefined();
      expect(crowded.popups[0].match(/parmap-line-badge /g)).toHaveLength(8);
      expect(crowded.popups[0]).toMatch(/>\+\d+</);
    });

    it('has no distance rows, since a click on the marker is already on the station', () => {
      expect(popupMarker().popups[0]).not.toContain('parmap-voronoi-dist');
    });

    const rerender = async () => {
      fakeMap.on.mock.calls.find((c: unknown[]) => c[0] === 'moveend zoomend')[1]();
      await flush(150);
    };

    it('keeps the marker with an open popup when the viewport is re-rendered', async () => {
      const marker = popupMarker();
      marker.handlers['popupopen']();
      const before = stations.layers.length;

      await rerender(); // Leaflet's auto-pan to fit a popup triggers this

      expect(stations.layers).toContain(marker);
      expect(stations.layers).toHaveLength(before);
    });

    it('replaces the marker again once its popup is closed', async () => {
      const marker = popupMarker();
      marker.handlers['popupopen']();
      marker.handlers['popupclose']();

      await rerender();

      expect(stations.layers).not.toContain(marker);
    });

    it('closes the popup when the selected modes change the map content', async () => {
      const marker = popupMarker();
      marker.handlers['popupopen']();

      store.setMode('metro', false);
      fixture.detectChanges();
      await flush(150);

      expect(fakeMap.closePopup).toHaveBeenCalled();
      expect(stations.layers).not.toContain(marker);
    });
  });

  describe('defunct stations', () => {
    const croixRouge = () => store.sites().findIndex(s => s.defunct?.name === 'Croix-Rouge');

    beforeEach(async () => {
      store.setDefunct(true);
      await refresh();
    });

    // These two closed stations are 6 m and 14 m from Gambetta and Porte de Versailles.
    const ON_LIVE_STATION = ['Martin Nadaud', 'Porte de Versailles (original)'];

    it('gives each closed station a Voronoi cell of its own, like any other station', () => {
      expect(voronoi.layers).toHaveLength(store.sites().length - ON_LIVE_STATION.length);
      expect(store.sites().filter(s => s.defunct)).toHaveLength(DEFUNCT_STATIONS.length);
    });

    it('gives no cell to a closed station that sits on a live one, whose degenerate cell reached the map corner', () => {
      const sites = store.sites();

      for (const name of ON_LIVE_STATION) {
        expect(sites.some(s => s.defunct?.name === name)).toBe(true);
        expect(stations.layers.some((l: any) => (l.popups[0] ?? '').includes(name))).toBe(true);
      }
      expect(voronoi.layers).toHaveLength(sites.length - ON_LIVE_STATION.length);
    });

    it('draws a closed station\'s cell dashed in its own colour', () => {
      const options = leaflet.L.polygon.mock.calls.map((c: any[]) => c[1]).filter((o: any) => o.dashArray);

      expect(options).toHaveLength(DEFUNCT_STATIONS.length - ON_LIVE_STATION.length);
      expect(options[0]).toMatchObject({ color: '#7c3aed', fillColor: '#7c3aed', dashArray: '6 4' });
    });

    it('marks a closed station with its own icon and a popup that says it is defunct', () => {
      const icons = leaflet.L.divIcon.mock.calls.map((c: any[]) => c[0]).filter((o: any) => o.className === 'parmap-defunct-icon');
      const popup = stations.layers.map((l: any) => l.popups[0] ?? '').find((p: string) => p.includes('Croix-Rouge'));

      expect(icons.length).toBeGreaterThanOrEqual(DEFUNCT_STATIONS.length);
      expect(popup).toContain('Defunct \u00b7 Closed 1939');
      expect(popup).toContain('parmap-tip-note');
    });

    it('puts a "Defunct" heading above a closed station in the hover tooltip', () => {
      voronoi.layers[croixRouge()].handlers['mouseover']({ latlng: { lat: 48.8519, lng: 2.3295 } });

      expect(leaflet.tooltip.html).toContain('Defunct \u00b7 Closed 1939');
      expect(leaflet.tooltip.html).not.toContain('Closest station');
      expect(leaflet.tooltip.html).toContain('Direct');
    });

    it('leaves the cells of the live stations alone when they are switched off again', async () => {
      store.setDefunct(false);
      await refresh();

      expect(voronoi.layers).toHaveLength(store.sites().length);
      expect(store.sites().some(s => s.defunct)).toBe(false);
    });
  });
  it('clears all transport layers when no mode is selected', async () => {
    for (const mode of ['metro', 'rer', 'transilien', 'tram'] as const) store.setMode(mode, false);
    await refresh();

    expect(voronoi.layers).toHaveLength(0);
    expect(routes.layers).toHaveLength(0);
    expect(stations.layers).toHaveLength(0);
  });

  it('does not change layer group visibility when modes change', async () => {
    store.setMode('metro', false);
    await refresh();

    for (const g of [voronoi, routes, stations]) {
      expect(g.remove).not.toHaveBeenCalled();
      expect(g.addTo).toHaveBeenCalledTimes(1); // attached once at creation
    }
  });

  describe('distance tooltip', () => {
    interface RouterCall { url: string; signal: AbortSignal; reply: (body: unknown) => void }
    let calls: RouterCall[];
    let poly: any;
    let site: { lat: number; lon: number };

    beforeEach(() => {
      calls = [];
      (globalThis as any).fetch = jest.fn((url: string, init: { signal: AbortSignal }) => new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => setTimeout(() => reject(new DOMException('Aborted', 'AbortError'))));
        calls.push({ url, signal: init.signal, reply: body => resolve({ ok: true, json: async () => body }) });
      }));
      poly = voronoi.layers[0];
      site = store.sites()[0];
    });

    afterEach(() => {
      delete (globalThis as any).fetch;
    });

    /** A cursor `dLat` degrees north of the cell's station. */
    const cursor = (dLat: number) => ({ latlng: { lat: site.lat + dLat, lng: site.lon } });
    const route = { code: 'Ok', routes: [{ distance: 150, duration: 120 }] };

    it('shows the live straight-line distance at once and no walking route yet', () => {
      poly.handlers['mouseover'](cursor(0.001));

      expect(leaflet.tooltip.html).toMatch(/Direct<\/span><span>110 m<\/span>/);
      expect(leaflet.tooltip.html).toMatch(/By walking<\/span><span>…<\/span>/);
      expect(leaflet.tooltip.html).not.toContain('Closest station');
      expect(calls).toHaveLength(0);
    });

    it('updates the straight-line distance as the cursor moves', () => {
      poly.handlers['mouseover'](cursor(0.001));
      poly.handlers['mousemove'](cursor(0.002));

      expect(leaflet.tooltip.html).toContain('220 m');
    });

    it('keeps the fixed row structure so the tooltip size cannot change', () => {
      poly.handlers['mouseover'](cursor(0.001));

      for (const row of ['parmap-tip-name', 'parmap-tip-badges', 'parmap-voronoi-dist']) {
        expect(leaflet.tooltip.html).toContain(`class="${row}"`);
      }
    });

    it('shows at most 8 badges on a single row and summarises the rest as +N', () => {
      const crowded = store.sites().findIndex(s => s.lines.length > 8);
      expect(crowded).toBeGreaterThanOrEqual(0);

      voronoi.layers[crowded].handlers['mouseover']({ latlng: { lat: store.sites()[crowded].lat, lng: store.sites()[crowded].lon } });

      expect(leaflet.tooltip.html.match(/parmap-line-badge /g)).toHaveLength(8);
      expect(leaflet.tooltip.html).toMatch(/>\+\d+</);
    });

    it('requests the walking route once the cursor pauses and shows it', async () => {
      poly.handlers['mouseover'](cursor(0.001));
      await flush(80);

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toContain(`;${site.lon},${site.lat}`);
      calls[0].reply(route);
      await flush();

      expect(leaflet.tooltip.html).toContain('150 m · 2 min');
    });

    it('sends a single request for a burst of cursor moves', async () => {
      poly.handlers['mouseover'](cursor(0.001));
      for (let i = 2; i <= 6; i++) {
        poly.handlers['mousemove'](cursor(i * 0.001));
        await flush(5);
      }
      await flush(80);

      expect(calls).toHaveLength(1);
      const [, lon, lat] = calls[0].url.match(/foot\/([\d.]+),([\d.]+);/)!.map(Number);
      expect(lat).toBeCloseTo(site.lat + 0.006, 5); // the last cursor position, not an earlier one
      expect(lon).toBeCloseTo(site.lon, 5);
    });

    it('aborts an in-flight route when the cursor moves on and ignores its late answer', async () => {
      poly.handlers['mouseover'](cursor(0.001));
      await flush(80);
      const first = calls[0];

      poly.handlers['mousemove'](cursor(0.004));
      expect(first.signal.aborted).toBe(true);
      first.reply(route);
      await flush();

      expect(leaflet.tooltip.html).not.toContain('150 m · 2 min');
      expect(leaflet.tooltip.html).toContain('445 m');
    });

    it('aborts the route and stops updating when the pointer leaves the cell', async () => {
      poly.handlers['mouseover'](cursor(0.001));
      await flush(80);
      poly.handlers['mouseout']();
      calls[0].reply(route);
      await flush();

      expect(calls[0].signal.aborted).toBe(true);
      expect(leaflet.tooltip.html).not.toContain('150 m · 2 min');
    });

    it('says it is unable to walk when there is no path from the cursor', async () => {
      poly.handlers['mouseover'](cursor(0.001));
      await flush(80);
      calls[0].reply({ code: 'NoSegment' });
      await flush();
      calls[1].reply({ code: 'NoSegment' });
      await flush();

      expect(leaflet.tooltip.html).toMatch(/By walking<\/span><span>Unable to walk from here<\/span>/);
      expect(leaflet.tooltip.html).toMatch(/Direct<\/span><span>110 m<\/span>/);
    });

    it('shows the direct distance and "-" for walking, and sends no request, when the station is too far to route', async () => {
      poly.handlers['mouseover'](cursor(0.4)); // about 44 km
      await flush(80);

      expect(calls).toHaveLength(0);
      expect(leaflet.tooltip.html).toMatch(/Direct<\/span><span>44 km<\/span>/);
      expect(leaflet.tooltip.html).toMatch(/By walking<\/span><span>-<\/span>/);
      expect(leaflet.tooltip.html).not.toContain('Unable to walk');
    });

    it('shows "-" for walking when the router is unavailable, and does not retry right away', async () => {
      (globalThis as any).fetch = jest.fn(() => Promise.reject(new TypeError('offline')));
      poly.handlers['mouseover'](cursor(0.001));
      await flush(80);
      expect(leaflet.tooltip.html).toMatch(/Direct<\/span><span>110 m<\/span>/);
      expect(leaflet.tooltip.html).toMatch(/By walking<\/span><span>-<\/span>/);
      expect(leaflet.tooltip.html).not.toContain('Unable to walk');

      (globalThis as any).fetch.mockClear();
      poly.handlers['mousemove'](cursor(0.003));
      await flush(80);

      expect((globalThis as any).fetch).not.toHaveBeenCalled();
    });

    it('serves a nearby repeat visit from the cache without another request', async () => {
      poly.handlers['mouseover'](cursor(0.001));
      await flush(80);
      calls[0].reply(route);
      await flush();
      poly.handlers['mouseout']();

      poly.handlers['mouseover'](cursor(0.001));
      await flush(80);

      expect(calls).toHaveLength(1);
      expect(leaflet.tooltip.html).toContain('150 m · 2 min');
    });
  });
});
