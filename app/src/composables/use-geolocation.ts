export interface Coordinates {
  lat: number;
  lon: number;
}

/** The device position once, or null when it is denied, unavailable or takes longer than `timeoutMs`. */
export function currentPosition(timeoutMs = 10000): Promise<Coordinates | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lon: position.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60000 },
    );
  });
}
