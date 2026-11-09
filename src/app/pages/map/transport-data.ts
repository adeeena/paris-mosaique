import type { IdfLine, IdfRoute, IdfStation } from './idf-datapoints';
import type { DefunctStation } from './defunct-stations';
import type { IdfTrackLine } from './idf-tracks';
import type { TransportMode } from './transport-modes';
import { isRailMode } from './transport-modes';

/** A Voronoi site: one geographic location with the lines of the selected modes only. */
export interface Site {
  lat: number;
  lon: number;
  name: string;
  /** Other names in use for the station. */
  aliases?: readonly string[];
  lines: IdfLine[];
  /** Set for a closed station that is shown on request; it takes part in the Voronoi like any other site. */
  defunct?: DefunctStation;
}

export interface ExtraSnapshot {
  stations: readonly IdfStation[];
  /** Non-rail lines serving a rail station, keyed by its index in the rail station list. */
  stationLines: ReadonlyMap<number, readonly IdfLine[]>;
  routes: readonly IdfRoute[];
}

export interface RawExtraModule {
  IDF_EXTRA_STATIONS: readonly IdfStation[];
  IDF_EXTRA_STATION_LINES: ReadonlyArray<{ station: number; lines: readonly IdfLine[] }>;
  IDF_EXTRA_ROUTES: readonly IdfRoute[];
}

export function buildExtraSnapshot(raw: RawExtraModule): ExtraSnapshot {
  return {
    stations: raw.IDF_EXTRA_STATIONS,
    stationLines: new Map(raw.IDF_EXTRA_STATION_LINES.map(e => [e.station, e.lines])),
    routes: raw.IDF_EXTRA_ROUTES
  };
}

export function needsExtra(modes: ReadonlySet<TransportMode>): boolean {
  for (const mode of modes) if (!isRailMode(mode)) return true;
  return false;
}

/** Sites with at least one line in the selected modes; a multimode station stays a single site. */
export function selectSites(
  modes: ReadonlySet<TransportMode>,
  railStations: readonly IdfStation[],
  extra?: ExtraSnapshot | null,
  defunct: readonly DefunctStation[] = []
): Site[] {
  const sites: Site[] = [];
  const push = (st: IdfStation, lines: readonly IdfLine[]) => {
    const selected = lines.filter(l => modes.has(l.mode));
    if (selected.length) sites.push({ lat: st.lat, lon: st.lon, name: st.name, aliases: st.aliases, lines: selected });
  };

  railStations.forEach((st, i) => push(st, [...st.lines, ...(extra?.stationLines.get(i) ?? [])]));
  for (const st of extra?.stations ?? []) push(st, st.lines);
  // Closed stations are listed whatever the modes: they are asked for on their own.
  for (const station of defunct) {
    sites.push({
      lat: station.lat,
      lon: station.lon,
      name: station.name,
      lines: station.lines.map(ref => ({ ref, mode: 'metro' as const })),
      defunct: station
    });
  }
  return sites;
}

export function selectRoutes(
  modes: ReadonlySet<TransportMode>,
  railRoutes: readonly IdfRoute[],
  extra?: ExtraSnapshot | null
): IdfRoute[] {
  return [...railRoutes, ...(extra?.routes ?? [])].filter(r => modes.has(r.mode));
}

/** Lines of the selected modes that have real track geometry. */
export function selectTrackLines(
  modes: ReadonlySet<TransportMode>,
  lines: readonly IdfTrackLine[]
): IdfTrackLine[] {
  return lines.filter(l => modes.has(l.mode));
}

export const lineKey = (line: { mode: TransportMode; ref: string }): string => `${line.mode}|${line.ref}`;
