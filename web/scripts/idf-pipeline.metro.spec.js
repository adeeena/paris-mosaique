const { buildSnapshot } = require('./idf-pipeline');

const area = (id, name, lat, lon) => ({
  type: 'relation', id, center: { lat, lon }, tags: { public_transport: 'stop_area', name }
});
const metroStation = (id, name, lat, lon) => ({
  type: 'node', id, lat, lon, tags: { name, railway: 'station', public_transport: 'station', station: 'subway', network: 'M\u00e9tro de Paris' }
});
const railStation = (id, name, lat, lon) => ({
  type: 'node', id, lat, lon, tags: { name, railway: 'station', public_transport: 'station', network: 'RER' }
});
const stop = (id, lat, lon) => ({ type: 'node', id, lat, lon, tags: { public_transport: 'stop_position' } });
const route = (id, tags, members) => ({ type: 'relation', id, tags: { type: 'route', ...tags }, members });
const metro = ref => ({ route: 'subway', network: 'M\u00e9tro de Paris', ref });
const rer = ref => ({ route: 'train', network: 'RER', operator: 'RATP', ref });
const stopMember = ref => ({ type: 'node', ref, role: 'stop' });
const areaMember = ref => ({ type: 'relation', ref, role: '' });

const names = snap => snap.stations.map(s => s.name).sort();
const lines = (snap, name) => snap.stations.find(s => s.name === name).lines.map(l => `${l.mode}:${l.ref}`);

describe('buildSnapshot metro stations come from the metro station nodes', () => {
  // Les Halles and Châtelet are 430 m apart on line 4; the stop area at Les Halles is named after an exit.
  const chatelet = metroStation(1, 'Ch\u00e2telet', 48.8590, 2.3470);
  const halles = metroStation(2, 'Les Halles', 48.8625, 2.3466);
  const cite = metroStation(3, 'Cit\u00e9', 48.8553, 2.3475);
  const stops = [
    chatelet, halles, cite,
    stop(11, 48.8591, 2.3471), stop(12, 48.8626, 2.3467), stop(13, 48.8554, 2.3476), stop(14, 48.8592, 2.3472),
    area(20, 'Porte Saint-Eustache', 48.8630, 2.3456)
  ];
  const routes = [
    route(100, metro('4'), [11, 12, 13].map(stopMember)),
    route(101, metro('1'), [stopMember(14)])
  ];

  it('names a station after its node, not after the stop area at one of its exits', () => {
    const snap = buildSnapshot(stops, routes);
    expect(names(snap)).toEqual(['Cit\u00e9', 'Ch\u00e2telet', 'Les Halles'].sort());
    expect(names(snap)).not.toContain('Porte Saint-Eustache');
  });

  it('gives each station only the lines that stop at its own node', () => {
    const snap = buildSnapshot(stops, routes);
    expect(lines(snap, 'Cit\u00e9')).toEqual(['metro:4']);
    expect(lines(snap, 'Ch\u00e2telet').sort()).toEqual(['metro:1', 'metro:4']);
  });

  it('puts a metro station on the RER or Transilien site next to it and names it after the node', () => {
    const lesHallesRer = area(30, 'Ch\u00e2telet - Les Halles', 48.8627, 2.3461);
    const snap = buildSnapshot([...stops, lesHallesRer, stop(31, 48.8627, 2.3461)], [
      ...routes,
      route(102, rer('A'), [areaMember(30), areaMember(20)])
    ]);

    expect(lines(snap, 'Les Halles').sort()).toEqual(['metro:4', 'rer:A']);
    expect(names(snap)).not.toContain('Ch\u00e2telet - Les Halles');
  });

  it('keeps one station for the several nodes of one name (Gare de Lyon for lines 1 and 14)', () => {
    const snap = buildSnapshot([
      metroStation(40, 'Gare de Lyon', 48.8452, 2.3726), metroStation(41, 'Gare de Lyon', 48.8436, 2.3743),
      stop(42, 48.8452, 2.3726), stop(43, 48.8436, 2.3743)
    ], [route(110, metro('1'), [stopMember(42)]), route(111, metro('14'), [stopMember(43)])]);

    expect(names(snap)).toEqual(['Gare de Lyon']);
    expect(lines(snap, 'Gare de Lyon').sort()).toEqual(['metro:1', 'metro:14']);
  });

  it('removes the rail lines a metro stop area picked up from the next station', () => {
    const havre = metroStation(50, 'Havre - Caumartin', 48.8737, 2.3274);
    const auber = railStation(51, 'Auber', 48.8726, 2.3311);
    const havreArea = area(52, 'Havre-Caumartin (9)', 48.8736, 2.3280);
    const auberArea = area(53, 'Auber', 48.8726, 2.3299);
    const snap = buildSnapshot([
      havre, auber, havreArea, auberArea, stop(54, 48.8737, 2.3275), stop(55, 48.8727, 2.3300)
    ], [route(120, metro('9'), [stopMember(54)]), route(121, rer('A'), [stopMember(55)])]);

    expect(lines(snap, 'Havre - Caumartin')).toEqual(['metro:9']);
    expect(lines(snap, 'Auber')).toEqual(['rer:A']);
  });

  it('names a station without a tagged node after its stop area, once for all its lines', () => {
    const snap = buildSnapshot([
      chatelet, stop(11, 48.8591, 2.3471),
      area(60, 'Madeleine (8)', 48.8700, 2.3260), area(61, 'Madeleine (12)', 48.8702, 2.3254)
    ], [route(130, metro('1'), [stopMember(11)]), route(131, metro('8'), [areaMember(60)]), route(132, metro('12'), [areaMember(61)])]);

    expect(lines(snap, 'Madeleine').sort()).toEqual(['metro:12', 'metro:8']);
  });

  it('cleans the name of a metro node: no qualifier, one dash style', () => {
    const snap = buildSnapshot([
      metroStation(70, 'Gare du Nord (M\u00e9tro)', 48.8796, 2.3572), metroStation(71, 'Reuilly \u2014 Diderot', 48.8474, 2.3868),
      stop(72, 48.8797, 2.3573), stop(73, 48.8475, 2.3869)
    ], [route(140, metro('4'), [stopMember(72)]), route(141, metro('8'), [stopMember(73)])]);

    expect(names(snap)).toEqual(['Gare du Nord', 'Reuilly - Diderot']);
  });

  it('leaves the stop-area sites alone when the data has no metro station node', () => {
    const snap = buildSnapshot([area(80, 'Alpha', 48.85, 2.35), area(81, 'Beta', 48.86, 2.36)], [
      route(150, metro('4'), [areaMember(80), areaMember(81)])
    ]);

    expect(names(snap)).toEqual(['Alpha', 'Beta']);
  });
});

