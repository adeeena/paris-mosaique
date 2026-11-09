import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MapLegendComponent } from './map-legend.component';
import { SettingsService } from '../../settings.service';
import { setLanguage } from '../../i18n';
import { TransportStore } from './transport-store.service';

describe('MapLegendComponent', () => {
  let fixture: ComponentFixture<MapLegendComponent>;
  let el: HTMLElement;
  let settings: SettingsService;
  let store: TransportStore;

  const rows = () => Array.from(el.querySelectorAll('.legend-row')).map(r => r.querySelector('.legend-label')?.textContent?.trim());
  const refresh = () => fixture.detectChanges();

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({ imports: [MapLegendComponent] }).compileComponents();
    fixture = TestBed.createComponent(MapLegendComponent);
    settings = TestBed.inject(SettingsService);
    store = TestBed.inject(TransportStore);
    el = fixture.nativeElement;
    refresh();
  });

  afterEach(() => setLanguage('en'));

  it('is hidden until the legend is switched on', () => {
    expect(el.querySelector('.legend')).toBeNull();

    settings.setLegend(true);
    refresh();
    expect(el.querySelector('.legend')).not.toBeNull();
  });

  it('shows the line colours of the selected modes, then the station marker and the cell', () => {
    settings.setLegend(true);
    refresh();

    expect(rows()).toEqual(['Metro', 'RER', 'Transilien', 'Tram', 'Station', 'Area closest to a station']);
    const metro = el.querySelector<HTMLElement>('.legend-row .parmap-line-badge--metro')!;
    expect(metro.textContent).toBe('1');
    expect(metro.style.background).not.toBe('');
    expect(el.querySelector('.legend-station.parmap-transport-x-icon > span')?.textContent).toBe('✖');
  });

  it('follows the selected modes and the defunct stations', () => {
    settings.setLegend(true);
    store.setMode('metro', false);
    store.setDefunct(true);
    refresh();

    expect(rows()).toEqual(['RER', 'Transilien', 'Tram', 'Station', 'Closed station', 'Area closest to a station']);
  });

  it('is in the chosen language', () => {
    settings.setLegend(true);
    settings.setLanguage('fr');
    refresh();

    expect(el.querySelector('.legend-title')?.textContent).toBe('Légende');
    expect(rows()[0]).toBe('Métro');
  });
});
