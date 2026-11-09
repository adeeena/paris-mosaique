import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AppComponent } from './app.component';
import { routes } from './app.routes';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it(`should have the 'Paris Mosaïque' title`, () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.title).toEqual('Paris Mosaïque');
  });

  it('should route the root path to the map with its three layers', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/');
    const el = harness.routeNativeElement as HTMLElement;
    expect(el.querySelector('app-map-layer')).not.toBeNull();
    expect(el.querySelector('app-map-transport-layer')).not.toBeNull();
    expect(el.querySelector('app-map-overlay')).not.toBeNull();
  });
});
