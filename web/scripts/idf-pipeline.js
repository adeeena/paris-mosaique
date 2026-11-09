'use strict';

/**
 * Pure snapshot builder for the IDF transport data.
 * Input: raw Overpass elements. Output: rail-mode data (shipped eagerly) and
 * non-rail data (cable car, bus, other) kept separate so it can be loaded on demand.
 * Every line is stored as { ref, mode }, so identical refs in different modes stay distinct.
 */

const { classifyRoute, normalizeRef, isInactive } = require('./transport-modes');

const RAIL_MODES = new Set(['metro', 'rer', 'transilien', 'tram']);
const MODE_ORDER = ['metro', 'rer', 'transilien', 'tram', 'cable_car', 'bus', 'other'];

const STATION_CLUSTER_RADIUS = 250;
/** Stop areas that share a station name ("Saint-Lazare (13)", "Gare Saint-Lazare") are one complex up to this far apart. */
const COMPLEX_RADIUS_M = 450;
const NODE_COVER_RADIUS = 200;
const RAIL_SNAP_M = 600;
const ATTACH_NEAR_M = 40;
const ATTACH_NAMED_M = 200;
const CLUSTER_NEAR_M = 25;
const CLUSTER_NAMED_M = 120;
const ANCHOR_RADIUS_M = 150;
const T10_STATION_NAMES = [
  { lat: 48.77993, lon: 2.25196, name: 'Parc des Sports' },
  { lat: 48.78229, lon: 2.25447, name: 'Le Hameau' },
  { lat: 48.79012, lon: 2.25254, name: 'Jardin Parisien' }
];
/** A metro stop belongs to the metro station node within this distance. */
const METRO_STOP_M = 200;
/** ...or, when it has the same name, within this distance. */
const METRO_NAMED_M = 350;
/** A metro node joins the rail site within this distance. */
const METRO_MERGE_M = 150;
/** A rail line at a former metro stop area is kept only with a rail station node that serves it this close. */
const RAIL_SUPPORT_M = 230;

function distM(la1, lo1, la2, lo2) {
  const R = 6371000;
  const toR = v => v * Math.PI / 180;
  const dLa = toR(la2 - la1), dLo = toR(lo2 - lo1);
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(toR(la1)) * Math.cos(toR(la2)) * Math.sin(dLo / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normName(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function namesMatch(a, b) {
  const x = normName(a), y = normName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x));
}

/** The station name without the line suffix OSM adds to metro stop areas: "Saint-Lazare (13)" -> "Saint-Lazare". */
const stationName = s => String(s || '').replace(/\s*\([^)]*\)/g, '').trim();

const isHeavyRail = raw => [...raw.lines.values()].some(line => line.mode === 'rer' || line.mode === 'transilien');

