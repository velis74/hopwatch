/** Reads a value kept on this device; null when it is missing or storage is unavailable. */
export function readDeviceValue(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Keeps a value on this device. Without storage (private mode, blocked site data) it lasts for this page load. */
export function writeDeviceValue(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage is unavailable.
  }
}
