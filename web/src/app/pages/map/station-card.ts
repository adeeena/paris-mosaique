import { t } from '../../i18n';
import { formatDistance, formatDuration } from './distance';
import type { DefunctStation } from './defunct-stations';
import type { IdfLine } from './idf-datapoints';
import type { Site } from './transport-data';
import { cleanName, escapeHtml, lineBadgesHtml, visibleLines } from './transport-lines';
import { isRailMode } from './transport-modes';
import type { WalkOutcome } from './walking-route.service';

const GHOST_STATIONS_ARTICLE = 'https://fr.wikipedia.org/wiki/Stations_fant%C3%B4mes_du_m%C3%A9tro_de_Paris';
const EXTERNAL_LINK_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';

/** One row of badges fits the fixed card width; the rest is summarised as "+N". */
export const CARD_MAX_BADGES = 8;
/** Popup content width: the card is 240 px including its 10 px side padding. */
export const CARD_CONTENT_WIDTH = 219;

/** The station card shared by the hover tooltip and the popups: name, aliases below it, line badges. */
export function stationCard(site: Site): string {
  const shown = cleanName(site.name || '?');
  const name = escapeHtml(shown);
  const aliases = (site.aliases ?? []).map(cleanName).filter(alias => alias !== shown).map(escapeHtml);
  // Only a closed station gets a heading, so nobody walks to it.
  const heading = site.defunct
    ? `<div class="parmap-voronoi-label">${t('card.defunct')} \u00b7 ${escapeHtml(defunctLabel(site.defunct))}</div>`
    : '';
  const aliasRow = aliases.length ? `<div class="parmap-tip-alias" title="${aliases.join(', ')}">${aliases.join(' \u00b7 ')}</div>` : '';
  return heading
    + `<div class="parmap-tip-name" title="${name}">${name}</div>`
    + aliasRow
    + `<div class="parmap-tip-badges">${lineBadgesHtml(visibleLines(site.lines), CARD_MAX_BADGES)}</div>`;
}

/** An outside page about a station. */
export interface StationLink {
  label: string;
  href: string;
  title: string;
}

/** RATP's own station pages cover its metro and RER A and B; the other lines are run by SNCF or others. */
function servedByRatp(lines: readonly IdfLine[]): boolean {
  return lines.some(l => l.mode === 'metro' || (l.mode === 'rer' && (l.ref === 'A' || l.ref === 'B')));
}

/**
 * Links to pages about a station. RATP station pages have slugs that cannot be derived from the name
 * ("Châtelet - Les Halles" is /chatelet, "Gare de l'Est" is /gare-de-lest-verdun) and ratp.fr blocks scripts from
 * checking them, so that link searches ratp.fr instead of guessing a page that may not exist.
 */
export function stationLinks(site: Site): StationLink[] {
  const name = cleanName(site.name || '');
  const links: StationLink[] = [];
  if (name && servedByRatp(site.lines)) {
    links.push({
      label: 'RATP',
      title: t('link.ratp'),
      href: `https://duckduckgo.com/?q=${encodeURIComponent(`site:ratp.fr vos-stations ${name}`)}`
    });
  }
  const rail = site.lines.some(l => isRailMode(l.mode));
  if (name && rail) {
    const query = site.lines.some(l => l.mode === 'metro') ? `${name} (métro de Paris)` : `gare ${name}`;
    links.push({
      label: 'Wikipedia',
      title: t('link.wikipedia'),
      href: `https://fr.wikipedia.org/w/index.php?search=${encodeURIComponent(query)}&go=Go`
    });
  }
  links.push({
    label: 'OSM',
    title: t('link.osm'),
    href: `https://www.openstreetmap.org/?mlat=${site.lat}&mlon=${site.lon}#map=18/${site.lat}/${site.lon}`
  });
  return links;
}

/** A row of links; they open in a new tab. */
export function linksRow(links: readonly StationLink[]): string {
  const anchors = links.map(l =>
    `<a href="${escapeHtml(l.href)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(l.title)}">${escapeHtml(l.label)}${EXTERNAL_LINK_ICON}</a>`);
  return `<div class="parmap-tip-links">${anchors.join('')}</div>`;
}

/** The popup of a station marker: the card and the links to pages about it. */
export function stationPopup(site: Site): string {
  return stationCard(site) + linksRow(stationLinks(site));
}

/** "Closed 1939", "Never opened", "Replaced 1977" or "Unused platforms". */
export function defunctLabel(station: DefunctStation): string {
  switch (station.status) {
    case 'closed': return t('defunct.closed', { year: station.year });
    case 'relocated': return t('defunct.replaced', { year: station.year });
    case 'never-opened': return t('defunct.neverOpened');
    default: return t('defunct.unused');
  }
}

/** The popup of a defunct station: the usual card, plus a short note that may wrap. */
export function defunctCard(station: DefunctStation): string {
  const note = escapeHtml(station.note + (station.approximate ? ` ${t('defunct.approximate')}` : ''));
  const lines = station.lines.map(ref => ({ ref, mode: 'metro' as const }));
  return `<div class="parmap-voronoi-label">${t('card.defunct')} \u00b7 ${escapeHtml(defunctLabel(station))}</div>`
    + `<div class="parmap-tip-name" title="${escapeHtml(station.name)}">${escapeHtml(station.name)}</div>`
    + `<div class="parmap-tip-badges">${lineBadgesHtml(lines, CARD_MAX_BADGES)}</div>`
    + `<div class="parmap-tip-note">${note}</div>`
    + linksRow([
      { label: 'Wikipedia', title: t('link.ghost'), href: GHOST_STATIONS_ARTICLE },
      { label: 'OSM', title: t('link.position'), href: `https://www.openstreetmap.org/?mlat=${station.lat}&mlon=${station.lon}#map=18/${station.lat}/${station.lon}` }
    ]);
}

/** The two distance rows below a station card; `walk` is null while the route is still being fetched. */
export function distanceRows(straightM: number, walk: WalkOutcome | null): string {
  return `<div class="parmap-voronoi-dist">`
    + `<span>${t('distance.direct')}</span><span>${formatDistance(straightM)}</span>`
    + `<span>${t('distance.walking')}</span><span>${escapeHtml(walkText(walk))}</span></div>`;
}

function walkText(walk: WalkOutcome | null): string {
  if (walk === null) return '\u2026';
  if (walk === 'none') return t('distance.unable');
  if (walk === 'unavailable') return '-';
  return `${formatDistance(walk.meters)} \u00b7 ${formatDuration(walk.seconds)}`;
}