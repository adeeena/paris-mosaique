#!/usr/bin/env node
/**
 * Fetches IDF (Île-de-France) public-transport data from the Overpass API and writes two
 * pre-processed snapshots:
 *   src/app/pages/map/idf-datapoints.ts        rail modes (metro, RER, Transilien, tram), shipped eagerly
 *   src/app/pages/map/idf-datapoints-extra.ts  cable car, bus and other modes, loaded on demand
 *
 * Run:  npm run update-datapoints
 *
 * Requires Node >= 18 (built-in fetch).
 */

'use strict';

// Some corporate proxies do TLS inspection which breaks certificate validation.
// This script is a local dev/CI tool — bypassing for outbound fetch is safe here.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { existsSync, readFileSync, mkdirSync, writeFileSync } = require('fs');
const { resolve } = require('path');
const { buildSnapshot } = require('./idf-pipeline');
const { buildTracks } = require('./idf-tracks');
const { MODES } = require('./transport-modes');

// IDF bounding box (matches MAP_COORDS.bounds in variables.js)
const IDF = { s: 48.0, w: 1.5, n: 49.2, e: 3.5 };

const OUT_DIR = resolve(__dirname, '../src/app/pages/map');
const OUT_RAIL = resolve(OUT_DIR, 'idf-datapoints.ts');
const OUT_EXTRA = resolve(OUT_DIR, 'idf-datapoints-extra.ts');
const OUT_TRACKS = resolve(OUT_DIR, 'idf-tracks.ts');

// Mirrors are tried in order on failure. Override with OVERPASS_URL (single endpoint).
const MIRRORS = process.env.OVERPASS_URL
  ? [process.env.OVERPASS_URL]
  : [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://overpass.private.coffee/api/interpreter'
    ];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function postWithRetry(query, label, maxAttempts = 6) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const url = MIRRORS[(attempt - 1) % MIRRORS.length];
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'parmap-idf-fetcher/1.0 (https://github.com/parmap)'
        },
        body: `data=${encodeURIComponent(query)}`
      });
      if (resp.ok) return await resp.json();
      const retryable = resp.status === 429 || resp.status >= 500;
      if (!retryable || attempt === maxAttempts) throw new Error(`Overpass ${label} failed: ${resp.status}`);
      console.warn(`  ${label} got ${resp.status} from ${url} — retrying (attempt ${attempt}/${maxAttempts})...`);
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      console.warn(`  ${label} failed on ${url} (${err.message}) — retrying (attempt ${attempt}/${maxAttempts})...`);
    }
    await sleep(5000 * attempt);
  }
}

const oneLine = items => '[\n' + items.map(i => '  ' + JSON.stringify(i)).join(',\n') + '\n]';

// OVERPASS_CACHE=<dir> reuses earlier responses, so the offline steps can be re-run without the flaky mirrors.
async function cachedQuery(name, query, label) {
  const dir = process.env.OVERPASS_CACHE;
  const file = dir && resolve(dir, `${name}.json`);
  if (file && existsSync(file)) {
    console.log(`  ${label}: using cached ${file}`);
    return JSON.parse(readFileSync(file, 'utf8'));
  }
  const result = await postWithRetry(query, label);
  if (file) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(result));
  }
  return result;
}

function countBy(items, pick) {
  const counts = {};
  for (const item of items) counts[pick(item)] = (counts[pick(item)] || 0) + 1;
  return counts;
}