/** The most common name among the members; on a tie the longer one ("Châtelet - Les Halles" over "Châtelet"). */
function commonName(names) {
  const counts = new Map();
  for (const name of names) counts.set(name, (counts.get(name) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0]?.[0] || '';
}

/**
 * Two stop areas that sit at different, differently named station nodes are neighbouring stations that merely lie
 * within 250 m of each other (Auber and Havre-Caumartin); `nodes` are the station nodes each one is anchored to.
 */
function distinctStations(a, b) {
  if (!a.nodes.length || !b.nodes.length) return false;
  return !a.nodes.some(n => b.nodes.some(m => n.id === m.id || namesMatch(n.name, m.name)));
}
/**
 * A station complex is spread over several stop areas that share a name ("Saint-Lazare (13)", "Gare Saint-Lazare",
 * "Haussmann - Saint-Lazare") and can reach 300 m across. A heavy-rail stop area must be among them: metro stations
 * that merely share a street name ("Convention - Vaugirard", "Vaugirard - Favorites") stay separate.
 * Returns one entry per complex.
 */
function groupComplexes(raws) {
  const parent = raws.map((_, i) => i);
  const root = i => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  const cores = raws.map(r => stationName(r.name));
  const heavy = raws.map(isHeavyRail);
  for (let i = 0; i < raws.length; i++) {
    if (!cores[i]) continue;
    for (let j = i + 1; j < raws.length; j++) {
      if (!(heavy[i] || heavy[j]) || !namesMatch(cores[i], cores[j])) continue;
      if (distM(raws[i].lat, raws[i].lon, raws[j].lat, raws[j].lon) <= COMPLEX_RADIUS_M) parent[root(i)] = root(j);
    }
  }

  const members = new Map();
  raws.forEach((_, i) => {
    const key = root(i);
    members.set(key, [...(members.get(key) || []), i]);
  });

  return [...members.values()].sort((a, b) => a[0] - b[0]).map(ids => {
    if (ids.length === 1) return raws[ids[0]];
    const parts = ids.map(i => raws[i]);
    const wide = parts.some(a => parts.some(b => distM(a.lat, a.lon, b.lat, b.lon) > STATION_CLUSTER_RADIUS));
    return {
      lat: parts.reduce((sum, p) => sum + p.lat, 0) / parts.length,
      lon: parts.reduce((sum, p) => sum + p.lon, 0) / parts.length,
      name: wide ? commonName(ids.map(i => cores[i])) : parts.map(p => p.name).sort((a, b) => b.length - a.length)[0],
      lines: new Map(parts.flatMap(p => [...(p.own.size ? p.own : p.lines)])),
      own: new Map(parts.flatMap(p => [...p.own])),
      altNames: parts.map(p => p.name),
      anchors: parts.flatMap(p => [{ lat: p.lat, lon: p.lon }, ...(p.anchors || [])])
    };
  });
}

class SpatialIndex {
  constructor(cellDeg = 0.002) {
    this.cellDeg = cellDeg;
    this.cells = new Map();
  }

  add(lat, lon, value) {
    const key = `${Math.floor(lat / this.cellDeg)},${Math.floor(lon / this.cellDeg)}`;
    const cell = this.cells.get(key);
    if (cell) cell.push({ lat, lon, value });
    else this.cells.set(key, [{ lat, lon, value }]);
  }

  near(lat, lon, radiusM) {
    const dLat = radiusM / 111320;
    const dLon = radiusM / (111320 * Math.cos(lat * Math.PI / 180));
    const r0 = Math.floor((lat - dLat) / this.cellDeg), r1 = Math.floor((lat + dLat) / this.cellDeg);
    const c0 = Math.floor((lon - dLon) / this.cellDeg), c1 = Math.floor((lon + dLon) / this.cellDeg);
    const out = [];
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cell = this.cells.get(`${r},${c}`);
        if (!cell) continue;
        for (const e of cell) {
          const dist = distM(lat, lon, e.lat, e.lon);
          if (dist <= radiusM) out.push({ value: e.value, dist });
        }
      }
    }
    return out;
  }
}

const lineKey = (mode, ref) => `${mode}|${ref}`;

function addLine(map, mode, ref) {
  map.set(lineKey(mode, ref), { ref, mode });
}

function sortedLines(map) {
  return Array.from(map.values()).sort((a, b) =>
    MODE_ORDER.indexOf(a.mode) - MODE_ORDER.indexOf(b.mode) || a.ref.localeCompare(b.ref, 'en', { numeric: true }));
}

const round5 = v => Math.round(v * 1e5) / 1e5;

function isStopMember(member) {
  if (member.type === 'way') return false;
  const role = member.role || '';
  return role === 'stop' || role === 'stop_entry_only' || role === 'stop_exit_only'
    || (member.type === 'relation' && role === '');
}

/**
 * Drops skip-stop and short-working variants: a route is redundant when its stops appear, in order
 * (either direction), inside a longer route of the same line. Forks are kept because each branch
 * has stops the other lacks.
 */
function dropSubRoutes(routes) {
  const stopKeys = r => r.coords.map(([la, lo]) => `${la},${lo}`);
  const isSubsequence = (needle, hay) => {
    let i = 0;
    for (const key of hay) if (key === needle[i] && ++i === needle.length) return true;
    return false;
  };

  const kept = [];
  const keptByLine = new Map();
  for (const route of [...routes].sort((a, b) => b.coords.length - a.coords.length)) {
    const key = lineKey(route.mode, route.ref);
    const same = keptByLine.get(key) || [];
    const own = stopKeys(route);
    const redundant = same.some(other => {
      const hay = stopKeys(other);
      return isSubsequence(own, hay) || isSubsequence(own, [...hay].reverse());
    });
    if (redundant) continue;
    same.push(route);
    keptByLine.set(key, same);
    kept.push(route);
  }
  // Keep the original (stable) order for readable diffs of the generated files.
  return routes.filter(r => kept.includes(r));
}

