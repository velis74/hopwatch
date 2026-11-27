import { afterEach, describe, expect, it, vi } from 'vitest';

import { mockGeolocation } from '../test-utils';

import { currentPosition } from './use-geolocation';

describe('currentPosition', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('gives the device position', async () => {
    mockGeolocation({ lat: 46.0569, lon: 14.5058 });

    await expect(currentPosition()).resolves.toEqual({ coords: { lat: 46.0569, lon: 14.5058 } });
  });

  it('names a device without geolocation', async () => {
    expect('geolocation' in navigator).toBe(false);

    await expect(currentPosition()).resolves.toEqual({ failure: 'unsupported' });
  });

  it('names a page without HTTPS, where browsers give no position', async () => {
    mockGeolocation({ lat: 46, lon: 14 });
    vi.stubGlobal('isSecureContext', false);

    await expect(currentPosition()).resolves.toEqual({ failure: 'insecure' });
  });

  it.each(['denied', 'unavailable', 'timeout'] as const)(
    'names the failure when the position is %s',
    async (failure) => {
      mockGeolocation(failure);

      await expect(currentPosition()).resolves.toEqual({ failure });
    },
  );

  it('waits for the answer of the device', async () => {
    const geolocation = mockGeolocation('pending');
    let answer: unknown = 'waiting';
    const position = currentPosition().then((value) => (answer = value));

    await Promise.resolve();
    expect(answer).toBe('waiting');

    geolocation.resolve({ lat: 45.548, lon: 13.7302 });
    await position;
    expect(answer).toEqual({ coords: { lat: 45.548, lon: 13.7302 } });
  });

  it('asks for a coarse position at most a minute old, within twenty seconds by default', async () => {
    const geolocation = mockGeolocation({ lat: 46, lon: 14 });

    await currentPosition();
    await currentPosition(2500);

    expect(geolocation.requests).toEqual([
      { enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 },
      { enableHighAccuracy: false, timeout: 2500, maximumAge: 60000 },
    ]);
  });
});
