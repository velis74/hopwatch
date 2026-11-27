export interface Coordinates {
  lat: number;
  lon: number;
}

/** Why the device gave no position: no geolocation, a page without HTTPS, refused, no fix, or no answer in time. */
export type LocationFailure = 'unsupported' | 'insecure' | 'denied' | 'unavailable' | 'timeout';

export type PositionResult = { coords: Coordinates } | { failure: LocationFailure };

const FAILURES: Record<number, LocationFailure> = { 1: 'denied', 2: 'unavailable', 3: 'timeout' };

/** The device position once, or the reason there is none. */
export function currentPosition(timeoutMs = 20000): Promise<PositionResult> {
  if (window.isSecureContext === false) return Promise.resolve({ failure: 'insecure' });
  if (!('geolocation' in navigator)) return Promise.resolve({ failure: 'unsupported' });
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ coords: { lat: position.coords.latitude, lon: position.coords.longitude } }),
      (error) => resolve({ failure: FAILURES[error.code] ?? 'unavailable' }),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60000 },
    );
  });
}
