import type { DefunctStation } from './defunct-stations';
import { defunctCard, defunctLabel, linksRow, stationCard, stationLinks, stationPopup } from './station-card';
import type { Site } from './transport-data';

const site = (extra: Partial<Site> = {}): Site => ({
  lat: 48.85, lon: 2.35, name: 'Saint-Lazare', lines: [{ ref: '3', mode: 'metro' }], ...extra
});

describe('stationCard', () => {
  it('puts a "Defunct" heading with the status above a closed station', () => {
    const closed: DefunctStation = { name: 'Arsenal', lines: ['5'], status: 'closed', year: 1939, note: 'n', lat: 48.85, lon: 2.36 };
    const html = stationCard(site({ name: 'Arsenal', defunct: closed }));

    expect(html).toContain('<div class="parmap-voronoi-label">Defunct \u00b7 Closed 1939</div>');
  });

  it('has no heading for a live station, just the name and the badges', () => {
    const html = stationCard(site());

    expect(html).not.toContain('parmap-voronoi-label');
    expect(html.indexOf('parmap-tip-name')).toBeLessThan(html.indexOf('parmap-tip-badges'));
  });

  it('shows Jouy-en-Josas with its Transilien V badge', () => {
    const html = stationCard(site({ name: 'Jouy-en-Josas', lines: [{ ref: 'V', mode: 'transilien' }] }));

    expect(html).toContain('>Jouy-en-Josas</div>');
    expect(html).toContain('>V</span>');
  });

  it('shows the aliases on a dimmed row of their own below the name', () => {
    const html = stationCard(site({ aliases: ['Haussmann - Saint-Lazare', 'Gare Saint-Lazare'] }));

    expect(html).toContain('<div class="parmap-tip-alias" title="Haussmann - Saint-Lazare, Gare Saint-Lazare">Haussmann - Saint-Lazare \u00b7 Gare Saint-Lazare</div>');
    expect(html.indexOf('parmap-tip-name')).toBeLessThan(html.indexOf('parmap-tip-alias'));
    expect(html.indexOf('parmap-tip-alias')).toBeLessThan(html.indexOf('parmap-tip-badges'));
  });

  it('does not repeat the name as an alias once its qualifier is stripped', () => {
    const html = stationCard(site({ name: 'Pont (tram)', aliases: ['Pont', 'Pont du Nord'] }));

    expect(html).toContain('>Pont du Nord</div>');
    expect(html).not.toContain('>Pont \u00b7');
  });

  it('shows no alias row for a station without aliases', () => {
    const html = stationCard(site());

    expect(html).not.toContain('parmap-tip-alias');
    expect(html).toContain('title="Saint-Lazare"');
  });

  it('escapes the aliases', () => {
    expect(stationCard(site({ aliases: ['<b>x</b>'] }))).not.toContain('<b>x</b>');
  });
});

describe('defunctCard', () => {
  const station = (extra: Partial<DefunctStation> = {}): DefunctStation => ({
    name: 'Croix-Rouge', lines: ['10'], status: 'closed', year: 1939, note: 'Former terminus.', lat: 48.85, lon: 2.33, ...extra
  });

  it('labels each kind of defunct station', () => {
    expect(defunctLabel(station())).toBe('Closed 1939');
    expect(defunctLabel(station({ status: 'relocated', year: 1977 }))).toBe('Replaced 1977');
    expect(defunctLabel(station({ status: 'never-opened', year: undefined }))).toBe('Never opened');
    expect(defunctLabel(station({ status: 'unused-platforms', year: undefined }))).toBe('Unused platforms');
  });

  it('shows the status, name, line badges and the note', () => {
    const html = defunctCard(station());

    expect(html).toContain('Defunct \u00b7 Closed 1939');
    expect(html).toContain('>Croix-Rouge<');
    expect(html).toContain('parmap-line-badge');
    expect(html).toContain('<div class="parmap-tip-note">Former terminus.</div>');
  });

  it('says when the position is approximate', () => {
    expect(defunctCard(station({ approximate: true }))).toContain('Former terminus. Position approximate.');
    expect(defunctCard(station())).not.toContain('approximate');
  });

  it('escapes the text', () => {
    expect(defunctCard(station({ name: '<i>x</i>', note: '<b>y</b>' }))).not.toMatch(/<i>|<b>/);
  });
});

describe('station links', () => {
  const labels = (s: Site) => stationLinks(s).map(l => l.label);

  it('links a metro station to RATP, Wikipedia and OpenStreetMap', () => {
    expect(labels(site())).toEqual(['RATP', 'Wikipedia', 'OSM']);
  });

  it('searches ratp.fr for the station instead of guessing a page', () => {
    const [ratp] = stationLinks(site({ name: "Gare de l'Est (5)" }));

    expect(ratp.href).toBe('https://duckduckgo.com/?q=site%3Aratp.fr%20vos-stations%20Gare%20de%20l\'Est');
  });

  it('looks a metro station up as "<name> (métro de Paris)" and any other rail station as a "gare"', () => {
    expect(stationLinks(site())[1].href).toContain(encodeURIComponent('Saint-Lazare (métro de Paris)'));
    const rer = site({ name: 'Auber', lines: [{ ref: 'A', mode: 'rer' }] });
    expect(stationLinks(rer)[1].href).toContain(encodeURIComponent('gare Auber'));
  });

  it('leaves RATP out for a station RATP does not run, and Wikipedia out for a bus stop', () => {
    expect(labels(site({ lines: [{ ref: 'N', mode: 'transilien' }] }))).toEqual(['Wikipedia', 'OSM']);
    expect(labels(site({ lines: [{ ref: 'RER C', mode: 'rer' }, { ref: 'C', mode: 'rer' }] }))).toEqual(['Wikipedia', 'OSM']);
    expect(labels(site({ lines: [{ ref: '20', mode: 'bus' }] }))).toEqual(['OSM']);
  });

  it('points OpenStreetMap at the station', () => {
    const osm = stationLinks(site()).find(l => l.label === 'OSM')!;
    expect(osm.href).toBe('https://www.openstreetmap.org/?mlat=48.85&mlon=2.35#map=18/48.85/2.35');
  });

  it('opens links in a new tab without handing over the opener, and escapes them', () => {
    const html = linksRow([{ label: 'A&B', title: '"t"', href: 'https://x.test/?a=1&b=2' }]);

    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('href="https://x.test/?a=1&amp;b=2"');
    expect(html).toContain('>A&amp;B<svg');
    expect(html).toContain('aria-hidden="true"');
  });

  it('adds the links to the marker popup but not to the card the tooltip uses', () => {
    expect(stationPopup(site())).toContain('parmap-tip-links');
    expect(stationCard(site())).not.toContain('parmap-tip-links');
  });

  it('links a defunct station to the ghost-station article and its position', () => {
    const html = defunctCard({ name: 'Arsenal', lines: ['5'], status: 'closed', year: 1939, note: 'n', lat: 48.849, lon: 2.366 });

    expect(html).toContain('href="https://fr.wikipedia.org/wiki/Stations_fant%C3%B4mes_du_m%C3%A9tro_de_Paris"');
    expect(html).toContain('mlat=48.849&amp;mlon=2.366');
  });
});