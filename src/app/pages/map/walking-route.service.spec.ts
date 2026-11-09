import { TestBed } from '@angular/core/testing';
import { haversineM } from './distance';
import { WalkingRouteService } from './walking-route.service';

const from = { lat: 48.8566, lon: 2.3522 };
const to = { lat: 48.8584, lon: 2.347 };

const answer = (body: unknown) => Promise.resolve({ ok: true, json: async () => body });
const okRoute = { code: 'Ok', routes: [{ distance: 478.5, duration: 385.3 }] };

describe('WalkingRouteService', () => {
  let service: WalkingRouteService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (globalThis as any).fetch = fetchMock;
    service = TestBed.inject(WalkingRouteService);
  });

  afterEach(() => {
    delete (globalThis as any).fetch;
  });

  const route = (f = from, t = to) => service.route(f, t, new AbortController().signal);

  it('returns the walking distance and duration from the router', async () => {
    fetchMock.mockReturnValue(answer(okRoute));
    expect(await route()).toEqual({ meters: 478.5, seconds: 385.3 });
  });

  it('asks the pedestrian router with a tight snap on the cursor side', async () => {
    fetchMock.mockReturnValue(answer(okRoute));
    await route();
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/routed-foot/route/v1/foot/2.3522,48.8566;2.347,48.8584');
    expect(url).toContain('radiuses=30;150');
  });

  it('answers a repeated or nearly identical query from the cache', async () => {
    fetchMock.mockReturnValue(answer(okRoute));
    await route();
    await route({ lat: 48.85662, lon: 2.35221 }, to);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports "none" when no walkable way is near the cursor, and caches it', async () => {
    fetchMock.mockReturnValue(answer({ code: 'NoSegment' }));
    expect(await route()).toBe('none');
    expect(await route()).toBe('none');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain('radiuses=500;150');
  });

  it('reports "none" when the points cannot be connected', async () => {
    fetchMock.mockReturnValue(answer({ code: 'NoRoute' }));
    expect(await route()).toBe('none');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries from a farther road and includes the straight-line access leg', async () => {
    const snappedPoint = { lat: 48.8568, lon: 2.3524 };
    fetchMock
      .mockReturnValueOnce(answer({ code: 'NoSegment' }))
      .mockReturnValueOnce(answer({
        ...okRoute,
        waypoints: [{ location: [snappedPoint.lon, snappedPoint.lat] }, { location: [to.lon, to.lat] }]
      }));

    const result = await route();
    const accessMeters = haversineM(from, snappedPoint);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('radiuses=30;150');
    expect(fetchMock.mock.calls[1][0]).toContain('radiuses=500;150');
    expect(result).toEqual({
      meters: expect.any(Number),
      seconds: expect.any(Number)
    });
    if (!result || typeof result === 'string') throw new Error('Expected a walking route');
    expect(result.meters).toBeCloseTo(okRoute.routes[0].distance + accessMeters, 2);
    expect(result.seconds).toBeCloseTo(okRoute.routes[0].duration + accessMeters / 1.4, 2);
  });

  it('reports "unavailable" on a failure and does not retry during the cool-off', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await route()).toBe('unavailable');
    fetchMock.mockClear();

    expect(await route({ lat: 48.86, lon: 2.36 }, to)).toBe('unavailable');
    expect(service.peek({ lat: 48.87, lon: 2.37 }, to)).toBe('unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries once the cool-off has passed', async () => {
    jest.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') });
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockReturnValue(answer(okRoute));
    expect(await route()).toBe('unavailable');

    jest.setSystemTime(new Date('2026-01-01T00:00:16Z'));
    expect(await route({ lat: 48.86, lon: 2.36 }, to)).toEqual({ meters: 478.5, seconds: 385.3 });
    jest.useRealTimers();
  });

  it('treats an unexpected router answer as unavailable', async () => {
    fetchMock.mockReturnValue(answer({ code: 'InvalidQuery' }));
    expect(await route()).toBe('unavailable');
  });

  it('resolves null, without a cool-off, when the request is aborted', async () => {
    fetchMock.mockImplementation((_url: string, init: { signal: AbortSignal }) => new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => setTimeout(() => reject(new DOMException('Aborted', 'AbortError'))));
    }));
    const abort = new AbortController();
    const pending = service.route(from, to, abort.signal);
    abort.abort();

    expect(await pending).toBeNull();
    expect(service.peek(from, to)).toBeUndefined();
  });
});
