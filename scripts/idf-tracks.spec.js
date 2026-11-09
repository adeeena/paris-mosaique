const { buildTracks, splitAtGaps } = require('./idf-tracks');
const { decodePolyline } = require('./geometry');

const pts = (...pairs) => pairs.map(([lat, lon]) => ({ lat, lon }));
const way = (ref, geometry, role = '') => ({ type: 'way', ref, role, geometry });
const route = (id, tags, members) => ({ type: 'relation', id, tags: { type: 'route', ...tags }, members });
const straight = (lat0, n) => pts(...Array.from({ length: n }, (_, i) => [lat0 + i * 0.0005, 2.35]));

const transilienN = { route: 'train', network: 'Transilien', ref: 'N' };

describe('splitAtGaps', () => {
  it('splits where Overpass left a null (outside the bounding box)', () => {
    const g = [...pts([1, 1], [1, 2]), null, ...pts([2, 1], [2, 2], [2, 3])];
    expect(splitAtGaps(g)).toEqual([[[1, 1], [1, 2]], [[2, 1], [2, 2], [2, 3]]]);
  });

  it('drops fragments that are a single point', () => {
    expect(splitAtGaps([...pts([1, 1]), null, ...pts([2, 1], [2, 2])])).toEqual([[[2, 1], [2, 2]]]);
  });
});

