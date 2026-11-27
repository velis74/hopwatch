import { afterEach, describe, expect, it, vi } from 'vitest';

import { readDeviceValue, writeDeviceValue } from './device-storage';

function blockStorage(): void {
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  });
}

describe('device storage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('has no value for a key that was never written', () => {
    expect(readDeviceValue('hopwatch.unknown')).toBeNull();
  });

  it('reads back a written value, also from another copy of the page', () => {
    writeDeviceValue('hopwatch.example', 'kept');

    expect(readDeviceValue('hopwatch.example')).toBe('kept');
    expect(window.localStorage.getItem('hopwatch.example')).toBe('kept');
  });

  it('replaces an earlier value', () => {
    writeDeviceValue('hopwatch.example', 'first');
    writeDeviceValue('hopwatch.example', 'second');

    expect(readDeviceValue('hopwatch.example')).toBe('second');
  });

  it('reads nothing when site data is blocked', () => {
    window.localStorage.setItem('hopwatch.example', 'kept');
    blockStorage();

    expect(readDeviceValue('hopwatch.example')).toBeNull();
  });

  it('accepts a write when site data is blocked', () => {
    blockStorage();

    expect(() => writeDeviceValue('hopwatch.example', 'lost')).not.toThrow();
  });

  it('accepts a write when the storage is full', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });

    expect(() => writeDeviceValue('hopwatch.example', 'lost')).not.toThrow();
    expect(readDeviceValue('hopwatch.example')).toBeNull();
  });
});
