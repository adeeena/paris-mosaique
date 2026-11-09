import { IDF_STATIONS } from './idf-datapoints';

describe('generated station data', () => {
  it('gives every rail station at least one line', () => {
    expect(IDF_STATIONS.filter(s => s.lines.length === 0).map(s => s.name)).toEqual([]);
  });

  it('has one station for the Saint-Lazare complex, with the lines of all its stop areas', () => {
    const lazare = IDF_STATIONS.filter(s => s.name.includes('Lazare'));

    expect(lazare).toHaveLength(1);
    expect(lazare[0].lines.map(l => `${l.mode}:${l.ref}`).sort()).toEqual(
      ['metro:12', 'metro:13', 'metro:14', 'metro:3', 'rer:E', 'transilien:J', 'transilien:L']
    );
  });

  describe('metro stations', () => {
    const metro = IDF_STATIONS.filter(s => s.lines.some(l => l.mode === 'metro'));
    const stationsOf = (ref: string) => metro.filter(s => s.lines.some(l => l.mode === 'metro' && l.ref === ref));

    it('has no two stations with the same name', () => {
      const seen = new Set<string>();
      const duplicates = metro.map(s => s.name).filter(name => seen.size === seen.add(name).size);
      expect(duplicates).toEqual([]);
    });

    it('names the stop at the north end of Les Halles "Les Halles", not after one of its exits', () => {
      const names = IDF_STATIONS.map(s => s.name);
      expect(names).toContain('Les Halles');
      expect(names).not.toContain('Porte Saint-Eustache');
    });

    it('keeps the neighbours of a busy area apart', () => {
      const byName = (name: string) => metro.find(s => s.name === name)!;
      const metroRefs = (name: string) => byName(name).lines.filter(l => l.mode === 'metro').map(l => l.ref);

      expect(metroRefs('Cité')).toEqual(['4']);
      expect(metroRefs('Ségur')).toEqual(['10']);
      expect(metroRefs('Temple')).toEqual(['3']);
      expect(metroRefs('Havre - Caumartin').sort()).toEqual(['3', '9']);
      expect(byName('Havre - Caumartin').lines.some(l => l.mode === 'rer')).toBe(false);
    });

    it('has the number of stations the lines have', () => {
      const expected: Record<string, number> = {
        '1': 25, '2': 25, '3': 25, '3b': 4, '4': 29, '5': 22, '6': 28, '8': 38, '9': 37, '10': 23, '11': 19, '12': 31, '13': 32, '14': 21, '7b': 8
      };
      for (const [ref, count] of Object.entries(expected)) expect([ref, stationsOf(ref).length]).toEqual([ref, count]);
    });

    it('has no qualifier in parentheses and one dash style in the names', () => {
      expect(metro.filter(s => /\(|[\u2014\u2013\u2212]/.test(s.name)).map(s => s.name)).toEqual([]);
    });
  });
});
