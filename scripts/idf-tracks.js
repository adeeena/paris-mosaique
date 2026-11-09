'use strict';

/**
 * Builds the track geometry of heavy-rail lines from Overpass route relations fetched with `out geom`.
 * Each OSM way is stored once; a line references the ways of all its route variants and directions.
 */

const { classifyRoute, normalizeRef, isInactive } = require('./transport-modes');
const { encodePolyline, simplifyPath, densifyPath, PointGrid } = require('./geometry');

/** Modes drawn along their real track instead of straight between stops. */
const TRACK_MODES = new Set(['rer', 'transilien']);
const SIMPLIFY_TOLERANCE_M = 3;
/** Tracks of one line closer than this are drawn once; the two directions of a corridor are 3-8 m apart. */
const PARALLEL_TRACK_M = 15;
/** Shorter ways (switches, crossovers) are never merged: dropping one would leave a visible gap. */
const MIN_MERGEABLE_WAY_M = 2 * PARALLEL_TRACK_M;
/** A duplicate may have at most this many samples (10 m each) away from kept tracks, so a diverging branch survives. */
const MERGE_SLACK_MAX_SAMPLES = 2;
/** Roles of the ways that carry the track; platforms and stop positions are not track. */
const TRACK_ROLES = new Set(['', 'forward', 'backward']);

/** Overpass leaves null entries where a clipped way leaves the bounding box; split the path there. */
function splitAtGaps(geometry) {
  const pieces = [];
  let current = [];
  for (const p of geometry) {
    if (p && p.lat != null && p.lon != null) {
      current.push([p.lat, p.lon]);
    } else {
      if (current.length >= 2) pieces.push(current);
      current = [];
    }
  }
  if (current.length >= 2) pieces.push(current);
  return pieces;
}

/** Keeps one way per corridor: a way that runs along tracks already kept (e.g. the opposite direction) is dropped. */
function dropParallelWays(wayIds, piecesOf, parallelM) {
  const grid = new PointGrid(parallelM);
  const kept = [];
  for (const id of wayIds) {
    const pieces = piecesOf(id);
    const samples = pieces.flatMap(p => densifyPath(p, 10));
    const lengthM = samples.length * 10;
    const covered = samples.filter(p => grid.hasNear(p)).length;
    const slack = Math.min(MERGE_SLACK_MAX_SAMPLES, Math.floor(samples.length / 10));
    if (lengthM >= MIN_MERGEABLE_WAY_M && samples.length - covered <= slack) continue;

    kept.push(id);
    for (const piece of pieces) for (const p of densifyPath(piece, 5)) grid.add(p);
  }
  return kept;
}

function buildTracks(routeElements, {
  modes = TRACK_MODES,
  toleranceM = SIMPLIFY_TOLERANCE_M,
  parallelM = PARALLEL_TRACK_M
} = {}) {
  const wayIndex = new Map();
  const wayPieces = [];
  const lines = new Map();

  for (const el of routeElements) {
    if (el.type !== 'relation' || el.tags?.type !== 'route' || isInactive(el.tags)) continue;
    const mode = classifyRoute(el.tags);
    if (!modes.has(mode)) continue;
    const ref = normalizeRef(mode, el.tags.ref || el.tags.name || '');
    if (!ref) continue;

    const key = `${mode}|${ref}`;
    const line = lines.get(key) || { mode, ref, ways: new Set() };
    lines.set(key, line);

    for (const member of el.members || []) {
      if (member.type !== 'way' || !Array.isArray(member.geometry) || !TRACK_ROLES.has(member.role || '')) continue;

      let index = wayIndex.get(member.ref);
      if (index === undefined) {
        const pieces = splitAtGaps(member.geometry).map(p => simplifyPath(p, toleranceM)).filter(p => p.length >= 2);
        index = pieces.length ? wayPieces.push(pieces) - 1 : -1;
        wayIndex.set(member.ref, index);
      }
      if (index >= 0) line.ways.add(index);
    }
  }

  const keptByLine = [...lines.values()]
    .map(l => ({ mode: l.mode, ref: l.ref, ways: dropParallelWays([...l.ways].sort((a, b) => a - b), id => wayPieces[id], parallelM) }))
    .filter(l => l.ways.length > 0);

  // Only ways some line still uses are written, renumbered in their original order.
  const used = [...new Set(keptByLine.flatMap(l => l.ways))].sort((a, b) => a - b);
  const newIndex = new Map(used.map((old, i) => [old, i]));

  return {
    ways: used.map(old => wayPieces[old].map(encodePolyline).join(';')),
    lines: keptByLine
      .map(l => ({ mode: l.mode, ref: l.ref, ways: l.ways.map(old => newIndex.get(old)) }))
      .sort((a, b) => a.mode.localeCompare(b.mode) || a.ref.localeCompare(b.ref, 'en', { numeric: true }))
  };
}

module.exports = { buildTracks, splitAtGaps, TRACK_MODES };
