const { buildSnapshot, dropSubRoutes } = require('./idf-pipeline');

const area = (id, name, lat, lon) => ({
  type: 'relation', id, center: { lat, lon }, tags: { public_transport: 'stop_area', name }
});
const stopNode = (id, name, lat, lon) => ({
  type: 'node', id, lat, lon, tags: { public_transport: 'stop_position', name }
});
const route = (id, tags, members) => ({ type: 'relation', id, tags: { type: 'route', ...tags }, members });
const areaMember = ref => ({ type: 'relation', ref, role: '' });
const stopMember = ref => ({ type: 'node', ref, role: 'stop' });

const A = [48.85, 2.35];
const B = [48.86, 2.36];
const C = [48.87, 2.37];

const stops = [
  area(1, 'Alpha', ...A),
  area(2, 'Beta', ...B),
  stopNode(11, 'Alpha', 48.8501, 2.3501),
  stopNode(12, 'Gamma', ...C)
];

describe('buildSnapshot', () => {
  it.each([
    [48.77993, 2.25196, 'Parc des Sports'],
    [48.78229, 2.25447, 'Le Hameau'],
    [48.79012, 2.25254, 'Jardin Parisien']
  ])('names the T10 stop at %s, %s as %s', (lat, lon, name) => {
    const stopArea = area(700, '', lat, lon);
    const snap = buildSnapshot([stopArea], [
      route(701, { route: 'tram', network: 'T10', ref: 'T10' }, [areaMember(700)])
    ]);

    expect(snap.stations).toContainEqual(expect.objectContaining({
      lat,
      lon,
      name,
      lines: [{ ref: 'T10', mode: 'tram' }]
    }));
  });

  it('keeps a metro line and a bus line with the same ref distinct', () => {
    const snap = buildSnapshot(stops, [
      route(100, { route: 'subway', network: 'Métro de Paris', ref: '4' }, [areaMember(1), areaMember(2)]),
      route(101, { route: 'bus', network: 'RATP', ref: '4' }, [stopMember(11), stopMember(12)])
    ]);

    expect(snap.routes.map(r => [r.mode, r.ref])).toEqual([['metro', '4']]);
    expect(snap.extraRoutes.map(r => [r.mode, r.ref])).toEqual([['bus', '4']]);
    expect(snap.stations[0].lines).toEqual([{ ref: '4', mode: 'metro' }]);
    expect(snap.extraStationLines).toEqual([{ station: 0, lines: [{ ref: '4', mode: 'bus' }] }]);
  });

  it('keeps RER A and bus A distinct', () => {
    const snap = buildSnapshot(stops, [
      route(100, { route: 'train', network: 'RER', operator: 'RATP', ref: 'A' }, [areaMember(1), areaMember(2)]),
      route(101, { route: 'bus', network: 'Vexin', ref: 'A' }, [stopMember(11), stopMember(12)])
    ]);
    expect(snap.routes[0]).toMatchObject({ mode: 'rer', ref: 'A' });
    expect(snap.extraRoutes[0]).toMatchObject({ mode: 'bus', ref: 'A' });
  });

  it('puts only rail-mode lines in the rail station list', () => {
    const snap = buildSnapshot(stops, [
      route(100, { route: 'subway', network: 'Métro de Paris', ref: '1' }, [areaMember(1), areaMember(2)]),
      route(101, { route: 'train', network: 'TER Centre', ref: '807A' }, [areaMember(1), areaMember(2)])
    ]);
    expect(snap.stations.every(s => s.lines.every(l => ['metro', 'rer', 'transilien', 'tram'].includes(l.mode)))).toBe(true);
    expect(snap.extraStationLines[0].lines).toEqual([{ ref: '807A', mode: 'other' }]);
  });

  it('creates an extra site for a bus stop away from any rail station', () => {
    const snap = buildSnapshot(stops, [
      route(100, { route: 'subway', network: 'Métro de Paris', ref: '1' }, [areaMember(1), areaMember(2)]),
      route(101, { route: 'bus', network: 'RATP', ref: '7' }, [stopMember(11), stopMember(12)])
    ]);
    expect(snap.extraStations).toEqual([
      { lat: C[0], lon: C[1], name: 'Gamma', lines: [{ ref: '7', mode: 'bus' }] }
    ]);
  });

  it('does not create a rail station from bus-only stop areas', () => {
    const snap = buildSnapshot(stops, [
      route(101, { route: 'bus', network: 'RATP', ref: '7' }, [areaMember(1), areaMember(2)])
    ]);
    expect(snap.stations).toEqual([]);
  });

  it('merges bus stops of the same name that are close together into one site', () => {
    const near = [
      stopNode(21, 'Mairie', 48.9, 2.4),
      stopNode(22, 'Mairie', 48.9001, 2.4001)
    ];
    const snap = buildSnapshot([...stops, ...near], [
      route(101, { route: 'bus', network: 'RATP', ref: '7' }, [stopMember(21), stopMember(12)]),
      route(102, { route: 'bus', network: 'RATP', ref: '8' }, [stopMember(22), stopMember(12)])
    ]);
    const mairie = snap.extraStations.find(s => s.name === 'Mairie');
    expect(snap.extraStations.filter(s => s.name === 'Mairie')).toHaveLength(1);
    expect(mairie.lines.map(l => l.ref)).toEqual(['7', '8']);
  });

  it('normalizes OSM bis metro refs to the app line keys', () => {
    const snap = buildSnapshot(stops, [
      route(100, { route: 'subway', network: 'Métro de Paris', ref: '3bis' }, [areaMember(1), areaMember(2)])
    ]);
    expect(snap.routes[0].ref).toBe('3b');
    expect(snap.stations[0].lines).toEqual([{ ref: '3b', mode: 'metro' }]);
  });

  it('deduplicates reversed route directions per mode and ref', () => {
    const snap = buildSnapshot(stops, [
      route(100, { route: 'subway', network: 'Métro de Paris', ref: '1' }, [areaMember(1), areaMember(2)]),
      route(101, { route: 'subway', network: 'Métro de Paris', ref: '1' }, [areaMember(2), areaMember(1)])
    ]);
    expect(snap.routes).toHaveLength(1);
  });
});

