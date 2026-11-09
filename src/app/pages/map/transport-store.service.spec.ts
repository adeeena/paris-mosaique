import { TestBed } from '@angular/core/testing';
import { IDF_STATIONS } from './idf-datapoints';
import type { RawExtraModule } from './transport-data';
import { EXTRA_LOADER, TransportStore } from './transport-store.service';

const fakeExtra: RawExtraModule = {
  IDF_EXTRA_STATIONS: [{ lat: 48.87, lon: 2.37, name: 'Gamma', lines: [{ ref: '4', mode: 'bus' }] }],
  IDF_EXTRA_STATION_LINES: [{ station: 0, lines: [{ ref: '4', mode: 'bus' }] }],
  IDF_EXTRA_ROUTES: [{ ref: '4', mode: 'bus', coords: [[48.85, 2.35], [48.87, 2.37]] }]
};

const flush = () => new Promise<void>(resolve => setTimeout(resolve));

function createStore(loader: () => Promise<RawExtraModule>) {
  TestBed.configureTestingModule({ providers: [{ provide: EXTRA_LOADER, useValue: loader }] });
  return TestBed.inject(TransportStore);
}

describe('TransportStore', () => {
  it('starts with the rail modes only and does not load the extra data', () => {
    const loader = jest.fn().mockResolvedValue(fakeExtra);
    const store = createStore(loader);

    expect([...store.modes()].sort()).toEqual(['metro', 'rer', 'tram', 'transilien']);
    expect(store.sites()).toHaveLength(IDF_STATIONS.length);
    expect(store.routes().every(r => ['metro', 'rer', 'tram', 'transilien'].includes(r.mode))).toBe(true);
    expect(store.extraStatus()).toBe('idle');
    expect(loader).not.toHaveBeenCalled();
  });

  it('removes a deselected rail mode from sites and routes without loading extra data', () => {
    const loader = jest.fn().mockResolvedValue(fakeExtra);
    const store = createStore(loader);
    store.setMode('metro', false);

    expect(store.sites().every(s => s.lines.every(l => l.mode !== 'metro'))).toBe(true);
    expect(store.routes().some(r => r.mode === 'metro')).toBe(false);
    expect(loader).not.toHaveBeenCalled();
  });

  it('shows nothing when every mode is deselected', () => {
    const store = createStore(jest.fn());
    for (const mode of ['metro', 'rer', 'transilien', 'tram'] as const) store.setMode(mode, false);

    expect(store.sites()).toEqual([]);
    expect(store.routes()).toEqual([]);
  });

  it('loads the extra data once when a non-rail mode is first selected', async () => {
    const loader = jest.fn().mockResolvedValue(fakeExtra);
    const store = createStore(loader);

    store.setMode('bus', true);
    expect(store.extraStatus()).toBe('loading');
    store.setMode('cable_car', true);
    await flush();

    expect(loader).toHaveBeenCalledTimes(1);
    expect(store.extraStatus()).toBe('ready');
    expect(store.sites().some(s => s.name === 'Gamma')).toBe(true);
    expect(store.routes().some(r => r.mode === 'bus')).toBe(true);
  });

  it('keeps rail data usable when the extra data fails to load', async () => {
    const store = createStore(jest.fn().mockRejectedValue(new Error('chunk failed')));
    store.setMode('bus', true);
    await flush();

    expect(store.extraStatus()).toBe('error');
    expect(store.sites()).toHaveLength(IDF_STATIONS.length);
  });

  it('retries loading after a failure', async () => {
    const loader = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(fakeExtra);
    const store = createStore(loader);

    store.setMode('bus', true);
    await flush();
    store.setMode('other', true);
    await flush();

    expect(loader).toHaveBeenCalledTimes(2);
    expect(store.extraStatus()).toBe('ready');
  });
});