const isMetroStation = tags => tags.station === 'subway' || tags.subway === 'yes' || /m[eé]tro/i.test(tags.network || '');

/** "Gare du Nord (Métro)" -> "Gare du Nord"; one dash style for "Reuilly — Diderot" and "Les Courtilles–Gennevilliers". */
const metroName = name => stationName(name).replace(/\s*[\u2014\u2013\u2212]\s*/g, ' - ') || name;

const MAX_ALIASES = 3;
/** Station nodes this close with a matching name are the same station under another name. */
const ALIAS_NODE_M = 250;

/** The other names a station node carries. `old_name` is left out: those are no longer in use. */
const aliasesOf = tags => ['alt_name', 'official_name', 'short_name']
  .flatMap(key => String(tags[key] || '').split(';'))
  .map(name => name.trim())
  .filter(Boolean);

/** Words that do not tell two spellings of a station name apart ("Gare de Lyon RER" is "Gare de Lyon"). */
const FILLER_WORDS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'gare', 'paris', 'rer', 'metro', 'station', 'surface', 'banlieue']);
const nameWords = name => String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .split(/[^a-z0-9]+/).filter(word => word && !FILLER_WORDS.has(word)).sort().join(' ');

/**
 * The names a station is also known by. `names` (stop areas and stations merged into it) only count when they are a
 * variant of the primary name, so a street-style bus stop name does not become an alias; `tagged` names come from the
 * station's own alt_name, official_name or short_name tags and always count. A spelling that only adds or drops filler
 * words is not another name.
 */
function pickAliases(primary, names, tagged) {
  const seen = new Set([nameWords(primary)]);
  const out = [];
  const add = raw => {
    const name = metroName(raw);
    const key = nameWords(name);
    if (!key || seen.has(key) || /\b(bus|autobus)\b/i.test(name) || /^m[eé]tro\b/i.test(name)) return;
    seen.add(key);
    out.push(name);
  };
  names.filter(name => namesMatch(stationName(name), stationName(primary))).forEach(add);
  tagged.forEach(add);
  return out.slice(0, MAX_ALIASES);
}

/**
 * OSM maps every Paris metro station as one correctly named node, so those nodes decide the names and lines of
 * metro stations. Clustering stop areas gets neighbours wrong: Cité picks up line 7 and Les Halles ends up named
 * "Porte Saint-Eustache". Metro lines are taken off the clustered sites and put back from the nodes; a node within
 * METRO_MERGE_M of a rail site (the RER or Transilien station next to it) joins that site, any other becomes a site.
 * Without metro station nodes the sites are left as they are.
 */
