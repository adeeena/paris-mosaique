import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MapOverlayComponent } from './map-overlay.component';
import { cleanName } from './transport-lines';
import { TransportStore } from './transport-store.service';

const flush = () => new Promise<void>(resolve => setTimeout(resolve));

interface FetchCall {
  url: string;
  signal: AbortSignal;
  respond: (body: unknown, ok?: boolean) => void;
}

/** A fetch whose responses are released by the test; aborting rejects asynchronously like the real one. */
function installFetch(): FetchCall[] {
  const calls: FetchCall[] = [];
  (globalThis as any).fetch = jest.fn((url: string, init: { signal: AbortSignal }) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => setTimeout(() => reject(new DOMException('Aborted', 'AbortError'))));
    calls.push({ url, signal: init.signal, respond: (body, ok = true) => resolve({ ok, json: async () => body }) });
  }));
  return calls;
}

const nominatim = (...names: string[]) =>
  names.map((n, i) => ({ display_name: `${n}, Paris, France`, lat: `48.8${i}`, lon: `2.3${i}` }));

describe('MapOverlayComponent', () => {
  let fixture: ComponentFixture<MapOverlayComponent>;
  let component: MapOverlayComponent;
  let el: HTMLElement;
  let calls: FetchCall[];
  let stationName: string;

  beforeEach(async () => {
    calls = installFetch();
    await TestBed.configureTestingModule({ imports: [MapOverlayComponent] }).compileComponents();
    fixture = TestBed.createComponent(MapOverlayComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    el = fixture.nativeElement;
    stationName = cleanName(TestBed.inject(TransportStore).sites().find(s => s.name)!.name);
  });

  afterEach(() => {
    delete (globalThis as any).fetch;
  });

  const input = () => el.querySelector<HTMLInputElement>('.search-bar input')!;
  const type = (text: string) => {
    input().value = text;
    input().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const press = async (key: string) => {
    input().dispatchEvent(new KeyboardEvent('keydown', { key }));
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
  };
  const labels = () => component.results.map(r => r.label);
  const status = () => el.querySelector('.search-status')?.textContent?.trim();
  const searchAddresses = () => {
    el.querySelector<HTMLButtonElement>('.dropdown-action')!.click();
    fixture.detectChanges();
  };

  it('does not send a geocoding request while typing and shows local station matches', async () => {
    type(stationName);
    await flush();

    expect(calls).toHaveLength(0);
    expect(labels()).toContain(stationName);
  });

  it('activates the transit effect after the Konami sequence', () => {
    const sequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    sequence.forEach(key => document.dispatchEvent(new KeyboardEvent('keydown', { key })));
    fixture.detectChanges();
    const firstEffect = el.querySelector('.konami-effect');

    sequence.forEach(key => document.dispatchEvent(new KeyboardEvent('keydown', { key })));
    fixture.detectChanges();

    expect(el.querySelector('.konami-effect')).not.toBe(firstEffect);
    expect(el.querySelector('.konami-title')?.textContent).toBe('Transit Overdrive');
  });

  it('does not activate the transit effect while typing in the search field', () => {
    const sequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    sequence.forEach(key => input().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
    fixture.detectChanges();

    expect(el.querySelector('.konami-effect')).toBeNull();
  });

  it('finds a station by one of its aliases and says which alias matched', () => {
    const site = TestBed.inject(TransportStore).sites().find(s => s.name === 'Saint-Lazare')!;
    expect(site.aliases).toContain('Haussmann - Saint-Lazare');

    type('haussmann');

    const result = component.results.find(r => r.label === 'Saint-Lazare')!;
    expect(result.alias).toBe('Haussmann - Saint-Lazare');
    expect(el.querySelector('.item-alias')?.textContent).toContain('Haussmann - Saint-Lazare');
  });

  it('does not show an alias when the query matches the station name itself', () => {
    type('saint-lazare');
    expect(component.results.find(r => r.label === 'Saint-Lazare')!.alias).toBeUndefined();
  });

  it('geocodes once on Enter when there are no local matches and selects the first result', async () => {
    type('12 rue inexistante');
    await press('Enter');

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('nominatim.openstreetmap.org');
    calls[0].respond(nominatim('12 Rue Inexistante'));
    await flush();

    expect(component.searchQuery).toBe('12 Rue Inexistante, Paris');
    expect(calls).toHaveLength(1);
  });

  it('answers a repeated query from the cache without a new request', async () => {
    type('rue du cache');
    searchAddresses();
    calls[0].respond(nominatim('Rue du Cache'));
    await flush();

    type('Rue du  CACHE');
    searchAddresses();
    await flush();

    expect(calls).toHaveLength(1);
    expect(labels()).toEqual(['Rue du Cache, Paris']);
  });

  it('aborts a superseded request and ignores its late response', async () => {
    type('first query');
    searchAddresses();
    const first = calls[0];

    type('second query');
    searchAddresses();
    expect(first.signal.aborted).toBe(true);
    calls[1].respond(nominatim('Second Result'));
    await flush();
    first.respond(nominatim('Stale Result'));
    await flush();

    expect(labels()).toEqual(['Second Result, Paris']);
  });

  it('does not let an older response replace the results of a newer, completed query', async () => {
    type('older');
    searchAddresses();
    const older = calls[0];
    type('newer');
    searchAddresses();
    calls[1].respond(nominatim('Newer Hit'));
    await flush();

    older.respond(nominatim('Older Hit'));
    await flush();
    fixture.detectChanges();

    expect(labels()).toEqual(['Newer Hit, Paris']);
  });

  it('keeps the results cleared when the user clears the field while a request is pending', async () => {
    type('pending query');
    searchAddresses();
    expect(component.isSearching).toBe(true);

    el.querySelector<HTMLButtonElement>('.clear-btn')!.click();
    fixture.detectChanges();
    expect(calls[0].signal.aborted).toBe(true);
    calls[0].respond(nominatim('Late Result'));
    await flush();
    fixture.detectChanges();

    expect(component.results).toEqual([]);
    expect(component.showDropdown).toBe(false);
    expect(component.isSearching).toBe(false);
    expect(el.querySelector('.search-dropdown')).toBeNull();
  });

  it('keeps the results cleared after Escape while a request is pending', async () => {
    type('another pending');
    await press('Enter');
    await press('Escape');
    calls[0].respond(nominatim('Late Result'));
    await flush();

    expect(component.results).toEqual([]);
    expect(component.searchQuery).toBe('');
  });

  it('says so when neither stations nor addresses match', async () => {
    type('zzzz nothing');
    searchAddresses();
    calls[0].respond([]);
    await flush();
    fixture.detectChanges();

    expect(component.searchStatus).toBe('no-results');
    expect(status()).toBe('No results found');
  });

  it('reports unavailable geocoding while keeping local station matches', async () => {
    type(stationName);
    el.querySelector<HTMLButtonElement>('.dropdown-action')!.click();
    fixture.detectChanges();
    calls[0].respond({}, false);
    await flush();
    fixture.detectChanges();

    expect(component.searchStatus).toBe('unavailable');
    expect(status()).toBe('Address search is temporarily unavailable');
    expect(labels()).toContain(stationName);
  });

  it('reports unavailable geocoding on a network failure', async () => {
    // Reject asynchronously: an already-rejected promise is reported by zone.js before `await` attaches its handler.
    (globalThis as any).fetch = jest.fn(() => new Promise((_, reject) => setTimeout(() => reject(new TypeError('Failed to fetch')))));
    type('network down');
    searchAddresses();
    await flush();
    await flush();
    fixture.detectChanges();

    expect(status()).toBe('Address search is temporarily unavailable');
  });

  it('shows address results next to local station matches without duplicating them', async () => {
    type(stationName);
    el.querySelector<HTMLButtonElement>('.dropdown-action')!.click();
    fixture.detectChanges();
    calls[0].respond(nominatim('Some Street'));
    await flush();

    expect(labels()[0]).toBe(stationName);
    expect(labels()).toContain('Some Street, Paris');
    expect(component.searchStatus).toBe('idle');
  });
});