describe('dropSubRoutes', () => {
  const r = (mode, ref, ...names) => ({ mode, ref, coords: names.map(n => [coordOf[n], 2.3]) });
  const coordOf = { A: 48.1, B: 48.2, C: 48.3, D: 48.4, E: 48.5, F: 48.6 };
  const stopsOf = routes => routes.map(x => x.coords.map(c => Object.keys(coordOf).find(k => coordOf[k] === c[0])).join(''));

  it('drops a skip-stop (express) variant contained in a longer route', () => {
    const kept = dropSubRoutes([r('transilien', 'N', 'A', 'B', 'C', 'D', 'E'), r('transilien', 'N', 'A', 'C', 'E')]);
    expect(stopsOf(kept)).toEqual(['ABCDE']);
  });

  it('drops a short-working variant and a reversed express', () => {
    const kept = dropSubRoutes([
      r('transilien', 'N', 'A', 'B', 'C', 'D', 'E'),
      r('transilien', 'N', 'A', 'B', 'C'),
      r('transilien', 'N', 'E', 'C', 'A')
    ]);
    expect(stopsOf(kept)).toEqual(['ABCDE']);
  });

  it('keeps both branches of a fork, since neither contains the other', () => {
    const kept = dropSubRoutes([r('metro', '13', 'A', 'B', 'C', 'D'), r('metro', '13', 'A', 'B', 'C', 'E')]);
    expect(stopsOf(kept)).toEqual(['ABCD', 'ABCE']);
  });

  it('keeps a branch that shares a prefix but has a different end', () => {
    const kept = dropSubRoutes([r('transilien', 'N', 'A', 'B', 'C', 'D'), r('transilien', 'N', 'A', 'B', 'F')]);
    expect(kept).toHaveLength(2);
  });

  it('does not compare lines with the same ref across modes', () => {
    const kept = dropSubRoutes([r('metro', '4', 'A', 'B', 'C', 'D'), r('bus', '4', 'A', 'C')]);
    expect(kept.map(x => x.mode)).toEqual(['metro', 'bus']);
  });

  it('keeps a route whose stops are in a different order than the longer one', () => {
    const kept = dropSubRoutes([r('tram', 'T1', 'A', 'B', 'C', 'D'), r('tram', 'T1', 'A', 'D', 'C')]);
    expect(kept).toHaveLength(2);
  });

  it('keeps the original order of the surviving routes', () => {
    const kept = dropSubRoutes([r('tram', 'T2', 'A', 'B'), r('tram', 'T1', 'A', 'B', 'C', 'D'), r('tram', 'T1', 'A', 'D')]);
    expect(kept.map(x => x.ref)).toEqual(['T2', 'T1']);
  });
});

