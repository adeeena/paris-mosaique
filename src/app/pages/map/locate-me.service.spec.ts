import { TestBed } from '@angular/core/testing';
import { GEOLOCATION, locateMessage } from './browser-location';
import { LocateMeService } from './locate-me.service';
import { EXTRA_LOADER, TransportStore } from './transport-store.service';

const flush = (ms = 0) => new Promise<void>(resolve => setTimeout(resolve, ms));

interface RouterCall { url: string; signal: AbortSignal; reply: (body: unknown) => void }

function fakeLeaflet() {
  const markers: any[] = [];
  const circles: any[] = [];
  const marker = (latLng: [number, number]) => {
    const m: any = {
      latLng, content: '' as string, options: undefined as any, open: false, removed: false,
      addTo: jest.fn(() => m),
      bindPopup: jest.fn((html: string, options: unknown) => { m.content = html; m.options = options; return m; }),
      setPopupContent: jest.fn((html: string) => { m.content = html; return m; }),
      openPopup: jest.fn(() => { m.open = true; return m; }),
      remove: jest.fn(() => { m.removed = true; })
    };
    markers.push(m);
    return m;
  };
  const circle = (latLng: [number, number], options: any) => {
    const c: any = { latLng, options, removed: false, addTo: jest.fn(() => c), remove: jest.fn(() => { c.removed = true; }) };
    circles.push(c);
    return c;
  };
  return { markers, circles, L: { marker: jest.fn(marker), circle: jest.fn(circle), divIcon: jest.fn((o: unknown) => o) } };
}

