import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GEOLOCATION } from './browser-location';
import { MapOverlayComponent } from './map-overlay.component';

describe('MapOverlayComponent locate button', () => {
  let fixture: ComponentFixture<MapOverlayComponent>;
  let el: HTMLElement;
  let geo: { getCurrentPosition: jest.Mock };

  const button = () => el.querySelector<HTMLButtonElement>('.locate-btn')!;
  const refresh = () => { fixture.detectChanges(); };

  beforeEach(async () => {
    geo = { getCurrentPosition: jest.fn() };
    await TestBed.configureTestingModule({
      imports: [MapOverlayComponent],
      providers: [{ provide: GEOLOCATION, useValue: geo }]
    }).compileComponents();
    fixture = TestBed.createComponent(MapOverlayComponent);
    fixture.detectChanges();
    el = fixture.nativeElement;
  });

  it('sits next to the cogwheel, before it in the page', () => {
    const settings = el.querySelector('.settings-btn')!;
    expect(button()).not.toBeNull();
    expect(button().compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('is labelled for screen readers', () => {
    expect(button().getAttribute('aria-label')).toBe('Show my location');
  });

  it('asks for the location when clicked and shows that it is working', () => {
    button().click();
    refresh();

    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(button().classList).toContain('locating');
    expect(button().disabled).toBe(true);
  });

  it('is enabled again after the browser answers', () => {
    geo.getCurrentPosition.mockImplementation((_ok: unknown, err: (e: unknown) => void) => err({ code: 1 }));
    button().click();
    refresh();

    expect(button().disabled).toBe(false);
    expect(button().classList).not.toContain('locating');
  });

  it('shows why it failed, as an alert', () => {
    geo.getCurrentPosition.mockImplementation((_ok: unknown, err: (e: unknown) => void) => err({ code: 1 }));
    button().click();
    refresh();

    const status = el.querySelector('.locate-status')!;
    expect(status.getAttribute('role')).toBe('alert');
    expect(status.textContent).toContain('Location permission was denied');
  });

  it('shows no message before anything has happened', () => {
    expect(el.querySelector('.locate-status')).toBeNull();
  });
});