function reconcileMetro(railSites, metroNodes, railStationNodes = []) {
  if (!metroNodes.some(n => !n.pseudo)) return railSites;

  // One metro station can be several nodes (Gare de Lyon for lines 1 and 14): join those that share a name.
  const nodes = [];
  for (const node of metroNodes) {
    const same = nodes.find(n => distM(n.lat, n.lon, node.lat, node.lon) <= COMPLEX_RADIUS_M && namesMatch(stationName(n.name), stationName(node.name)));
    if (!same) {
      nodes.push({ ...node, lines: new Map(node.lines), altTags: [...node.altTags], count: 1 });
      continue;
    }
    for (const [key, line] of node.lines) same.lines.set(key, line);
    same.altTags.push(...node.altTags);
    same.lat = (same.lat * same.count + node.lat) / (same.count + 1);
    same.lon = (same.lon * same.count + node.lon) / (same.count + 1);
    same.count++;
  }

  // The rail lines of a metro stop area are often those of the next station (A at Havre-Caumartin and Opéra).
  // They only stay when a rail station node that serves the line is close.
  const supported = (site, line) => railStationNodes.some(n => n.lines.has(`${line.mode}|${line.ref}`) && distM(n.lat, n.lon, site.lat, site.lon) <= RAIL_SUPPORT_M);
  const sites = railSites.filter(site => {
    const hadMetro = [...site.lines.values()].some(line => line.mode === 'metro');
    for (const [key, line] of site.lines) {
      if (line.mode === 'metro') site.lines.delete(key);
      else if (hadMetro && (line.mode === 'rer' || line.mode === 'transilien') && !supported(site, line)) site.lines.delete(key);
    }
    return site.lines.size > 0;
  });

  const pairs = [];
  nodes.forEach((node, n) => sites.forEach((site, s) => {
    const d = distM(node.lat, node.lon, site.lat, site.lon);
    if (d <= METRO_MERGE_M || (d <= COMPLEX_RADIUS_M && namesMatch(stationName(node.name), stationName(site.name)))) pairs.push({ n, s, d });
  }));
  pairs.sort((a, b) => a.d - b.d);

  const siteToNode = new Map();
  const usedNodes = new Set();
  for (const { n, s } of pairs) {
    if (siteToNode.has(s) || usedNodes.has(n)) continue;
    siteToNode.set(s, n);
    usedNodes.add(n);
  }

  const result = sites.map((site, s) => {
    if (!siteToNode.has(s)) return site;
    const node = nodes[siteToNode.get(s)];
    for (const [key, line] of node.lines) site.lines.set(key, line);
    return {
      ...site,
      name: node.name,
      lat: node.lat,
      lon: node.lon,
      altNames: [...(site.altNames || []), site.name],
      altTags: [...(site.altTags || []), ...node.altTags]
    };
  });
  nodes.forEach((node, n) => {
    if (!usedNodes.has(n) && node.lines.size > 0) {
      result.push({ lat: node.lat, lon: node.lon, name: node.name, lines: new Map(node.lines), altTags: node.altTags });
    }
  });
  return result;
}

/**
 * @param {object[]} stopElements  Overpass elements: stop_area relations, stop_position and railway nodes
 * @param {object[]} routeElements Overpass route relations (all modes, with members)
 */