describe('buildSnapshot express pruning', () => {
  it('removes an express pattern but keeps the omnibus route', () => {
    const areas = [1, 2, 3, 4].map(i => area(i, `S${i}`, 48.8 + i * 0.01, 2.3));
    const snap = buildSnapshot(areas, [
      route(100, { route: 'train', network: 'Transilien', ref: 'N' }, [1, 2, 3, 4].map(areaMember)),
      route(101, { route: 'train', network: 'Transilien', ref: 'N' }, [1, 4].map(areaMember))
    ]);
    expect(snap.routes).toHaveLength(1);
    expect(snap.routes[0].coords).toHaveLength(4);
  });
});

describe('buildSnapshot closed and not-yet-open stations', () => {
  const at = (i) => Math.round((48.8 + i * 0.01) * 1e5) / 1e5;
  const areas = (extra = {}) => [
    area(1, 'Open A', at(1), 2.3),
    area(2, 'Closed', at(2), 2.3),
    area(3, 'Open B', at(3), 2.3),
  ].map(a => (a.tags.name in extra ? { ...a, tags: { ...a.tags, ...extra[a.tags.name] } } : a));
  const rer = members => route(100, { route: 'train', network: 'RER', operator: 'RATP', ref: 'B' }, members);

  it.each([
    ['disused', { disused: 'yes' }],
    ['abandoned', { abandoned: 'yes' }],
    ['under construction', { state: 'construction' }],
    ['proposed', { railway: 'proposed' }],
    ['not yet open', { opening_date: '2999' }],
    ['closed in the past', { end_date: '1939' }]
  ])('leaves a %s station out of the stations, the lines and the route', (_label, tags) => {
    const snap = buildSnapshot(areas({ Closed: tags }), [rer([1, 2, 3].map(areaMember))]);

    expect(snap.stations.map(s => s.name)).toEqual(['Open A', 'Open B']);
    expect(snap.routes).toHaveLength(1);
    expect(snap.routes[0].coords).toEqual([[at(1), 2.3], [at(3), 2.3]]);
  });

  it('keeps open stations and a historic start_date', () => {
    const snap = buildSnapshot(areas({ Closed: { start_date: '1895' } }), [rer([1, 2, 3].map(areaMember))]);
    expect(snap.stations.map(s => s.name)).toEqual(['Open A', 'Closed', 'Open B']);
  });

  it('ignores a closed bus stop node', () => {
    const nodes = [
      { ...stopNode(21, 'Gone', at(5), 2.4), tags: { public_transport: 'stop_position', name: 'Gone', 'disused:public_transport': 'stop_position' } },
      stopNode(22, 'Here', at(6), 2.4)
    ];
    const snap = buildSnapshot([...areas(), ...nodes], [
      route(101, { route: 'bus', network: 'RATP', ref: '7' }, [21, 22].map(stopMember))
    ]);
    expect(snap.extraStations.map(s => s.name)).toEqual(['Here']);
  });

  it('drops a route that is itself not open yet', () => {
    const snap = buildSnapshot(areas(), [
      route(100, { route: 'subway', network: 'Métro de Paris', ref: '15', state: 'proposed' }, [1, 3].map(areaMember))
    ]);
    expect(snap.routes).toEqual([]);
    expect(snap.stations).toEqual([]);
  });
});