describe('LocateMeService', () => {
  let service: LocateMeService;
  let store: TransportStore;
  let geo: { getCurrentPosition: jest.Mock };
  let leaflet: ReturnType<typeof fakeLeaflet>;
  let map: { flyTo: jest.Mock; getZoom: jest.Mock };
  let selectByLatLon: jest.Mock;
  let calls: RouterCall[];

  const succeed = (lat: number, lon: number, accuracy = 20) =>
    geo.getCurrentPosition.mockImplementation((ok: (p: unknown) => void) => ok({ coords: { latitude: lat, longitude: lon, accuracy } }));
  const fail = (code: number) =>
    geo.getCurrentPosition.mockImplementation((_ok: unknown, err: (e: unknown) => void) => err({ code }));

  /** A spot a few metres from the first rail station, so the expected station is known. */
  const stationSpot = () => {
    const s = store.sites()[0];
    return { site: s, lat: s.lat + 0.0002, lon: s.lon };
  };

  beforeEach(() => {
    geo = { getCurrentPosition: jest.fn() };
    leaflet = fakeLeaflet();
    map = { flyTo: jest.fn(), getZoom: jest.fn(() => 12) };
    selectByLatLon = jest.fn();
    calls = [];
    (window as any).L = leaflet.L;
    (window as any)._parmap_map = map;
    (window as any)._parmap_layers = { selectByLatLon };
    (globalThis as any).fetch = jest.fn((url: string, init: { signal: AbortSignal }) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => setTimeout(() => reject(new DOMException('Aborted', 'AbortError'))));
      calls.push({ url, signal: init.signal, reply: body => resolve({ ok: true, json: async () => body }) });
    }));

    TestBed.configureTestingModule({
      providers: [
        { provide: GEOLOCATION, useValue: geo },
        { provide: EXTRA_LOADER, useValue: () => Promise.resolve({ IDF_EXTRA_STATIONS: [], IDF_EXTRA_STATION_LINES: [], IDF_EXTRA_ROUTES: [] }) }
      ]
    });
    service = TestBed.inject(LocateMeService);
    store = TestBed.inject(TransportStore);
  });

  afterEach(() => {
    delete (window as any).L;
    delete (window as any)._parmap_map;
    delete (window as any)._parmap_layers;
    delete (globalThis as any).fetch;
  });

  it('asks the browser once, with a high-accuracy request and a timeout', () => {
    service.locate();

    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(geo.getCurrentPosition.mock.calls[0][2]).toMatchObject({ enableHighAccuracy: true, timeout: 10000 });
    expect(service.locating()).toBe(true);
  });

  it('ignores another click while a position is being requested', () => {
    service.locate();
    service.locate();
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  describe('problems', () => {
    it.each([
      [1, 'denied'],
      [2, 'unavailable'],
      [3, 'timeout']
    ] as const)('shows a message for geolocation error %d', (code, problem) => {
      fail(code);
      service.locate();

      expect(service.locating()).toBe(false);
      expect(service.message()).toBe(locateMessage(problem));
      expect(leaflet.markers).toHaveLength(0);
    });

    it('explains that location is not supported when the browser has no geolocation', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [{ provide: GEOLOCATION, useValue: null }] });
      const unsupported = TestBed.inject(LocateMeService);

      unsupported.locate();

      expect(unsupported.message()).toBe(locateMessage('unsupported'));
      expect(unsupported.locating()).toBe(false);
    });

    it('says so, and shows no point, when the position is outside the map', () => {
      succeed(51.5, -0.12); // London
      service.locate();

      expect(service.message()).toBe(locateMessage('outside'));
      expect(leaflet.markers).toHaveLength(0);
      expect(map.flyTo).not.toHaveBeenCalled();
    });

    it('clears the message after a while and on the next attempt', () => {
      jest.useFakeTimers();
      fail(1);
      service.locate();
      expect(service.message()).not.toBeNull();

      jest.advanceTimersByTime(6100);
      expect(service.message()).toBeNull();

      fail(2);
      service.locate();
      succeed(48.86, 2.35);
      service.locate();
      expect(service.message()).toBeNull();
      jest.useRealTimers();
    });
  });

  describe('success', () => {
    it('places the point, an accuracy circle, and flies to the position', () => {
      const { lat, lon } = stationSpot();
      succeed(lat, lon, 35);
      service.locate();

      expect(service.locating()).toBe(false);
      expect(service.message()).toBeNull();
      expect(leaflet.markers).toHaveLength(1);
      expect(leaflet.markers[0].latLng).toEqual([lat, lon]);
      expect(leaflet.markers[0].open).toBe(true);
      expect(leaflet.circles[0].options.radius).toBe(35);
      expect(map.flyTo).toHaveBeenCalledWith([lat, lon], 15, expect.any(Object));
    });

    it('keeps the current zoom when it is already closer than 15', () => {
      map.getZoom.mockReturnValue(17);
      const { lat, lon } = stationSpot();
      succeed(lat, lon);
      service.locate();
      expect(map.flyTo.mock.calls[0][1]).toBe(17);
    });

    it('highlights the Voronoi cell of the position', () => {
      const { lat, lon } = stationSpot();
      succeed(lat, lon);
      service.locate();
      expect(selectByLatLon).toHaveBeenCalledWith(lat, lon);
    });

    it('draws no accuracy circle for a coarse fix', () => {
      const { lat, lon } = stationSpot();
      succeed(lat, lon, 8000);
      service.locate();
      expect(leaflet.circles).toHaveLength(0);
      expect(leaflet.markers).toHaveLength(1);
    });

    it('uses the same card as the tooltip: name, badges and both distances, in a fixed-size popup', () => {
      const { site, lat, lon } = stationSpot();
      succeed(lat, lon);
      service.locate();

      const popup = leaflet.markers[0];
      expect(popup.content).not.toContain('Closest station');
      expect(popup.content).toContain(site.name.replace(/\s*\([^)]*\)\s*$/, ''));
      expect(popup.content).toContain('parmap-line-badge');
      expect(popup.content).toContain('Direct');
      expect(popup.content).toContain('By walking');
      expect(popup.options).toMatchObject({ className: 'parmap-station-popup', closeButton: false, autoPan: false, minWidth: 219, maxWidth: 219 });
    });

    it('shows the straight-line distance to the closest station at once', () => {
      const { lat, lon } = stationSpot();
      succeed(lat, lon);
      service.locate();
      expect(leaflet.markers[0].content).toContain('20 m'); // 0.0002 degrees of latitude
    });

    it('fills in the walking route when it arrives', async () => {
      const { lat, lon } = stationSpot();
      succeed(lat, lon);
      service.locate();
      expect(leaflet.markers[0].content).toMatch(/Direct<\/span><span>20 m<\/span>/);
      expect(leaflet.markers[0].content).toMatch(/By walking<\/span><span>…<\/span>/);

      calls[0].reply({ code: 'Ok', routes: [{ distance: 31, duration: 25 }] });
      await flush();
      expect(leaflet.markers[0].content).toContain('30 m · &lt; 1 min');
    });

    it('says it is unable to walk when there is no walkable way near the position', async () => {
      const { lat, lon } = stationSpot();
      succeed(lat, lon);
      service.locate();
      await flush();
      const activeCall = () => calls.filter(call => !call.signal.aborted).slice(-1)[0];
      activeCall()!.reply({ code: 'NoSegment' });
      await flush();
      const fallbackCall = activeCall();
      expect(fallbackCall?.url).toContain('radiuses=500;150');
      fallbackCall!.reply({ code: 'NoSegment' });
      await flush();
      expect(leaflet.markers[0].content).toMatch(/By walking<\/span><span>Unable to walk from here<\/span>/);
    });

    it('does not route to a station that is too far away', () => {
      // The map's south-west corner is about 67 km from the closest rail station.
      succeed(48.01, 1.51);
      service.locate();

      expect(calls).toHaveLength(0);
      expect(leaflet.markers[0].content).toContain('km');
      expect(leaflet.markers[0].content).toMatch(/By walking<\/span><span>-<\/span>/);
    });

    it('replaces the previous point and circle on a second locate', () => {
      const { lat, lon } = stationSpot();
      succeed(lat, lon);
      service.locate();
      service.locate();

      expect(leaflet.markers).toHaveLength(2);
      expect(leaflet.markers[0].removed).toBe(true);
      expect(leaflet.circles[0].removed).toBe(true);
      expect(leaflet.markers[1].removed).toBe(false);
    });

    it('ignores a late walking answer after the card has been refreshed', async () => {
      const { lat, lon } = stationSpot();
      succeed(lat, lon);
      service.locate();
      const first = calls[0];

      service.locate();
      first.reply({ code: 'Ok', routes: [{ distance: 999, duration: 999 }] });
      await flush();

      expect(leaflet.markers[0].content).not.toContain('999');
    });
  });

  describe('selected modes', () => {
    it('follows the selected modes: the closest station changes when its mode is deselected', async () => {
      const { site, lat, lon } = stationSpot();
      succeed(lat, lon);
      service.locate();
      const before = leaflet.markers[0].content;

      for (const line of site.lines) store.setMode(line.mode, false);
      TestBed.tick();
      await flush();

      expect(leaflet.markers[0].content).not.toBe(before);
    });

    it('says there is no station when no mode is selected', async () => {
      const { lat, lon } = stationSpot();
      succeed(lat, lon);
      service.locate();

      for (const mode of ['metro', 'rer', 'transilien', 'tram'] as const) store.setMode(mode, false);
      TestBed.tick();
      await flush();

      expect(leaflet.markers[0].content).toContain('No station in the selected modes');
    });
  });
});
