import { InjectionToken } from '@angular/core';
import { t } from '../../i18n';

/** The browser's geolocation API, or null where it is missing (server rendering, old browsers). */
export const GEOLOCATION = new InjectionToken<Geolocation | null>('GEOLOCATION', {
  providedIn: 'root',
  factory: () => (typeof navigator !== 'undefined' && 'geolocation' in navigator ? navigator.geolocation : null)
});

export type LocateProblem = 'unsupported' | 'denied' | 'unavailable' | 'timeout' | 'outside';

export function locateMessage(problem: LocateProblem): string {
  return t(`locate.${problem}`);
}

/** Maps a GeolocationPositionError code (1 denied, 2 unavailable, 3 timeout). */
export function problemFromError(error: { code: number }): LocateProblem {
  if (error.code === 1) return 'denied';
  if (error.code === 3) return 'timeout';
  return 'unavailable';
}
