'use strict';

/**
 * Track geometry helpers for the snapshot generator.
 * Paths are arrays of [lat, lon]. Encoding is Google's polyline format at 1e-5 degrees (about 1 m).
 */

const M_PER_DEG_LAT = 111320;
// Paris latitude; the error elsewhere in Ile-de-France is irrelevant at metre scale.
const M_PER_DEG_LON = 111320 * Math.cos((48.85 * Math.PI) / 180);

function encodeValue(value) {
  const rounded = Math.round(value * 1e5);
  let v = rounded < 0 ? ~(rounded << 1) : rounded << 1;
  let out = '';
  while (v >= 0x20) {
    out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  return out + String.fromCharCode(v + 63);
}

function encodePolyline(points) {
  let prevLat = 0, prevLon = 0, out = '';
  for (const [lat, lon] of points) {
    const la = Math.round(lat * 1e5), lo = Math.round(lon * 1e5);
    out += encodeValue((la - prevLat) / 1e5) + encodeValue((lo - prevLon) / 1e5);
    prevLat = la;
    prevLon = lo;
  }
  return out;
}

function decodePolyline(encoded) {
  const points = [];
  let i = 0, lat = 0, lon = 0;
  const next = () => {
    let shift = 0, result = 0, byte;
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

function distanceToSegmentM(p, a, b) {
  const x = (b[1] - a[1]) * M_PER_DEG_LON, y = (b[0] - a[0]) * M_PER_DEG_LAT;
  const px = (p[1] - a[1]) * M_PER_DEG_LON, py = (p[0] - a[0]) * M_PER_DEG_LAT;
  const len2 = x * x + y * y;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * x + py * y) / len2));
  return Math.hypot(px - t * x, py - t * y);
}

/** Douglas-Peucker: keeps the end points and every point that bends the path by more than `toleranceM`. */
function simplifyPath(points, toleranceM) {
  if (points.length < 3) return points.slice();
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [from, to] = stack.pop();
    let farthest = -1, index = -1;
    for (let i = from + 1; i < to; i++) {
      const d = distanceToSegmentM(points[i], points[from], points[to]);
      if (d > farthest) { farthest = d; index = i; }
    }
    if (farthest > toleranceM) {
      keep[index] = true;
      stack.push([from, index], [index, to]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Inserts points so that no two consecutive points are more than `stepM` apart. */
function densifyPath(points, stepM) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    out.push(points[i]);
    if (i === points.length - 1) break;
    const [a, b] = [points[i], points[i + 1]];
    const lengthM = Math.hypot((b[1] - a[1]) * M_PER_DEG_LON, (b[0] - a[0]) * M_PER_DEG_LAT);
    const parts = Math.ceil(lengthM / stepM);
    for (let k = 1; k < parts; k++) out.push([a[0] + ((b[0] - a[0]) * k) / parts, a[1] + ((b[1] - a[1]) * k) / parts]);
  }
  return out;
}

/** Spatial hash answering "is any stored point within `radiusM` of this one?". */
class PointGrid {
  constructor(radiusM) {
    this.radiusM = radiusM;
    this.cells = new Map();
  }

  cell(p) {
    return [Math.floor((p[1] * M_PER_DEG_LON) / this.radiusM), Math.floor((p[0] * M_PER_DEG_LAT) / this.radiusM)];
  }

  add(p) {
    const [cx, cy] = this.cell(p);
    const key = `${cx},${cy}`;
    if (!this.cells.has(key)) this.cells.set(key, []);
    this.cells.get(key).push(p);
  }

  hasNear(p) {
    const [cx, cy] = this.cell(p);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const q of this.cells.get(`${cx + dx},${cy + dy}`) || []) {
          if (Math.hypot((q[1] - p[1]) * M_PER_DEG_LON, (q[0] - p[0]) * M_PER_DEG_LAT) <= this.radiusM) return true;
        }
      }
    }
    return false;
  }
}

module.exports = { encodePolyline, decodePolyline, simplifyPath, densifyPath, PointGrid };
