'use strict';

/**
 * Maps OSM route-relation tags to a normalized transport mode.
 * Mode is decided from route type + network/operator, never from `ref` alone:
 * bus refs such as "4" or "A" collide with Metro and RER refs.
 */

const MODES = ['metro', 'rer', 'transilien', 'tram', 'cable_car', 'bus', 'other'];

/** OSM route types the fetcher requests. */
const ROUTE_TYPES = [
  'subway', 'tram', 'light_rail', 'train', 'bus', 'trolleybus',
  'ferry', 'funicular', 'monorail', 'aerialway', 'cable_car'
];

/** Route types whose stops form the rail-family station set. */
const RAIL_ROUTE_TYPES = ['subway', 'tram', 'light_rail', 'train'];

const AUTOMATED_SHUTTLE = /CDGVAL|Orlyval|LISA/i;
const INTERCITY_COACH = /flixbus|blablabus|ouibus|eurolines|ouigo/i;

function classifyRoute(tags) {
  const route = tags.route || '';
  const network = tags.network || '';
  const operator = tags.operator || '';
  const ref = tags.ref || '';

  switch (route) {
    case 'subway':
      return AUTOMATED_SHUTTLE.test(network) || AUTOMATED_SHUTTLE.test(ref) ? 'other' : 'metro';
    case 'tram':
      return 'tram';
    case 'light_rail':
      return /tramway/i.test(network) || /^T\d/.test(ref) ? 'tram' : 'other';
    case 'train':
      if (/\bRER\b/.test(network)) return 'rer';
      if (/transilien/i.test(network)) return 'transilien';
      if (/^[A-E]$/.test(ref) && /RATP/.test(operator)) return 'rer';
      return 'other';
    case 'bus':
    case 'trolleybus':
      return INTERCITY_COACH.test(network) ? 'other' : 'bus';
    case 'aerialway':
    case 'cable_car':
      return 'cable_car';
    default:
      return 'other';
  }
}

/** Align OSM refs with the keys used by the app's line configuration. */
function normalizeRef(mode, ref) {
  const trimmed = String(ref || '').trim();
  if (mode === 'metro') return trimmed.replace(/^(\d+)bis$/i, '$1b');
  return trimmed;
}

const ACTIVE_RAILWAY = new Set(['station', 'halt', 'tram_stop', 'subway_entrance', 'stop']);
const INACTIVE_VALUES = new Set(['disused', 'disused_station', 'abandoned', 'abandoned_station', 'razed', 'construction', 'proposed', 'planned']);
const INACTIVE_STATE = new Set(['proposed', 'construction', 'disused', 'abandoned', 'planned']);
const LIFECYCLE_KEY = /^(disused|abandoned|razed|demolished|was|proposed|construction|planned):(public_transport|railway|station|route|train|subway|tram|light_rail)/;

/** Compares OSM partial dates (YYYY, YYYY-MM, YYYY-MM-DD) with `now`; null when unparseable. */
function compareDate(value, now) {
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(String(value || '').trim());
  if (!m) return null;
  const date = Date.UTC(+m[1], m[2] ? +m[2] - 1 : 0, m[3] ? +m[3] : 1);
  return Math.sign(date - now);
}

/**
 * True for objects that are closed, never opened, or not yet open: lifecycle tags,
 * a future opening date, or a past end date. They must not appear on the map.
 */
function isInactive(tags, now = Date.now()) {
  if (!tags) return false;
  if (tags.disused === 'yes' || tags.abandoned === 'yes') return true;
  if (INACTIVE_VALUES.has(tags.railway) || INACTIVE_VALUES.has(tags.public_transport)) return true;
  if (INACTIVE_STATE.has(tags.state)) return true;
  if (Object.keys(tags).some(k => LIFECYCLE_KEY.test(k)) && !ACTIVE_RAILWAY.has(tags.railway)) return true;
  if (compareDate(tags.end_date, now) === -1) return true;
  for (const key of ['opening_date', 'start_date']) {
    if (compareDate(tags[key], now) === 1) return true;
  }
  return false;
}

module.exports = { MODES, ROUTE_TYPES, RAIL_ROUTE_TYPES, classifyRoute, normalizeRef, isInactive };
