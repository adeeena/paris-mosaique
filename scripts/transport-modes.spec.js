const { MODES, classifyRoute, normalizeRef, isInactive } = require('./transport-modes');

// Tag samples taken from a real Overpass inventory of the IDF bounding box.
describe('classifyRoute', () => {
  const cases = [
    ['metro line', { route: 'subway', network: 'Métro de Paris', ref: '8' }, 'metro'],
    ['metro line with unnamed network', { route: 'subway', network: 'Île-de-France Mobilités', ref: '15' }, 'metro'],
    ['CDGVAL shuttle', { route: 'subway', network: 'CDGVAL', ref: 'CDGVAL' }, 'other'],
    ['Orlyval shuttle', { route: 'subway', ref: 'Orlyval' }, 'other'],
    ['RER by network', { route: 'train', network: 'RER', operator: 'SNCF Voyageurs', ref: 'C' }, 'rer'],
    ['RER by RATP operator when network is missing', { route: 'train', operator: 'RATP', ref: 'A' }, 'rer'],
    ['Transilien', { route: 'train', network: 'Transilien', operator: 'SNCF Voyageurs', ref: 'H' }, 'transilien'],
    ['TGV', { route: 'train', network: 'TGV InOui', operator: 'SNCF Voyageurs', ref: 'TGV' }, 'other'],
    ['TER', { route: 'train', network: 'TER Hauts-de-France', ref: '807A' }, 'other'],
    ['tram', { route: 'tram', network: "Tramway d'Île de France", ref: 'T3a' }, 'tram'],
    ['tram tagged light_rail', { route: 'light_rail', network: "Tramway d'Île de France", ref: 'T13' }, 'tram'],
    ['LISA light rail shuttle', { route: 'light_rail', network: 'CDGVAL', ref: '2' }, 'other'],
    ['cable car', { route: 'aerialway', network: "Téléphérique d'Île-de-France", ref: 'C1' }, 'cable_car'],
    ['bus', { route: 'bus', network: 'RATP', ref: '4' }, 'bus'],
    ['trolleybus', { route: 'trolleybus', ref: '12' }, 'bus'],
    ['intercity coach', { route: 'bus', network: 'Flixbus', ref: 'N001' }, 'other'],
    ['ferry', { route: 'ferry', network: 'Batobus' }, 'other'],
    ['funicular', { route: 'funicular', network: 'RATP', ref: 'Funiculaire' }, 'other'],
    ['unknown route type', { route: 'monorail' }, 'other'],
    ['missing route tag', {}, 'other']
  ];

  it.each(cases)('%s', (_label, tags, expected) => {
    expect(classifyRoute(tags)).toBe(expected);
  });

  it('only returns known modes', () => {
    for (const [, tags] of cases) expect(MODES).toContain(classifyRoute(tags));
  });

  it('keeps colliding refs in different modes distinct', () => {
    const metro = classifyRoute({ route: 'subway', network: 'Métro de Paris', ref: '4' });
    const bus = classifyRoute({ route: 'bus', network: 'RATP', ref: '4' });
    const rer = classifyRoute({ route: 'train', network: 'RER', ref: 'A' });
    const busA = classifyRoute({ route: 'bus', network: 'Vexin', ref: 'A' });
    expect(metro).not.toBe(bus);
    expect(rer).not.toBe(busA);
  });
});

describe('normalizeRef', () => {
  it('maps OSM "bis" metro refs to the app line keys', () => {
    expect(normalizeRef('metro', '3bis')).toBe('3b');
    expect(normalizeRef('metro', '7bis')).toBe('7b');
  });

  it('leaves other refs unchanged', () => {
    expect(normalizeRef('metro', '14')).toBe('14');
    expect(normalizeRef('bus', '3bis')).toBe('3bis');
    expect(normalizeRef('tram', ' T3a ')).toBe('T3a');
  });
});

describe('isInactive', () => {
  const now = Date.UTC(2026, 10, 6);

  it.each([
    ['disused=yes', { public_transport: 'stop_area', disused: 'yes' }],
    ['abandoned=yes', { railway: 'station', abandoned: 'yes' }],
    ['railway=disused_station', { railway: 'disused_station' }],
    ['railway=abandoned', { railway: 'abandoned' }],
    ['railway=construction', { railway: 'construction' }],
    ['railway=proposed', { railway: 'proposed' }],
    ['public_transport=disused', { public_transport: 'disused' }],
    ['state=construction', { public_transport: 'stop_area', state: 'construction' }],
    ['state=proposed', { type: 'route', route: 'subway', state: 'proposed' }],
    ['lifecycle prefix without an active tag', { 'disused:railway': 'station', name: 'Old station' }],
    ['was: prefix without an active tag', { 'was:public_transport': 'stop_area' }],
    ['past end_date', { railway: 'station', end_date: '1939-09' }],
    ['future opening_date', { public_transport: 'stop_area', opening_date: '2030' }],
    ['future start_date, partial', { railway: 'station', start_date: '2027-03' }]
  ])('is inactive: %s', (_label, tags) => {
    expect(isInactive(tags, now)).toBe(true);
  });

  it.each([
    ['plain stop_area', { public_transport: 'stop_area', name: 'Gare du Nord' }],
    ['no tags', {}],
    ['undefined tags', undefined],
    ['historic start_date', { railway: 'station', start_date: '1895' }],
    ['past opening_date', { railway: 'station', opening_date: '2024-05-13' }],
    ['planned future end_date', { railway: 'station', end_date: '2031' }],
    ['active station that keeps a was: note', { railway: 'station', 'was:name': 'Old name' }],
    ['active station with a disused: neighbour tag', { railway: 'station', 'disused:railway': 'halt' }],
    ['disused=no', { railway: 'station', disused: 'no' }]
  ])('is active: %s', (_label, tags) => {
    expect(isInactive(tags, now)).toBe(false);
  });

  it('treats an unparseable date as unknown rather than inactive', () => {
    expect(isInactive({ railway: 'station', end_date: 'unknown', opening_date: 'soon' }, now)).toBe(false);
  });
});
