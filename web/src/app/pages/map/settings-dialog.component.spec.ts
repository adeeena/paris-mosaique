import { ComponentFixture, TestBed } from '@angular/core/testing';
import { setLanguage } from '../../i18n';
import { SettingsService } from '../../settings.service';
import { DEFUNCT_STATIONS } from './defunct-stations';
import { SettingsDialogComponent } from './settings-dialog.component';
import { EXTRA_LOADER, TransportStore } from './transport-store.service';

const flush = () => new Promise<void>(resolve => setTimeout(resolve));

const fakeGroup = () => ({ addTo: jest.fn(), remove: jest.fn() });

describe('SettingsDialogComponent', () => {
  let fixture: ComponentFixture<SettingsDialogComponent>;
  let el: HTMLElement;
  let store: TransportStore;
  let settings: SettingsService;
  let loader: jest.Mock;
  let groups: { voronoi: ReturnType<typeof fakeGroup>; routes: ReturnType<typeof fakeGroup>; stations: ReturnType<typeof fakeGroup> };

  const create = async () => {
    await TestBed.configureTestingModule({
      imports: [SettingsDialogComponent],
      providers: [{ provide: EXTRA_LOADER, useValue: loader }]
    }).compileComponents();
    fixture = TestBed.createComponent(SettingsDialogComponent);
    store = TestBed.inject(TransportStore);
    settings = TestBed.inject(SettingsService);
    fixture.detectChanges();
    el = fixture.nativeElement;
  };

  const refresh = async () => {
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
  };

  const open = async (tab?: 'appearance' | 'layers' | 'language') => {
    settings.openDialog(tab);
    await refresh();
  };

  beforeEach(() => {
    localStorage.clear();
    loader = jest.fn().mockResolvedValue({ IDF_EXTRA_STATIONS: [], IDF_EXTRA_STATION_LINES: [], IDF_EXTRA_ROUTES: [] });
    groups = { voronoi: fakeGroup(), routes: fakeGroup(), stations: fakeGroup() };
    (window as any)._parmap_map = {};
    (window as any)._parmap_layers = groups;
  });

  afterEach(() => {
    delete (window as any)._parmap_map;
    delete (window as any)._parmap_layers;
    delete (window as any).matchMedia;
    setLanguage('en');
    delete document.documentElement.dataset['theme'];
  });

  const row = (label: string) =>
    Array.from(el.querySelectorAll<HTMLLabelElement>('.choice-row')).find(r => r.textContent?.trim().startsWith(label))!;
  const input = (label: string) => row(label).querySelector<HTMLInputElement>('input')!;
  const choose = async (label: string, checked = true) => {
    const control = input(label);
    control.checked = checked;
    control.dispatchEvent(new Event('change'));
    await refresh();
  };
  const tabs = () => Array.from(el.querySelectorAll<HTMLButtonElement>('[role=tab]'));
  const stored = () => JSON.parse(localStorage.getItem('parmap.settings') ?? '{}');

  describe('the popup', () => {
    beforeEach(create);

    it('is not in the page until it is opened', () => {
      expect(el.querySelector('[role=dialog]')).toBeNull();
    });

    it('opens as a modal dialog with a tab for appearance, layers and language', async () => {
      await open();

      expect(el.querySelector('[role=dialog]')?.getAttribute('aria-modal')).toBe('true');
      expect(tabs().map(tab => tab.textContent?.trim())).toEqual(['Appearance', 'Layers', 'Language']);
      expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
      expect(el.querySelector('h2')?.textContent).toBe('Appearance');
    });

    it('shows the panel and the title of the tab that is clicked', async () => {
      await open();
      tabs()[1].click();
      await refresh();

      expect(tabs()[1].getAttribute('aria-selected')).toBe('true');
      expect(el.querySelector('h2')?.textContent).toBe('Layers');
      expect(row('Voronoi')).toBeDefined();
    });

    it('closes with the close button, with Escape and with a click beside the popup, but not inside it', async () => {
      await open();
      el.querySelector<HTMLButtonElement>('.dialog-close')!.click();
      await refresh();
      expect(el.querySelector('[role=dialog]')).toBeNull();

      await open();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await refresh();
      expect(el.querySelector('[role=dialog]')).toBeNull();

      await open();
      el.querySelector<HTMLElement>('.dialog')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await refresh();
      expect(el.querySelector('[role=dialog]')).not.toBeNull();
      el.querySelector<HTMLElement>('.dialog-scrim')!.dispatchEvent(new MouseEvent('mousedown'));
      await refresh();
      expect(el.querySelector('[role=dialog]')).toBeNull();
    });

    it('takes the keyboard focus when it opens', async () => {
      await open();
      expect(document.activeElement).toBe(el.querySelector('[role=dialog]'));
    });
  });

  describe('Appearance', () => {
    beforeEach(create);

    it('offers light, dark and "sync with device", following the device by default', async () => {
      await open();

      expect(['Light mode', 'Dark mode', 'Sync with device'].map(l => input(l).checked)).toEqual([false, false, true]);
    });

    it('applies the chosen theme to the page and remembers it', async () => {
      await open();
      await choose('Dark mode');
      expect(document.documentElement.dataset['theme']).toBe('dark');
      expect(stored().theme).toBe('dark');

      await choose('Light mode');
      expect(document.documentElement.dataset['theme']).toBe('light');
    });

    it('follows the device when synced', async () => {
      let listener: (e: { matches: boolean }) => void = () => undefined;
      (window as any).matchMedia = jest.fn(() => ({
        matches: true,
        addEventListener: (_: string, fn: typeof listener) => { listener = fn; }
      }));
      TestBed.resetTestingModule();
      await create();
      await open();
      expect(settings.resolvedTheme()).toBe('dark');

      listener({ matches: false });
      expect(settings.resolvedTheme()).toBe('light');
      await choose('Dark mode');
      listener({ matches: false });
      expect(settings.resolvedTheme()).toBe('dark');
    });

    it('toggles the legend, off by default', async () => {
      await open();
      expect(input('Show legend').checked).toBe(false);

      await choose('Show legend');
      expect(settings.legend()).toBe(true);
      expect(stored().legend).toBe(true);
    });
  });

  describe('Layers', () => {
    beforeEach(async () => {
      await create();
      await open('layers');
    });

    it('lists the visible transport modes with only the rail modes selected, and no Bus or Other', () => {
      const labels = ['Metro', 'RER', 'Transilien', 'Tram', 'Cable car'];
      expect(labels.map(l => input(l).checked)).toEqual([true, true, true, true, false]);
      expect(row('Bus')).toBeUndefined();
      expect(row('Other')).toBeUndefined();
    });

    it('updates the store when a mode is toggled and loads extra data for non-rail modes', async () => {
      await choose('Tram', false);
      expect(store.modes().has('tram')).toBe(false);
      expect(loader).not.toHaveBeenCalled();

      await choose('Cable car');
      expect(store.modes().has('cable_car')).toBe(true);
      expect(loader).toHaveBeenCalledTimes(1);
    });

    it('shows a status message when loading extra data fails', async () => {
      // Reject asynchronously: an already-rejected promise is reported by zone.js before `await` attaches its handler.
      loader.mockImplementation(() => new Promise((_, reject) => setTimeout(() => reject(new Error('offline')))));
      await choose('Cable car');
      expect(el.querySelector('.panel-note--error')?.textContent).toContain('Could not load');
    });

    it('changing modes does not alter the visibility toggles or the layer groups', async () => {
      await choose('Metro', false);
      await choose('Cable car');

      expect(fixture.componentInstance.showVoronoi).toBe(true);
      expect(fixture.componentInstance.showLines).toBe(true);
      expect(fixture.componentInstance.showStations).toBe(true);
      for (const g of Object.values(groups)) {
        expect(g.addTo).not.toHaveBeenCalled();
        expect(g.remove).not.toHaveBeenCalled();
      }
    });

    it('hiding one visual layer leaves the other layers and the selected modes unchanged', async () => {
      const modesBefore = [...store.modes()].sort();
      await choose('Lines', false);

      expect(groups.routes.remove).toHaveBeenCalledTimes(1);
      expect(groups.voronoi.remove).not.toHaveBeenCalled();
      expect(groups.stations.remove).not.toHaveBeenCalled();
      expect([...store.modes()].sort()).toEqual(modesBefore);

      await choose('Lines');
      expect(groups.routes.addTo).toHaveBeenCalledTimes(1);
    });

    it('keeps the layer choices while the popup is closed and opened again', async () => {
      await choose('Lines', false);
      settings.closeDialog();
      await refresh();
      await open('layers');

      expect(input('Lines').checked).toBe(false);
    });

    it('offers defunct stations, off by default, as stations of the Voronoi rather than as a layer', async () => {
      expect(input('Defunct stations').checked).toBe(false);
      const withoutDefunct = store.sites().length;

      await choose('Defunct stations');
      expect(store.defunctShown()).toBe(true);
      expect(store.sites().length).toBe(withoutDefunct + DEFUNCT_STATIONS.length);
      for (const g of Object.values(groups)) {
        expect(g.addTo).not.toHaveBeenCalled();
        expect(g.remove).not.toHaveBeenCalled();
      }

      await choose('Defunct stations', false);
      expect(store.sites().length).toBe(withoutDefunct);
    });
  });

  describe('Language', () => {
    beforeEach(async () => {
      await create();
      await open('language');
    });

    it('offers English, French and Hungarian, each in its own language', () => {
      expect(Array.from(el.querySelectorAll('.choice-row')).map(r => r.textContent?.trim()))
        .toEqual(['English', 'Français', 'Magyar']);
      expect(input('English').checked).toBe(true);
    });

    it('switches the texts of the popup, the page language and what is remembered', async () => {
      await choose('Français');

      expect(el.querySelector('h2')?.textContent).toBe('Langue');
      expect(tabs().map(tab => tab.textContent?.trim())).toEqual(['Apparence', 'Calques', 'Langue']);
      expect(document.documentElement.lang).toBe('fr');
      expect(stored().language).toBe('fr');

      await choose('Magyar');
      expect(el.querySelector('h2')?.textContent).toBe('Nyelv');
    });

    it('starts in the saved language, else in the browser language when it is one of the three', async () => {
      localStorage.setItem('parmap.settings', JSON.stringify({ language: 'hu' }));
      TestBed.resetTestingModule();
      await create();
      expect(settings.language()).toBe('hu');

      localStorage.clear();
      TestBed.resetTestingModule();
      jest.spyOn(navigator, 'language', 'get').mockReturnValue('fr-FR');
      await create();
      expect(settings.language()).toBe('fr');
      jest.restoreAllMocks();
    });
  });
});
