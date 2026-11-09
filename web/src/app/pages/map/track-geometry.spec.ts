import { decodePolyline, decodeWay, intersects } from './track-geometry';
// The generator-side encoder is the other half of this contract.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { encodePolyline } = require('../../../../scripts/geometry');

describe('decodePolyline', () => {
  it('matches the documented Google example', () => {
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
  });

  it('decodes what the generator-side encoder writes', () => {
    const points: Array<[number, number]> = [[48.84547, 2.33981], [48.85, 2.35], [48.84999, 2.34999], [49.19999, 3.49999]];
    expect(decodePolyline(encodePolyline(points))).toEqual(points);
  });

  it('returns nothing for an empty string', () => {
    expect(decodePolyline('')).toEqual([]);
  });
});

describe('decodeWay', () => {
  it('decodes every piece of a way and computes its bounds', () => {
    const a: Array<[number, number]> = [[48.84, 2.30], [48.86, 2.32]];
    const b: Array<[number, number]> = [[48.90, 2.40], [48.91, 2.41]];
    const way = decodeWay(`${encodePolyline(a)};${encodePolyline(b)}`);

    expect(way.paths).toEqual([a, b]);
    expect(way.bounds).toEqual([48.84, 2.30, 48.91, 2.41]);
  });

  it('keeps a single-piece way as one path', () => {
    const way = decodeWay(encodePolyline([[48.84, 2.30], [48.85, 2.31]]));
    expect(way.paths).toHaveLength(1);
  });
});

describe('intersects', () => {
  const box = [48.0, 2.0, 49.0, 3.0] as const;

  it.each([
    ['overlapping', [48.5, 2.5, 49.5, 3.5], true],
    ['contained', [48.2, 2.2, 48.3, 2.3], true],
    ['touching an edge', [49.0, 2.0, 50.0, 3.0], true],
    ['north of it', [49.1, 2.0, 50.0, 3.0], false],
    ['east of it', [48.0, 3.1, 49.0, 4.0], false]
  ] as const)('%s', (_label, other, expected) => {
    expect(intersects(box, other)).toBe(expected);
  });
});