describe('buildSnapshot station aliases', () => {
  const aliasesOf = (snap, name) => snap.stations.find(s => s.name === name).aliases;
  const node = (id, name, lat, lon, extra = {}) => ({
    type: 'node', id, lat, lon,
    tags: { name, railway: 'station', public_transport: 'station', station: 'subway', network: 'M\u00e9tro de Paris', ...extra }
  });
  const withStop = (id, lat, lon, ref, ...nodes) => ({
    stops: [...nodes, stop(id, lat, lon)], route: route(900 + id, metro(ref), [stopMember(id)])
  });
  const build = (...parts) => buildSnapshot(parts.flatMap(p => p.stops), parts.map(p => p.route));

  it('takes alt_name, official_name and short_name from the station node, but not old_name', () => {
    const snap = build(withStop(2, 48.84, 2.32, '6', node(1, 'Gare Montparnasse', 48.84, 2.32, {
      alt_name: 'Montparnasse 1 & 2', official_name: 'Paris Montparnasse Hall 1 & 2', old_name: 'Gare de l\u2019Ouest'
    })));

    expect(aliasesOf(snap, 'Gare Montparnasse')).toEqual(['Montparnasse 1 & 2', 'Paris Montparnasse Hall 1 & 2']);
  });

  it('keeps the name of the rail station a metro station joined as an alias', () => {
    const rerSite = area(10, 'Ch\u00e2telet - Les Halles', 48.8592, 2.3472);
    const snap = buildSnapshot([node(11, 'Ch\u00e2telet', 48.8590, 2.3470), stop(12, 48.8591, 2.3471), rerSite], [
      route(920, metro('1'), [stopMember(12)]),
      route(921, rer('A'), [areaMember(10)])
    ]);

    expect(aliasesOf(snap, 'Ch\u00e2telet')).toEqual(['Ch\u00e2telet - Les Halles']);
  });

  it('does not count a spelling that only adds filler words as another name', () => {
    const snap = build(withStop(22, 48.8452, 2.3726, '1', node(21, 'Gare de Lyon', 48.8452, 2.3726, {
      alt_name: 'Gare de Lyon RER;Paris Gare de Lyon;Paris - Gare de Lyon'
    })));

    expect(aliasesOf(snap, 'Gare de Lyon')).toBeUndefined();
  });

  it('does not take the name of a bus stop area as an alias', () => {
    const busStreet = area(30, 'Rennes - D\u2019Assas', 48.8490, 2.3288);
    const snap = buildSnapshot([node(31, 'Rennes', 48.8482, 2.3278), stop(32, 48.8483, 2.3279), busStreet], [
      route(930, metro('12'), [stopMember(32)])
    ]);

    expect(aliasesOf(snap, 'Rennes')).toBeUndefined();
  });

  it('does not offer "M\u00e9tro" or "bus" variants and caps the list at three', () => {
    const snap = build(withStop(42, 48.8, 2.3, '4', node(41, 'Alesia', 48.8, 2.3, {
      alt_name: 'M\u00e9tro Alesia;Alesia (bus);One;Two;Three;Four'
    })));

    expect(aliasesOf(snap, 'Alesia')).toEqual(['One', 'Two', 'Three']);
  });

  it('keeps the variant names of a station complex (Saint-Lazare)', () => {
    const snap = buildSnapshot([
      area(51, 'Saint-Lazare (13)', 48.8754, 2.3255), area(54, 'Saint-Lazare (12)', 48.8756, 2.3271), area(52, 'Gare Saint-Lazare', 48.8770, 2.3252), area(53, 'Haussmann - Saint-Lazare', 48.8752, 2.3286)
    ], [
      route(940, metro('13'), [areaMember(51)]), route(943, metro('12'), [areaMember(54)]), route(941, { route: 'train', network: 'Transilien', ref: 'L' }, [areaMember(52)]), route(942, rer('E'), [areaMember(53)])
    ]);

    expect(snap.stations.find(s => s.name === 'Saint-Lazare').aliases).toEqual(['Haussmann - Saint-Lazare']);
  });
});