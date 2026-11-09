import { IDF_ROUTES } from './idf-datapoints';
import { IDF_TRACK_LINES, IDF_TRACK_WAYS } from './idf-tracks';
import { decodeWay } from './track-geometry';
import { MAP_COORDS } from '../../variables';

const [[south, west], [north, east]] = MAP_COORDS.bounds as unknown as [[number, number], [number, number]];

describe('generated track data', () => {
  it('has a track for every RER and Transilien line that has stops', () => {
    const lines = new Set(IDF_ROUTES.filter(r => r.mode === 'rer' || r.mode === 'transilien').map(r => `${r.mode}|${r.ref}`));
    const tracked = new Set(IDF_TRACK_LINES.map(l => `${l.mode}|${l.ref}`));

    for (const line of lines) expect(tracked).toContain(line);
  });

  it('covers only the heavy-rail modes', () => {
    expect(IDF_TRACK_LINES.every(l => l.mode === 'rer' || l.mode === 'transilien')).toBe(true);
  });

  it('lists each line once, with valid and unique way indexes', () => {
    const keys = IDF_TRACK_LINES.map(l => `${l.mode}|${l.ref}`);
    expect(new Set(keys).size).toBe(keys.length);

    for (const line of IDF_TRACK_LINES) {
      expect(line.ways.length).toBeGreaterThan(0);
      expect(new Set(line.ways).size).toBe(line.ways.length);
      for (const i of line.ways) {
        expect(Number.isInteger(i)).toBe(true);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(IDF_TRACK_WAYS.length);
      }
    }
  });

  it('decodes every way into paths of at least two points inside the map bounds', () => {
    let points = 0;
    IDF_TRACK_WAYS.forEach(entry => {
      const way = decodeWay(entry);
      expect(way.paths.length).toBeGreaterThan(0);
      for (const path of way.paths) {
        expect(path.length).toBeGreaterThanOrEqual(2);
        points += path.length;
      }
      // Overpass keeps the first node just outside the clip box.
      expect(way.bounds[0]).toBeGreaterThanOrEqual(south - 0.01);
      expect(way.bounds[1]).toBeGreaterThanOrEqual(west - 0.01);
      expect(way.bounds[2]).toBeLessThanOrEqual(north + 0.01);
      expect(way.bounds[3]).toBeLessThanOrEqual(east + 0.01);
    });
    expect(points).toBeGreaterThan(10000);
  });

  it('uses every way at least once', () => {
    const used = new Set(IDF_TRACK_LINES.flatMap(l => l.ways));
    expect(used.size).toBe(IDF_TRACK_WAYS.length);
  });

  it('passes close to the stations of its lines: a line stop is within 300 m of its own track', () => {
    // Sample one line per mode; a mismatch would mean the geometry belongs to another line.
    const near = (line: { mode: string; ref: string }) => {
      const ways = IDF_TRACK_LINES.find(l => l.mode === line.mode && l.ref === line.ref)!.ways.map(i => decodeWay(IDF_TRACK_WAYS[i]));
      const stops = IDF_ROUTES.filter(r => r.mode === line.mode && r.ref === line.ref).flatMap(r => r.coords);
      const dist = (a: [number, number], b: [number, number]) => Math.hypot((a[0] - b[0]) * 111320, (a[1] - b[1]) * 73000);
      // Simplified tracks have long straight segments, so measure to the segment, not to its vertices.
      const toSegment = (p: [number, number], a: [number, number], b: [number, number]) => {
        const len2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
        const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / len2));
        return dist(p, [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      };
      let close = 0;
      for (const stop of stops) {
        if (ways.some(w => w.paths.some(p => p.some((pt, i) => i > 0 && toSegment(stop, p[i - 1], pt) < 300)))) close++;
      }
      return close / stops.length;
    };

    expect(near({ mode: 'rer', ref: 'B' })).toBeGreaterThan(0.9);
    expect(near({ mode: 'transilien', ref: 'N' })).toBeGreaterThan(0.9);
  });
});
