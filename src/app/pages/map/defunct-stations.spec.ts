import { DEFUNCT_STATIONS } from './defunct-stations';
import { LINE_CONFIG } from './idf-line-config';

describe('defunct stations', () => {
  it('lists the closed stations of the Wikipedia ghost-station table', () => {
    const names = DEFUNCT_STATIONS.map(s => s.name);
    for (const name of ['Croix-Rouge', 'Saint-Martin', 'Arsenal', 'Champ de Mars', 'Haxo', 'Porte Molitor', 'Gare du Nord USFRT', 'Martin Nadaud']) {
      expect(names).toContain(name);
    }
  });

  it('has no duplicate name', () => {
    const names = DEFUNCT_STATIONS.map(s => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('puts every station inside Paris and its inner suburbs', () => {
    for (const s of DEFUNCT_STATIONS) {
      expect([s.name, s.lat > 48.80 && s.lat < 48.92 && s.lon > 2.22 && s.lon < 2.45]).toEqual([s.name, true]);
    }
  });

  it('only uses metro lines the map draws', () => {
    for (const s of DEFUNCT_STATIONS) {
      expect(s.lines.length).toBeGreaterThan(0);
      for (const ref of s.lines) expect([s.name, ref, !!LINE_CONFIG[ref]]).toEqual([s.name, ref, true]);
    }
  });

  it('gives a year to the stations that closed or were replaced, and none to those that never opened', () => {
    for (const s of DEFUNCT_STATIONS) {
      const dated = s.status === 'closed' || s.status === 'relocated';
      expect([s.name, typeof s.year === 'number']).toEqual([s.name, dated]);
    }
  });

  it('has a note for every station', () => {
    expect(DEFUNCT_STATIONS.filter(s => !s.note.trim()).map(s => s.name)).toEqual([]);
  });
});
