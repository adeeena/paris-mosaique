import { t } from '../../i18n';

export interface LatLon {
  lat: number;
  lon: number;
}

export function haversineM(a: LatLon, b: LatLon): number {
  const R = 6371000;
  const toR = (v: number) => (v * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLon = toR(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** The site closest to `from` as the crow flies, or null when there are none. */
export function nearestSite<T extends LatLon>(sites: readonly T[], from: LatLon): { site: T; meters: number } | null {
  let best: { site: T; meters: number } | null = null;
  for (const site of sites) {
    const meters = haversineM(from, site);
    if (!best || meters < best.meters) best = { site, meters };
  }
  return best;
}

/** Rounded so that the text stays stable while the cursor moves a few pixels. */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 5) * 5} m`;
  if (meters < 10000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters / 1000)} km`;
}

export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return t('duration.lessThanMinute');
  if (minutes < 60) return t('duration.min', { n: minutes });
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? t('duration.hmin', { h, m }) : t('duration.h', { h });
}