function buildSnapshot(stopElements, routeElements) {
  const nodeCoords = new Map();
  const nodeNames = new Map();
  const areaCenters = new Map();
  const areaNames = new Map();
  for (const el of stopElements) {
    // Closed, never-opened or not-yet-open stops are unresolvable, so no station, route stop or line can use them.
    if (isInactive(el.tags)) continue;
    if (el.type === 'node' && el.lat != null && el.lon != null) {
      nodeCoords.set(Number(el.id), { lat: el.lat, lon: el.lon });
      if (el.tags?.name) nodeNames.set(Number(el.id), el.tags.name);
    } else if (el.type === 'relation' && el.center) {
      areaCenters.set(Number(el.id), { lat: el.center.lat, lon: el.center.lon });
      const name = el.tags?.name || el.tags?.official_name;
      if (name) areaNames.set(Number(el.id), name);
    }
  }

  const routes = [];
  for (const el of routeElements) {
    if (el.type !== 'relation' || el.tags?.type !== 'route') continue;
    if (isInactive(el.tags)) continue;
    const mode = classifyRoute(el.tags);
    const ref = normalizeRef(mode, el.tags.ref || el.tags.name || '');
    if (!ref) continue;
    routes.push({ mode, ref, members: el.members || [] });
  }
  const railRoutes = routes.filter(r => RAIL_MODES.has(r.mode));
  const otherRoutes = routes.filter(r => !RAIL_MODES.has(r.mode));

  // --- Rail stations: stop_area clustering, restricted to rail-mode lines ---
  const areaLines = new Map();
  const nodeLines = new Map();
  for (const route of railRoutes) {
    for (const member of route.members) {
      const target = member.type === 'relation' ? areaLines : member.type === 'node' ? nodeLines : null;
      if (!target) continue;
      const id = Number(member.ref);
      const set = target.get(id) || new Map();
      addLine(set, route.mode, route.ref);
      target.set(id, set);
    }
  }

  const lineNodeIndex = new SpatialIndex();
  for (const id of nodeLines.keys()) {
    const c = nodeCoords.get(id);
    if (c) lineNodeIndex.add(c.lat, c.lon, id);
  }
  const linesNearby = (lat, lon, radius) => {
    const result = new Map();
    for (const hit of lineNodeIndex.near(lat, lon, radius)) {
      for (const [key, line] of nodeLines.get(hit.value)) result.set(key, line);
    }
    return result;
  };

  // `lines` also takes every line stop within 200 m (a stop_area rarely lists its own stops). `own` takes each
  // line stop only for the nearest area: that is what a station complex uses, so that Saint-Lazare does not pick
  // up the lines of Havre-Caumartin or Saint-Augustin next door.
  const areas = [];
  const areaIndex = new SpatialIndex();
  for (const el of stopElements) {
    if (el.type !== 'relation' || el.tags?.public_transport !== 'stop_area' || !el.center) continue;
    if (isInactive(el.tags)) continue;
    const { lat, lon } = el.center;
    const listed = areaLines.get(Number(el.id)) || new Map();
    areaIndex.add(lat, lon, areas.length);
    areas.push({
      lat,
      lon,
      name: el.tags.name || el.tags.official_name || '',
      lines: new Map([...listed, ...linesNearby(lat, lon, 200)]),
      own: new Map(listed)
    });
  }
  for (const [id, lines] of nodeLines) {
    const c = nodeCoords.get(id);
    if (!c) continue;
    let nearest = null;
    for (const hit of areaIndex.near(c.lat, c.lon, 200)) if (!nearest || hit.dist < nearest.dist) nearest = hit;
    if (nearest) for (const [key, line] of lines) areas[nearest.value].own.set(key, line);
  }
  const rawFromRelations = areas.filter(area => area.lines.size > 0);

  const stationNodes = new SpatialIndex();
  for (const el of stopElements) {
    if (el.type !== 'node' || el.lat == null || el.lon == null || isInactive(el.tags)) continue;
    const tags = el.tags || {};
    if ((tags.railway === 'station' || tags.public_transport === 'station') && tags.name) {
      stationNodes.add(el.lat, el.lon, { id: Number(el.id), name: tags.name, lat: el.lat, lon: el.lon, aliases: aliasesOf(tags) });
    }
  }
  const nodesAt = points => {
    const found = new Map();
    for (const p of points) {
      let nearest = null;
      for (const hit of stationNodes.near(p.lat, p.lon, ANCHOR_RADIUS_M)) if (!nearest || hit.dist < nearest.dist) nearest = hit;
      if (nearest) found.set(nearest.value.id, nearest.value);
    }
    return [...found.values()];
  };

  let railSites = [];
  for (const raw of groupComplexes(rawFromRelations)) {
    const nodes = nodesAt(raw.anchors || [raw]);
    const existing = railSites.find(st => distM(st.lat, st.lon, raw.lat, raw.lon) <= STATION_CLUSTER_RADIUS && !distinctStations(st, { nodes }));
    if (existing) {
      for (const [key, line] of raw.lines) existing.lines.set(key, line);
      existing.altNames.push(existing.name, raw.name, ...(raw.altNames || []));
      existing.nodes.push(...nodes.filter(n => !existing.nodes.some(m => m.id === n.id)));
      // The name of a stop area that matches its station node beats a longer street-style name.
      const named = [existing.name, raw.name].filter(name => existing.nodes.some(n => namesMatch(name, n.name)));
      const candidates = named.length ? named : [existing.name, raw.name];
      existing.name = candidates.sort((a, b) => b.length - a.length)[0];
      existing.anchors.push(...(raw.anchors || []));
      existing.lat = (existing.lat + raw.lat) / 2;
      existing.lon = (existing.lon + raw.lon) / 2;
    } else {
      railSites.push({ lat: raw.lat, lon: raw.lon, name: raw.name, lines: new Map(raw.lines), nodes, altNames: [raw.name, ...(raw.altNames || [])], anchors: [...(raw.anchors || [])] });
    }
  }

  for (const el of stopElements) {
    if (el.type !== 'node' || el.lat == null || el.lon == null) continue;
    if (isInactive(el.tags)) continue;
    const tags = el.tags || {};
    if (tags.highway === 'bus_stop' || tags.bus === 'yes' || tags.route === 'bus') continue;
    if (tags.public_transport === 'stop_position') continue;
    // Measured from every stop area of the site, so the far end of a station complex does not become a station of its own.
    if (railSites.some(st => [st, ...(st.anchors || [])].some(a => distM(a.lat, a.lon, el.lat, el.lon) <= NODE_COVER_RADIUS))) continue;
    const lines = linesNearby(el.lat, el.lon, 100);
    if (lines.size === 0) continue;
    railSites.push({ lat: el.lat, lon: el.lon, name: tags.name || tags.ref || '', lines });
  }

  for (const site of railSites) {
    if (site.name || !site.lines.has(lineKey('tram', 'T10'))) continue;
    const knownName = T10_STATION_NAMES.find(name => distM(site.lat, site.lon, name.lat, name.lon) <= 150);
    if (knownName) site.name = knownName.name;
  }

  railSites.sort((a, b) => (a.lat !== b.lat ? a.lat - b.lat : a.lon - b.lon));

  // Stop areas are sometimes named after an exit ("R. Gay-Lussac" for Luxembourg RER). Several sites
  // near the same station node that serve a common line are the exits of one station: merge them and
  // use the station's name. A single site, or sites with no line in common, are left untouched.
  const report = { renamed: [], merged: [] };
  const byStation = new Map();
  for (const site of railSites) {
    let nearest = null;
    for (const hit of stationNodes.near(site.lat, site.lon, ANCHOR_RADIUS_M)) {
      if (!nearest || hit.dist < nearest.dist) nearest = hit;
    }
    if (!nearest) continue;
    const group = byStation.get(nearest.value.id) || { node: nearest.value, sites: [] };
    group.sites.push(site);
    byStation.set(nearest.value.id, group);
  }

  const dropped = new Set();
  for (const { node, sites } of byStation.values()) {
    const base = sites[0];
    let mergedAny = false;
    for (const site of sites.slice(1)) {
      if (![...site.lines.keys()].some(key => base.lines.has(key))) continue;
      for (const [key, line] of site.lines) base.lines.set(key, line);
      base.altNames = [...(base.altNames || []), site.name, ...(site.altNames || [])];
      report.merged.push(`${node.name} <- ${site.name || '(unnamed)'}`);
      dropped.add(site);
      mergedAny = true;
    }
    if (!mergedAny) continue;
    if (base.name !== node.name) report.renamed.push(`${base.name || '(unnamed)'} -> ${node.name}`);
    base.altNames.push(base.name);
    base.altTags = [...(base.altTags || []), ...node.aliases];
    base.name = node.name;
    base.lat = node.lat;
    base.lon = node.lon;
  }
  railSites = railSites.filter(site => !dropped.has(site));
  railSites.sort((a, b) => (a.lat !== b.lat ? a.lat - b.lat : a.lon - b.lon));

  const resolveStop = member => {
    const id = Number(member.ref);
    if (member.type === 'node') {
      const c = nodeCoords.get(id);
      return c ? { lat: c.lat, lon: c.lon, name: nodeNames.get(id) || '' } : null;
    }
    if (member.type === 'relation') {
      const c = areaCenters.get(id);
      return c ? { lat: c.lat, lon: c.lon, name: areaNames.get(id) || '' } : null;
    }
    return null;
  };

  const metroNodes = [];
  const metroIndex = new SpatialIndex();
  for (const el of stopElements) {
    const tags = el.tags || {};
    if (el.type !== 'node' || el.lat == null || el.lon == null || isInactive(tags) || !tags.name) continue;
    if (!(tags.railway === 'station' || tags.public_transport === 'station') || !isMetroStation(tags)) continue;
    const node = { lat: el.lat, lon: el.lon, name: metroName(tags.name), lines: new Map(), altTags: aliasesOf(tags) };
    metroNodes.push(node);
    metroIndex.add(node.lat, node.lon, node);
  }
  for (const route of railRoutes.filter(r => r.mode === 'metro')) {
    for (const member of route.members) {
      if (!isStopMember(member)) continue;
      const stop = resolveStop(member);
      if (!stop) continue;
      // A stop goes to the station node with its own name when there is one (line 7's platform "Châtelet" is
      // closer to Cité than to Châtelet), otherwise to the nearest node.
      const hits = metroIndex.near(stop.lat, stop.lon, METRO_NAMED_M);
      const pickNearest = list => list.reduce((best, hit) => (!best || hit.dist < best.dist ? hit : best), null);
      const nearest = pickNearest(hits.filter(hit => namesMatch(stationName(stop.name), stationName(hit.value.name))))
        || pickNearest(hits.filter(hit => hit.dist <= METRO_STOP_M));
      if (nearest) {
        addLine(nearest.value.lines, route.mode, route.ref);
        continue;
      }
      // A few stations (Madeleine, Créteil-Préfecture) have no tagged station node: use the stop's own name.
      const name = metroName(stop.name);
      if (!name) continue;
      let pseudo = metroNodes.find(n => n.pseudo && distM(n.lat, n.lon, stop.lat, stop.lon) <= STATION_CLUSTER_RADIUS && namesMatch(n.name, name));
      if (!pseudo) {
        pseudo = { lat: stop.lat, lon: stop.lon, name, lines: new Map(), altTags: [], pseudo: true };
        metroNodes.push(pseudo);
        metroIndex.add(pseudo.lat, pseudo.lon, pseudo);
      }
      addLine(pseudo.lines, route.mode, route.ref);
    }
  }
  const railStationNodes = [];
  for (const el of stopElements) {
    const tags = el.tags || {};
    if (el.type !== 'node' || el.lat == null || el.lon == null || isInactive(tags)) continue;
    if (tags.railway === 'station' || tags.railway === 'halt' || tags.public_transport === 'station') {
      railStationNodes.push({ lat: el.lat, lon: el.lon, lines: new Map(), metro: isMetroStation(tags) });
    }
  }
  const railStationIndex = new SpatialIndex();
  railStationNodes.forEach(n => railStationIndex.add(n.lat, n.lon, n));
  for (const route of railRoutes.filter(r => r.mode === 'rer' || r.mode === 'transilien')) {
    for (const member of route.members) {
      if (!isStopMember(member)) continue;
      const stop = resolveStop(member);
      if (!stop) continue;
      // A station node that is also tagged metro only takes the stop when no purely rail station is near.
      const hits = railStationIndex.near(stop.lat, stop.lon, METRO_STOP_M);
      const rank = hit => (hit.value.metro ? 1e6 : 0) + hit.dist;
      const nearest = hits.sort((a, b) => rank(a) - rank(b))[0];
      if (nearest) addLine(nearest.value.lines, route.mode, route.ref);
    }
  }
  railSites = reconcileMetro(railSites, metroNodes, railStationNodes);
  railSites.sort((a, b) => (a.lat !== b.lat ? a.lat - b.lat : a.lon - b.lon));

  // A station node of the same name nearby is the same station, and may carry other names it goes by.
  for (const site of railSites) {
    const names = [...(site.altNames || [])];
    const tagged = [...(site.altTags || [])];
    for (const hit of stationNodes.near(site.lat, site.lon, ALIAS_NODE_M)) {
      if (!namesMatch(stationName(hit.value.name), stationName(site.name))) continue;
      names.push(hit.value.name);
      tagged.push(...hit.value.aliases);
    }
    site.aliases = pickAliases(site.name, names, tagged);
  }

  const railIndex = new SpatialIndex();
  railSites.forEach((site, i) => railIndex.add(site.lat, site.lon, i));

  // --- Non-rail lines: attach to a nearby rail station or to an extra site ---
  const extraSites = [];
  const extraIndex = new SpatialIndex();
  const attached = new Map(); // rail station index -> Map(lineKey -> line)

  const nearestMatch = (index, stop, nearM, namedM, nameOf) => {
    let best = null;
    for (const hit of index.near(stop.lat, stop.lon, namedM)) {
      const eligible = hit.dist <= nearM || namesMatch(stop.name, nameOf(hit.value));
      if (eligible && (!best || hit.dist < best.dist)) best = hit;
    }
    return best;
  };

  const placeStop = (stop, mode, ref) => {
    const railHit = nearestMatch(railIndex, stop, ATTACH_NEAR_M, ATTACH_NAMED_M, i => railSites[i].name);
    if (railHit) {
      const i = railHit.value;
      const set = attached.get(i) || new Map();
      addLine(set, mode, ref);
      attached.set(i, set);
      return { lat: railSites[i].lat, lon: railSites[i].lon };
    }
    const extraHit = nearestMatch(extraIndex, stop, CLUSTER_NEAR_M, CLUSTER_NAMED_M, s => s.name);
    if (extraHit) {
      addLine(extraHit.value.lines, mode, ref);
      return { lat: extraHit.value.lat, lon: extraHit.value.lon };
    }
    const site = { lat: stop.lat, lon: stop.lon, name: stop.name || '', lines: new Map() };
    addLine(site.lines, mode, ref);
    extraSites.push(site);
    extraIndex.add(site.lat, site.lon, site);
    return { lat: site.lat, lon: site.lon };
  };

  const routeCoords = [];
  for (const route of otherRoutes) {
    const coords = [];
    for (const member of route.members) {
      if (!isStopMember(member)) continue;
      const stop = resolveStop(member);
      if (!stop) continue;
      const placed = placeStop(stop, route.mode, route.ref);
      const last = coords[coords.length - 1];
      if (!last || last[0] !== placed.lat || last[1] !== placed.lon) coords.push([placed.lat, placed.lon]);
    }
    if (coords.length >= 2) routeCoords.push({ ref: route.ref, mode: route.mode, coords });
  }

  // --- Rail route geometry, snapped to the stations that serve the line ---
  for (const route of railRoutes) {
    const coords = [];
    for (const member of route.members) {
      if (!isStopMember(member)) continue;
      const stop = resolveStop(member);
      if (!stop) continue;
      const last = coords[coords.length - 1];
      if (!last || last[0] !== stop.lat || last[1] !== stop.lon) coords.push([stop.lat, stop.lon]);
    }
    if (coords.length < 2) continue;

    const key = lineKey(route.mode, route.ref);
    const serving = railSites.filter(st => st.lines.has(key));
    let snapped = coords.map(([la, lo]) => {
      let bestDist = Infinity, bestLa = la, bestLo = lo;
      for (const st of serving) {
        const d = distM(la, lo, st.lat, st.lon);
        if (d < bestDist) { bestDist = d; bestLa = st.lat; bestLo = st.lon; }
      }
      return bestDist <= RAIL_SNAP_M ? [bestLa, bestLo] : [la, lo];
    });
    snapped = snapped.filter((c, i) => i === 0 || c[0] !== snapped[i - 1][0] || c[1] !== snapped[i - 1][1]);
    if (snapped.length >= 2) routeCoords.push({ ref: route.ref, mode: route.mode, coords: snapped });
  }

  // One physical path per line variant; reversed duplicates share a sorted-stop key.
  const seen = new Set();
  const dedupedRoutes = [];
  for (const route of routeCoords) {
    const stopKey = route.coords.map(([la, lo]) => `${la},${lo}`).sort().join('|');
    const key = `${lineKey(route.mode, route.ref)}||${stopKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedupedRoutes.push(route);
  }

  const outRoute = r => ({ ref: r.ref, mode: r.mode, coords: r.coords.map(([la, lo]) => [round5(la), round5(lo)]) });
  const outStation = s => ({
    lat: round5(s.lat),
    lon: round5(s.lon),
    name: s.name,
    ...(s.aliases?.length ? { aliases: s.aliases } : {}),
    lines: sortedLines(s.lines)
  });
  const prunedRoutes = dropSubRoutes(dedupedRoutes);

  return {
    stations: railSites.map(outStation),
    routes: prunedRoutes.filter(r => RAIL_MODES.has(r.mode)).map(outRoute),
    extraStations: extraSites.map(outStation),
    extraStationLines: Array.from(attached.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([station, lines]) => ({ station, lines: sortedLines(lines) })),
    extraRoutes: prunedRoutes.filter(r => !RAIL_MODES.has(r.mode)).map(outRoute),
    report
  };
}

module.exports = { buildSnapshot, dropSubRoutes, RAIL_MODES, distM, namesMatch };



