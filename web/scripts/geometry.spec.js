const { encodePolyline, decodePolyline, simplifyPath, densifyPath, PointGrid } = require('./geometry');

describe('polyline encoding', () => {
  it('matches the documented Google example', () => {
    const points = [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]];
    expect(encodePolyline(points)).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual(points);
  });

  it('round-trips Ile-de-France coordinates at 1e-5 precision', () => {
    const points = [[48.84547, 2.33981], [48.85, 2.35], [48.84999, 2.34999], [49.19999, 3.49999], [48.0, 1.5]];
    expect(decodePolyline(encodePolyline(points))).toEqual(points);
  });

  it('rounds to the nearest 1e-5 degree', () => {
    expect(decodePolyline(encodePolyline([[48.8456789, 2.3398123]]))).toEqual([[48.84568, 2.33981]]);
  });

  it('handles an empty path', () => {
    expect(encodePolyline([])).toBe('');
    expect(decodePolyline('')).toEqual([]);
  });
});
describe('simplifyPath', () => {
  const line = (n, dLat = 0.0001) => Array.from({ length: n }, (_, i) => [48.85 + i * dLat, 2.35]);

  it('drops points on a straight line and keeps the end points', () => {
    const out = simplifyPath(line(20), 3);
    expect(out).toEqual([line(20)[0], line(20)[19]]);
  });

  it('keeps a point that bends the path by more than the tolerance', () => {
    // about 40 m sideways at the middle
    const bent = [[48.85, 2.35], [48.8505, 2.35055], [48.851, 2.35]];
    expect(simplifyPath(bent, 6)).toHaveLength(3);
  });

  it('drops a bend smaller than the tolerance', () => {
    // about 2 m sideways at the middle
    const slight = [[48.85, 2.35], [48.8505, 2.35003], [48.851, 2.35]];
    expect(simplifyPath(slight, 6)).toHaveLength(2);
  });

  it('keeps a curve: every kept point stays within the tolerance of the original path', () => {
    const arc = Array.from({ length: 60 }, (_, i) => {
      const a = (i / 59) * Math.PI / 2;
      return [48.85 + 0.004 * Math.sin(a), 2.35 + 0.006 * (1 - Math.cos(a))];
    });
    const out = simplifyPath(arc, 6);
    expect(out.length).toBeGreaterThan(4);
    expect(out.length).toBeLessThan(arc.length);
    expect(out[0]).toEqual(arc[0]);
    expect(out[out.length - 1]).toEqual(arc[arc.length - 1]);
  });

  it('returns short paths unchanged', () => {
    expect(simplifyPath([[1, 2]], 3)).toEqual([[1, 2]]);
    expect(simplifyPath([[1, 2], [3, 4]], 3)).toEqual([[1, 2], [3, 4]]);
  });
});
describe('densifyPath', () => {
  it('adds points so no step exceeds the limit and keeps the end points', () => {
    // 0.001 degrees of latitude is about 111 m
    const out = densifyPath([[48.85, 2.35], [48.851, 2.35]], 10);
    expect(out[0]).toEqual([48.85, 2.35]);
    expect(out[out.length - 1]).toEqual([48.851, 2.35]);
    expect(out).toHaveLength(13);
  });

  it('leaves a short step alone', () => {
    expect(densifyPath([[48.85, 2.35], [48.85005, 2.35]], 10)).toHaveLength(2);
  });
});

describe('PointGrid', () => {
  it('finds a point within the radius, also across a cell border', () => {
    const grid = new PointGrid(15);
    grid.add([48.85, 2.35]);
    expect(grid.hasNear([48.85, 2.35005])).toBe(true);
    expect(grid.hasNear([48.85010, 2.35])).toBe(true);
  });

  it('does not find a point farther than the radius', () => {
    const grid = new PointGrid(15);
    grid.add([48.85, 2.35]);
    expect(grid.hasNear([48.8503, 2.35])).toBe(false);
    expect(new PointGrid(15).hasNear([48.85, 2.35])).toBe(false);
  });
});