describe('buildSnapshot station anchoring (Luxembourg RER B)', () => {
  // Stop areas are named after exits; the station node is "Luxembourg". The exits are just
  // beyond the 250 m stop-area clustering radius, and each is within 150 m of the station node.
  const portRoyal = area(1, 'Port Royal', 48.84008, 2.33707);
  const comte = area(2, 'Auguste Comte', 48.8445, 2.3392);
  const lussac = area(3, 'R. Gay-Lussac', 48.8467, 2.3407);
  const michel = area(4, 'Saint-Michel Notre-Dame', 48.8532, 2.3445);
  const luxembourg = { type: 'node', id: 900, lat: 48.8456, lon: 2.33995, tags: { name: 'Luxembourg', railway: 'station', public_transport: 'station' } };
  const rerB = members => route(100, { route: 'train', network: 'RER', operator: 'RATP', ref: 'B' }, members);

  const build = (nodes = [luxembourg]) => buildSnapshot([portRoyal, comte, lussac, michel, ...nodes], [
    rerB([1, 3, 4].map(areaMember)),
    rerB([4, 2, 1].map(areaMember))
  ]);

  it('names the site after the station and merges the two exits into one', () => {
    const snap = build();

    expect(snap.stations.map(s => s.name)).toEqual(['Port Royal', 'Luxembourg', 'Saint-Michel Notre-Dame']);
    expect(snap.stations.find(s => s.name === 'Luxembourg').lines).toEqual([{ ref: 'B', mode: 'rer' }]);
  });

  it('puts the merged site on the station node and draws the route through it once', () => {
    const snap = build();

    const lux = snap.stations.find(s => s.name === 'Luxembourg');
    expect([lux.lat, lux.lon]).toEqual([48.8456, 2.33995]);
    expect(snap.routes).toHaveLength(1);
    expect(snap.routes[0].coords).toEqual([[48.84008, 2.33707], [48.8456, 2.33995], [48.8532, 2.3445]]);
  });

  it('reports what it renamed and merged', () => {
    const { report } = build();
    expect(report.merged).toHaveLength(1);
    expect(report.merged[0]).toMatch(/^Luxembourg <- /);
    expect(report.renamed).toContain('Auguste Comte -> Luxembourg');
  });

  it('keeps the stop-area name when no station node is close', () => {
    const farAway = { ...luxembourg, lat: 48.8505, lon: 2.3398 };
    const snap = build([farAway]);
    expect(snap.stations.map(s => s.name)).toEqual(['Port Royal', 'Auguste Comte', 'R. Gay-Lussac', 'Saint-Michel Notre-Dame']);
  });

  it('does not merge or rename sites that anchor to different stations', () => {
    const other = { type: 'node', id: 901, lat: 48.8467, lon: 2.34072, tags: { name: 'Autre', railway: 'station' } };
    const snap = build([luxembourg, other]);
    expect(snap.stations.map(s => s.name)).toEqual(['Port Royal', 'Auguste Comte', 'R. Gay-Lussac', 'Saint-Michel Notre-Dame']);
  });

  it('leaves a single site alone even when a differently named station node is close', () => {
    const snap = buildSnapshot([portRoyal, comte, michel, luxembourg], [rerB([1, 2, 4].map(areaMember))]);
    expect(snap.stations.map(s => s.name)).toEqual(['Port Royal', 'Auguste Comte', 'Saint-Michel Notre-Dame']);
    expect(snap.report).toEqual({ renamed: [], merged: [] });
  });

  it('does not merge neighbouring sites that share no line (Gare du Nord and Magenta)', () => {
    const nord = area(11, 'Gare du Nord', 48.8809, 2.3553);
    const magenta = area(12, 'Gare de Magenta', 48.8830, 2.3573);
    const hub = { type: 'node', id: 910, lat: 48.8820, lon: 2.3563, tags: { name: 'Gare du Nord (M\u00e9tro)', railway: 'station' } };
    const snap = buildSnapshot([nord, magenta, area(13, 'Far', 48.9, 2.4), hub], [
      route(100, { route: 'subway', network: 'Métro de Paris', ref: '4' }, [11, 13].map(areaMember)),
      route(101, { route: 'train', network: 'RER', operator: 'RATP', ref: 'E' }, [12, 13].map(areaMember))
    ]);
    expect(snap.stations.map(s => s.name).sort()).toEqual(['Far', 'Gare de Magenta', 'Gare du Nord']);
    expect(snap.report.merged).toEqual([]);
  });

  it('ignores a closed station node', () => {
    const closed = { ...luxembourg, tags: { ...luxembourg.tags, disused: 'yes' } };
    const snap = build([closed]);
    expect(snap.stations.map(s => s.name)).toContain('Auguste Comte');
    expect(snap.stations.map(s => s.name)).not.toContain('Luxembourg');
  });

  it('ignores nodes that are not stations, such as exits and platforms', () => {
    const exit = { type: 'node', id: 902, lat: 48.8467, lon: 2.3407, tags: { name: 'Rue Gay-Lussac', railway: 'subway_entrance' } };
    const platform = { type: 'node', id: 903, lat: 48.8468, lon: 2.3410, tags: { name: 'Luxembourg', public_transport: 'platform' } };
    const snap = build([exit, platform]);
    expect(snap.stations.map(s => s.name)).toEqual(['Port Royal', 'Auguste Comte', 'R. Gay-Lussac', 'Saint-Michel Notre-Dame']);
  });
});

