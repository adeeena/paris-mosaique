import type { IdfStation } from './idf-datapoints';
import { ExtraSnapshot, needsExtra, selectRoutes, selectSites } from './transport-data';
import { DEFAULT_MODES, TransportMode } from './transport-modes';

const rail: IdfStation[] = [
  { lat: 48.85, lon: 2.35, name: 'Alpha', lines: [{ ref: '4', mode: 'metro' }, { ref: 'A', mode: 'rer' }] },
  { lat: 48.86, lon: 2.36, name: 'Beta', lines: [{ ref: 'T1', mode: 'tram' }] }
];

const extra: ExtraSnapshot = {
  stations: [{ lat: 48.87, lon: 2.37, name: 'Gamma', lines: [{ ref: '4', mode: 'bus' }] }],
  stationLines: new Map([[0, [{ ref: '4', mode: 'bus' }]]]),
  routes: [{ ref: '4', mode: 'bus', coords: [[48.85, 2.35], [48.87, 2.37]] }]
};

const modes = (...m: TransportMode[]) => new Set<TransportMode>(m);

describe('selectSites', () => {
  it('adds the defunct stations as metro sites, whatever the selected modes', () => {
    const defunct = [{ name: 'Arsenal', lines: ['5'], status: 'closed' as const, year: 1939, note: 'n', lat: 48.849, lon: 2.366 }];

    const sites = selectSites(modes('tram'), rail, extra, defunct);
    const ghost = sites.find(s => s.name === 'Arsenal')!;

    expect(ghost).toEqual({ lat: 48.849, lon: 2.366, name: 'Arsenal', lines: [{ ref: '5', mode: 'metro' }], defunct: defunct[0] });
    expect(selectSites(modes('tram'), rail, extra)).not.toContainEqual(expect.objectContaining({ name: 'Arsenal' }));
  });

  it('uses only rail modes by default', () => {
    const sites = selectSites(DEFAULT_MODES, rail, extra);
    expect(sites.map(s => s.name)).toEqual(['Alpha', 'Beta']);
    expect(sites[0].lines).toEqual([{ ref: '4', mode: 'metro' }, { ref: 'A', mode: 'rer' }]);
  });

  it('keeps a station serving several selected modes as a single site', () => {
    const sites = selectSites(modes('metro', 'bus'), rail, extra);
    expect(sites.filter(s => s.name === 'Alpha')).toHaveLength(1);
    expect(sites.find(s => s.name === 'Alpha')!.lines).toEqual([
      { ref: '4', mode: 'metro' },
      { ref: '4', mode: 'bus' }
    ]);
  });

  it('shows only lines of the selected modes', () => {
    const [alpha] = selectSites(modes('rer'), rail, extra);
    expect(alpha.lines).toEqual([{ ref: 'A', mode: 'rer' }]);
  });

  it('drops sites that have no line in the selected modes', () => {
    const sites = selectSites(modes('bus'), rail, extra);
    expect(sites.map(s => s.name)).toEqual(['Alpha', 'Gamma']);
    expect(sites.every(s => s.lines.every(l => l.mode === 'bus'))).toBe(true);
  });

  it('returns nothing when no mode is selected', () => {
    expect(selectSites(modes(), rail, extra)).toEqual([]);
  });

  it('ignores non-rail modes until the extra data is available', () => {
    expect(selectSites(modes('bus'), rail, null)).toEqual([]);
  });
});

describe('selectRoutes', () => {
  const railRoutes = [{ ref: '4', mode: 'metro' as const, coords: [[48.85, 2.35], [48.86, 2.36]] as Array<[number, number]> }];

  it('selects routes by mode, keeping equal refs of different modes apart', () => {
    expect(selectRoutes(modes('metro'), railRoutes, extra).map(r => r.mode)).toEqual(['metro']);
    expect(selectRoutes(modes('bus'), railRoutes, extra).map(r => r.mode)).toEqual(['bus']);
    expect(selectRoutes(modes('metro', 'bus'), railRoutes, extra).map(r => r.mode)).toEqual(['metro', 'bus']);
  });

  it('returns nothing when no mode is selected', () => {
    expect(selectRoutes(modes(), railRoutes, extra)).toEqual([]);
  });
});

describe('needsExtra', () => {
  it('is false for rail-only selections and true once a non-rail mode is selected', () => {
    expect(needsExtra(DEFAULT_MODES)).toBe(false);
    expect(needsExtra(modes('metro', 'cable_car'))).toBe(true);
    expect(needsExtra(modes())).toBe(false);
  });
});
