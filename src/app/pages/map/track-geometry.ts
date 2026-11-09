export type LatLngTuple = [number, number];

/** Decodes a Google-style polyline at 1e-5 degrees (the format written by scripts/geometry.js). */
export function decodePolyline(encoded: string): LatLngTuple[] {
  const points: LatLngTuple[] = [];
  let i = 0;
  let lat = 0;
  let lon = 0;
  const next = (): number => {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(i++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < encoded.length) {
    lat += next();
    lon += next();
    points.push([lat / 1e5, lon / 1e5]);
  }
  return points;
}

/** [south, west, north, east] */
export type Bounds = readonly [number, number, number, number];

export interface TrackWay {
  paths: LatLngTuple[][];
  bounds: Bounds;
}

/** A way entry holds one or more pieces separated by ';' (a way that leaves the map bounds is split). */
export function decodeWay(entry: string): TrackWay {
  const paths = entry.split(';').filter(Boolean).map(decodePolyline);
  let s = Infinity, w = Infinity, n = -Infinity, e = -Infinity;
  for (const path of paths) {
    for (const [lat, lon] of path) {
      if (lat < s) s = lat;
      if (lat > n) n = lat;
      if (lon < w) w = lon;
      if (lon > e) e = lon;
    }
  }
  return { paths, bounds: [s, w, n, e] };
}

export function intersects(a: Bounds, b: Bounds): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}