describe('buildSnapshot station complexes (Saint-Lazare)', () => {
  const metro = ref => ({ route: 'subway', network: 'M\u00e9tro de Paris', ref });
  const rer = ref => ({ route: 'train', network: 'RER', operator: 'RATP', ref });
  const train = ref => ({ route: 'train', network: 'Transilien', ref });

  // The complex is about 320 m across, so its stop areas do not fit in the 250 m clustering radius.
  const lazare13 = area(1, 'Saint-Lazare (13)', 48.8754, 2.3255);
  const lazare12 = area(2, 'Saint-Lazare (12)', 48.8756, 2.3271);
  const gare = area(3, 'Gare Saint-Lazare', 48.8770, 2.3252);
  const haussmann = area(4, 'Haussmann - Saint-Lazare', 48.8752, 2.3286);
  const far = area(9, 'Far', 48.95, 2.40);

  const lines = [
    route(100, metro('13'), [1, 9].map(areaMember)),
    route(101, metro('12'), [2, 9].map(areaMember)),
    route(102, train('L'), [3, 9].map(areaMember)),
    route(103, rer('E'), [4, 9].map(areaMember))
  ];

  it('makes one station of the stop areas that share a name, with all their lines', () => {
    const snap = buildSnapshot([lazare13, lazare12, gare, haussmann, far], lines);
    const complex = snap.stations.filter(s => s.name.includes('Lazare'));

    expect(complex).toHaveLength(1);
    expect(complex[0].name).toBe('Saint-Lazare');
    expect(complex[0].lines).toEqual([
      { ref: '12', mode: 'metro' }, { ref: '13', mode: 'metro' }, { ref: 'E', mode: 'rer' }, { ref: 'L', mode: 'transilien' }
    ]);
  });

  it('keeps metro stations that merely share a street name apart', () => {
    const convention = area(11, 'Convention - Vaugirard', 48.8366, 2.2965);
    const vaugirard = area(12, 'Vaugirard - Favorites', 48.8394, 2.3009);
    const snap = buildSnapshot([convention, vaugirard, far], [
      route(110, metro('12'), [11, 12, 9].map(areaMember))
    ]);

    expect(snap.stations.map(s => s.name).sort()).toEqual(['Convention - Vaugirard', 'Far', 'Vaugirard - Favorites']);
  });

  it('does not stretch a complex over a neighbouring station with another name', () => {
    const havre = area(21, 'Havre-Caumartin', 48.8730, 2.3280);
    const snap = buildSnapshot([lazare13, lazare12, gare, haussmann, havre, far], [
      ...lines,
      route(120, metro('3'), [21, 9].map(areaMember))
    ]);

    expect(snap.stations.find(s => s.name === 'Havre-Caumartin').lines).toEqual([{ ref: '3', mode: 'metro' }]);
  });

  it('does not cover the entrance at the far end of a complex with a station of its own', () => {
    const entrance = { type: 'node', id: 700, lat: 48.8757, lon: 2.3292, tags: { name: 'Rue de Caumartin', railway: 'subway_entrance' } };
    const stop = stopNode(701, 'Haussmann', 48.8757, 2.3290);
    const snap = buildSnapshot([lazare13, lazare12, gare, haussmann, entrance, stop, far], [
      ...lines,
      route(130, rer('E'), [{ type: 'node', ref: 701, role: 'stop' }, areaMember(9)])
    ]);

    expect(snap.stations.map(s => s.name)).not.toContain('Rue de Caumartin');
  });
});