async function main() {
  const { s, w, n, e } = IDF;
  const bbox = `(${s},${w},${n},${e})`;

  // q1: stop_area relations + stop_position nodes + railway nodes
  const q1 = `[out:json][timeout:180];`
    + `(relation["public_transport"="stop_area"]${bbox};`
    + `node["public_transport"="stop_position"]${bbox};`
    + `node["railway"~"tram_stop|station|halt|subway_entrance|subway"]${bbox};`
    + `);out center tags;`;

  // q2: rail-family route relations; q3: every other public-transport route type
  const q2 = `[out:json][timeout:180];`
    + `relation["type"="route"]["route"~"^(subway|tram|light_rail|train)$"]["ref"]${bbox};out body;`;
  const q3 = `[out:json][timeout:180];`
    + `relation["type"="route"]["route"~"^(bus|trolleybus|ferry|funicular|monorail|aerialway|cable_car)$"]${bbox};out body;`;

  console.log('Querying Overpass API for IDF bounds', IDF, '...');
  // Sequential to avoid hammering the server when it is already busy
  const stops = await cachedQuery('stops', q1, 'stops');
  const railRoutes = await cachedQuery('rail-routes', q2, 'rail routes');
  const otherRoutes = await cachedQuery('other-routes', q3, 'other routes');
  // q4: track geometry (way shapes, clipped to the bounding box) of the lines drawn along their track
  const q4 = `[out:json][timeout:240];`
    + `relation["type"="route"]["route"="train"]["network"~"^(Transilien|RER)$"]${bbox};out geom${bbox};`;
  const trackRelations = await cachedQuery('track-geometry', q4, 'track geometry');
  console.log(`  stop elements : ${(stops.elements || []).length}`);
  console.log(`  rail routes   : ${(railRoutes.elements || []).length}`);
  console.log(`  other routes  : ${(otherRoutes.elements || []).length}`);
  console.log(`  track routes  : ${(trackRelations.elements || []).length}`);

  const tracks = buildTracks(trackRelations.elements || []);
  console.log(`Tracks: ${tracks.ways.length} ways, ${tracks.lines.length} lines, `
    + `${Math.round(tracks.ways.reduce((n, w) => n + w.length, 0) / 1024)} KB encoded`);

  const snap = buildSnapshot(
    stops.elements || [],
    [...(railRoutes.elements || []), ...(otherRoutes.elements || [])]
  );

  console.log(`Rail stations: ${snap.stations.length}, rail routes: ${snap.routes.length}`);
  console.log(`Extra sites: ${snap.extraStations.length}, attached to rail stations: ${snap.extraStationLines.length}, extra routes: ${snap.extraRoutes.length}`);
  console.log('Routes by mode:', countBy([...snap.routes, ...snap.extraRoutes], r => r.mode));
  console.log(`Station anchoring: ${snap.report.renamed.length} renamed, ${snap.report.merged.length} merged`);
  for (const line of snap.report.merged) console.log(`  merged  ${line}`);
  for (const line of snap.report.renamed.slice(0, 60)) console.log(`  renamed ${line}`);

  const now = new Date().toISOString();
  const header = (refresh) =>
    `// AUTO-GENERATED — do not edit manually.\n`
    + `// Generated : ${now}\n`
    + `// Source    : Overpass API, IDF bounds ${JSON.stringify(IDF)}\n`
    + `// Refresh   : ${refresh}\n\n`;

  const modeUnion = MODES.map(m => `'${m}'`).join(' | ');
  const rail = header('npm run update-datapoints')
    + `export type TransportMode = ${modeUnion};\n\n`
    + `export interface IdfLine {\n`
    + `  /** Line reference, e.g. "4", "A", "T3a", "H". Not unique across modes. */\n`
    + `  ref: string;\n`
    + `  mode: TransportMode;\n`
    + `}\n\n`
    + `export interface IdfStation {\n`
    + `  lat: number;\n`
    + `  lon: number;\n`
    + `  name: string;\n`
    + `  /** Other names the station is in use under, e.g. "Gare Saint-Lazare" for Saint-Lazare. */\n`
    + `  aliases?: string[];\n`
    + `  lines: IdfLine[];\n`
    + `}\n\n`
    + `export interface IdfRoute {\n`
    + `  ref: string;\n`
    + `  mode: TransportMode;\n`
    + `  /** Ordered [lat, lon] of stops along this route variant */\n`
    + `  coords: Array<[number, number]>;\n`
    + `}\n\n`
    + `/** Rail modes only (metro, rer, transilien, tram). Other modes live in idf-datapoints-extra.ts. */\n`
    + `export const IDF_STATIONS: IdfStation[] = ${oneLine(snap.stations)};\n\n`
    + `export const IDF_ROUTES: IdfRoute[] = ${oneLine(snap.routes)};\n`;

  const extra = header('npm run update-datapoints')
    + `import type { IdfLine, IdfRoute, IdfStation } from './idf-datapoints';\n\n`
    + `/** Sites that no rail station covers (bus stops, cable car, ferry piers, ...). */\n`
    + `export const IDF_EXTRA_STATIONS: IdfStation[] = ${oneLine(snap.extraStations)};\n\n`
    + `/** Non-rail lines that also serve a rail station; \`station\` indexes IDF_STATIONS. */\n`
    + `export const IDF_EXTRA_STATION_LINES: Array<{ station: number; lines: IdfLine[] }> = ${oneLine(snap.extraStationLines)};\n\n`
    + `export const IDF_EXTRA_ROUTES: IdfRoute[] = ${oneLine(snap.extraRoutes)};\n`;

  writeFileSync(OUT_RAIL, rail, 'utf8');
  writeFileSync(OUT_EXTRA, extra, 'utf8');

  const trackFile = header('npm run update-datapoints')
    + `import type { TransportMode } from './idf-datapoints';\n\n`
    + `export interface IdfTrackLine {\n`
    + `  mode: TransportMode;\n`
    + `  ref: string;\n`
    + `  /** Indexes into IDF_TRACK_WAYS: every way used by any route variant or direction of the line. */\n`
    + `  ways: number[];\n`
    + `}\n\n`
    + `/** Polyline-encoded (1e-5 degrees) track pieces; a way that leaves the map bounds has several, joined by ';'. */\n`
    + `export const IDF_TRACK_WAYS: string[] = ${oneLine(tracks.ways)};\n\n`
    + `export const IDF_TRACK_LINES: IdfTrackLine[] = ${oneLine(tracks.lines)};\n`;
  writeFileSync(OUT_TRACKS, trackFile, 'utf8');
  console.log(`Written → ${OUT_RAIL}\nWritten → ${OUT_EXTRA}\nWritten → ${OUT_TRACKS}`);
}

main().catch(err => {
  console.error('fetch-idf-datapoints failed:', err.message || err);
  process.exit(1);
});
