import { Injectable, InjectionToken } from '@angular/core';
import { haversineM } from './distance';
import type { LatLon } from './distance';

export interface WalkResult {
  meters: number;
  seconds: number;
}

/** A path, no path at all, or a router that could not be reached. */
export type WalkOutcome = WalkResult | 'none' | 'unavailable';

const ROUTER_URL = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot';
/** Cursor must be this close to a walkable way, otherwise there is no path (river, rail yard...). */
const ORIGIN_SNAP_M = 30;
const FALLBACK_ORIGIN_SNAP_M = 500;
const TARGET_SNAP_M = 150;
const WALKING_SPEED_MPS = 1.4;
const CACHE_LIMIT = 300;
const COOL_OFF_MS = 15000;

/** Straight-line distance beyond which no route is requested. */
export const MAX_ROUTE_M = 30000;

/** Pause after the cursor stops before a route is requested. */
export const WALK_DEBOUNCE_MS = new InjectionToken<number>('WALK_DEBOUNCE_MS', { providedIn: 'root', factory: () => 450 });

@Injectable({ providedIn: 'root' })
export class WalkingRouteService {
  private readonly cache = new Map<string, WalkResult | 'none'>();
  private blockedUntil = 0;

  /** Cached outcome, or undefined when a request is still needed. */
  peek(from: LatLon, to: LatLon): WalkOutcome | undefined {
    const hit = this.cache.get(this.key(from, to));
    if (hit) return hit;
    return Date.now() < this.blockedUntil ? 'unavailable' : undefined;
  }

  /** Resolves null when the request was aborted. */
  async route(from: LatLon, to: LatLon, signal: AbortSignal): Promise<WalkOutcome | null> {
    const cached = this.peek(from, to);
    if (cached) return cached;

    const direct = await this.request(from, to, ORIGIN_SNAP_M, signal);
    if (direct !== 'none') return direct;

    const fallback = await this.request(from, to, FALLBACK_ORIGIN_SNAP_M, signal);
    return fallback === 'none' ? this.remember(from, to, 'none') : fallback;
  }

  private async request(from: LatLon, to: LatLon, originSnapM: number, signal: AbortSignal): Promise<WalkOutcome | null> {
    const url = `${ROUTER_URL}/${from.lon},${from.lat};${to.lon},${to.lat}`
      + `?overview=false&alternatives=false&steps=false&radiuses=${originSnapM};${TARGET_SNAP_M}`;
    try {
      const res = await fetch(url, { signal });
      const body = await res.json();
      const route = body?.routes?.[0];
      if (body?.code === 'Ok' && route) {
        const [snappedLon, snappedLat] = body?.waypoints?.[0]?.location ?? [];
        const accessMeters = Number.isFinite(snappedLat) && Number.isFinite(snappedLon)
          ? haversineM(from, { lat: snappedLat, lon: snappedLon })
          : 0;
        return this.remember(from, to, {
          meters: route.distance + accessMeters,
          seconds: route.duration + accessMeters / WALKING_SPEED_MPS
        });
      }
      if (body?.code === 'NoSegment' || body?.code === 'NoRoute') return 'none';
      throw new Error(`Unexpected router answer: ${body?.code}`);
    } catch {
      if (signal.aborted) return null;
      this.blockedUntil = Date.now() + COOL_OFF_MS;
      return 'unavailable';
    }
  }

  /** The cursor is bucketed to about 10 m so that small moves reuse the same answer. */
  private key(from: LatLon, to: LatLon): string {
    return `${from.lat.toFixed(4)},${from.lon.toFixed(4)}>${to.lat.toFixed(5)},${to.lon.toFixed(5)}`;
  }

  private remember(from: LatLon, to: LatLon, outcome: WalkResult | 'none'): WalkResult | 'none' {
    this.cache.set(this.key(from, to), outcome);
    if (this.cache.size > CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value as string);
    return outcome;
  }
}