describe('buildSnapshot neighbouring stations (Auber and Havre-Caumartin)', () => {
  const auber = area(1, 'Auber', 48.8726, 2.3299);
  const havre = area(2, 'Havre-Caumartin (9)', 48.8736, 2.3280);
  const auberNode = { type: 'node', id: 800, lat: 48.8726, lon: 2.3311, tags: { name: 'Auber', railway: 'station' } };
  const havreNode = { type: 'node', id: 801, lat: 48.8737, lon: 2.3274, tags: { name: 'Havre - Caumartin', railway: 'station' } };
  const routes = [
    route(100, { route: 'train', network: 'RER', operator: 'RATP', ref: 'A' }, [1, 3].map(areaMember)),
    route(101, { route: 'subway', network: 'M\u00e9tro de Paris', ref: '9' }, [2, 3].map(areaMember))
  ];
  const far = area(3, 'Far', 48.95, 2.4);

  it('keeps two stop areas within 250 m apart when each is anchored to a different named station', () => {
    const snap = buildSnapshot([auber, havre, far, auberNode, havreNode], routes);
    expect(snap.stations.map(s => s.name).sort()).toEqual(['Auber', 'Far', 'Havre-Caumartin (9)']);
  });

  it('still merges them when no station node tells them apart', () => {
    const snap = buildSnapshot([auber, havre, far], routes);
    expect(snap.stations.filter(s => s.name !== 'Far')).toHaveLength(1);
  });

  it('names a merged site after the stop area that matches its station node, not the longest name', () => {
    const street = area(11, 'Place du 18 Juin 1940 - Rue du D\u00e9part', 48.8431, 2.3230);
    const montparnasse = area(12, 'Montparnasse-Bienven\u00fce', 48.8421, 2.3203);
    const node = { type: 'node', id: 802, lat: 48.8425, lon: 2.3215, tags: { name: 'Montparnasse - Bienven\u00fce', railway: 'station' } };
    const snap = buildSnapshot([street, montparnasse, far, node], [
      route(110, { route: 'subway', network: 'M\u00e9tro de Paris', ref: '6' }, [11, 12, 3].map(areaMember))
    ]);

    expect(snap.stations.map(s => s.name)).toContain('Montparnasse-Bienven\u00fce');
    expect(snap.stations.map(s => s.name)).not.toContain('Place du 18 Juin 1940 - Rue du D\u00e9part');
  });
});