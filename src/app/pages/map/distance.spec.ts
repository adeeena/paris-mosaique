import { formatDistance, formatDuration, haversineM, nearestSite } from './distance';

describe('haversineM', () => {
  it('is zero for the same point', () => {
    expect(haversineM({ lat: 48.85, lon: 2.35 }, { lat: 48.85, lon: 2.35 })).toBe(0);
  });

  it('measures about 111 m per 0.001 degree of latitude', () => {
    expect(haversineM({ lat: 48.85, lon: 2.35 }, { lat: 48.851, lon: 2.35 })).toBeCloseTo(111.2, 0);
  });

  it('measures Notre-Dame to the Eiffel Tower at roughly 4.1 km', () => {
    const d = haversineM({ lat: 48.8530, lon: 2.3499 }, { lat: 48.8584, lon: 2.2945 });
    expect(d).toBeGreaterThan(4000);
    expect(d).toBeLessThan(4300);
  });
});

describe('formatDistance', () => {
  it.each([
    [0, '0 m'],
    [42, '40 m'],
    [478.5, '480 m'],
    [999, '1000 m'],
    [1234, '1.2 km'],
    [9949, '9.9 km'],
    [16127, '16 km']
  ])('%d m -> %s', (m, text) => expect(formatDistance(m)).toBe(text));
});

describe('formatDuration', () => {
  it.each([
    [20, '< 1 min'],
    [385, '6 min'],
    [3540, '59 min'],
    [3600, '1 h'],
    [4500, '1 h 15 min'],
    [12916, '3 h 35 min']
  ])('%d s -> %s', (s, text) => expect(formatDuration(s)).toBe(text));
});

describe('nearestSite', () => {
  const sites = [
    { name: 'Far', lat: 48.90, lon: 2.40 },
    { name: 'Near', lat: 48.8505, lon: 2.3502 },
    { name: 'Middle', lat: 48.86, lon: 2.36 }
  ];

  it('returns the site closest as the crow flies, with its distance', () => {
    const hit = nearestSite(sites, { lat: 48.85, lon: 2.35 });
    expect(hit?.site.name).toBe('Near');
    expect(hit?.meters).toBeCloseTo(haversineM({ lat: 48.85, lon: 2.35 }, sites[1]), 5);
  });

  it('picks the other site when the point moves', () => {
    expect(nearestSite(sites, { lat: 48.899, lon: 2.399 })?.site.name).toBe('Far');
  });

  it('returns null when there are no sites', () => {
    expect(nearestSite([], { lat: 48.85, lon: 2.35 })).toBeNull();
  });

  it('returns the first of two equally close sites', () => {
    const twin = [{ name: 'A', lat: 48.86, lon: 2.35 }, { name: 'B', lat: 48.86, lon: 2.35 }];
    expect(nearestSite(twin, { lat: 48.85, lon: 2.35 })?.site.name).toBe('A');
  });
});