describe('buildTracks', () => {
  it('stores a way once and lets the line reference it from several route variants', () => {
    const tracks = buildTracks([
      route(1, transilienN, [way(10, straight(48.84, 6)), way(11, straight(48.85, 6))]),
      route(2, transilienN, [way(11, straight(48.85, 6)), way(12, straight(48.86, 6))])
    ]);

    expect(tracks.ways).toHaveLength(3);
    expect(tracks.lines).toEqual([{ mode: 'transilien', ref: 'N', ways: [0, 1, 2] }]);
  });

  it('keeps lines with the same ref in different modes apart and ignores non-track modes', () => {
    const tracks = buildTracks([
      route(1, transilienN, [way(10, straight(48.84, 6))]),
      route(2, { route: 'train', network: 'RER', operator: 'RATP', ref: 'N' }, [way(20, straight(48.9, 6))]),
      route(3, { route: 'subway', network: 'M\u00e9tro de Paris', ref: '4' }, [way(30, straight(48.8, 6))]),
      route(4, { route: 'bus', network: 'RATP', ref: 'N' }, [way(40, straight(48.7, 6))])
    ]);

    expect(tracks.lines.map(l => `${l.mode}:${l.ref}`)).toEqual(['rer:N', 'transilien:N']);
    expect(tracks.ways).toHaveLength(2);
  });

  it('simplifies a straight way to its end points', () => {
    const tracks = buildTracks([route(1, transilienN, [way(10, straight(48.84, 30))])]);
    expect(decodePolyline(tracks.ways[0])).toHaveLength(2);
  });

  it('keeps the curve of a bent way', () => {
    const arc = pts(...Array.from({ length: 40 }, (_, i) => {
      const a = (i / 39) * (Math.PI / 2);
      return [48.84 + 0.004 * Math.sin(a), 2.35 + 0.006 * (1 - Math.cos(a))];
    }));
    const decoded = decodePolyline(buildTracks([route(1, transilienN, [way(10, arc)])]).ways[0]);

    expect(decoded.length).toBeGreaterThan(4);
    expect(decoded.length).toBeLessThan(arc.length);
  });

  it('stores a way that leaves the bounding box as separate pieces in one entry', () => {
    const geometry = [...straight(48.84, 4), null, ...straight(48.9, 4)];
    const entry = buildTracks([route(1, transilienN, [way(10, geometry)])]).ways[0];
    expect(entry.split(';')).toHaveLength(2);
  });

  it('ignores platforms, stop members and ways without geometry', () => {
    const tracks = buildTracks([route(1, transilienN, [
      way(10, straight(48.84, 6), 'platform'),
      way(11, straight(48.85, 6), 'stop'),
      { type: 'way', ref: 12, role: '' },
      { type: 'node', ref: 13, role: 'stop', lat: 48.8, lon: 2.3 },
      way(14, straight(48.86, 6), 'forward')
    ])]);

    expect(tracks.ways).toHaveLength(1);
    expect(tracks.lines[0].ways).toEqual([0]);
  });

  it('skips closed or not-yet-open routes', () => {
    const tracks = buildTracks([route(1, { ...transilienN, state: 'proposed' }, [way(10, straight(48.84, 6))])]);
    expect(tracks).toEqual({ ways: [], lines: [] });
  });

  it('omits a line that has no usable geometry', () => {
    const tracks = buildTracks([route(1, transilienN, [{ type: 'way', ref: 1, role: '' }])]);
    expect(tracks.lines).toEqual([]);
  });

  describe('parallel tracks', () => {
    const along = (lat0, n, lon) => pts(...Array.from({ length: n }, (_, i) => [lat0 + i * 0.0005, lon]));
    const east = (lon) => (lon - 2.35) * 111320 * Math.cos((48.85 * Math.PI) / 180);

    it('draws the two directions of a corridor once', () => {
      const tracks = buildTracks([route(1, transilienN, [
        way(10, along(48.84, 6, 2.35)),
        way(11, [...along(48.84, 6, 2.35005)].reverse())
      ])]);

      expect(east(2.35005)).toBeCloseTo(3.6, 0);
      expect(tracks.lines[0].ways).toEqual([0]);
      expect(tracks.ways).toHaveLength(1);
    });

    it('keeps both tracks where they are far apart', () => {
      const tracks = buildTracks([route(1, transilienN, [
        way(10, along(48.84, 6, 2.35)),
        way(11, along(48.84, 6, 2.3515))
      ])]);

      expect(tracks.lines[0].ways).toHaveLength(2);
    });

    it('keeps a way that is only partly alongside another track', () => {
      const tracks = buildTracks([route(1, transilienN, [
        way(10, along(48.84, 6, 2.35)),
        way(11, along(48.8425, 12, 2.35005))
      ])]);

      expect(tracks.lines[0].ways).toHaveLength(2);
    });

    it('keeps a way whose tail branches off a kept track', () => {
      const tracks = buildTracks([route(1, transilienN, [
        way(10, along(48.84, 6, 2.35)),
        way(11, [...along(48.84, 6, 2.35005), ...pts([48.8425, 2.3515])])
      ])]);

      expect(tracks.lines[0].ways).toHaveLength(2);
    });

    it('never merges a short way, which would leave a gap', () => {
      const tracks = buildTracks([route(1, transilienN, [
        way(10, along(48.84, 6, 2.35)),
        way(11, pts([48.8410, 2.35005], [48.84105, 2.35005]))
      ])]);

      expect(tracks.lines[0].ways).toHaveLength(2);
    });

    it('merges per line, so lines sharing a corridor each keep their own track', () => {
      const rerA = { route: 'train', network: 'RER', operator: 'RATP', ref: 'A' };
      const tracks = buildTracks([
        route(1, rerA, [way(10, along(48.84, 6, 2.35))]),
        route(2, transilienN, [way(11, along(48.84, 6, 2.35005))])
      ]);

      expect(tracks.lines.map(l => l.ways.length)).toEqual([1, 1]);
      expect(tracks.ways).toHaveLength(2);
    });

    it('renumbers the ways it keeps without holes', () => {
      const tracks = buildTracks([route(1, transilienN, [
        way(10, along(48.84, 6, 2.35)),
        way(11, along(48.84, 6, 2.35005)),
        way(12, along(48.9, 6, 2.35))
      ])]);

      expect(tracks.ways).toHaveLength(2);
      expect(tracks.lines[0].ways).toEqual([0, 1]);
    });
  });
});
