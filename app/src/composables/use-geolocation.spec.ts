import { describe, expect, it } from 'vitest';

import { mockGeolocation } from '../test-utils';

import { currentPosition } from './use-geolocation';

describe('currentPosition', () => {
  it('gives the device position', async () => {
    mockGeolocation({ lat: 46.0569, lon: 14.5058 });

    await expect(currentPosition()).resolves.toEqual({ lat: 46.0569, lon: 14.5058 });
  });

  it('gives nothing on a device without geolocation', async () => {
    expect('geolocation' in navigator).toBe(false);

    await expect(currentPosition()).resolves.toBeNull();
  });

  it.each(['denied', 'unavailable', 'timeout'] as const)('gives nothing when the position is %s', async (failure) => {
    mockGeolocation(failure);

    await expect(currentPosition()).resolves.toBeNull();
  });

  it('waits for the answer of the device', async () => {
    const geolocation = mockGeolocation('pending');
    let answer: unknown = 'waiting';
    const position = currentPosition().then((value) => (answer = value));

    await Promise.resolve();
    expect(answer).toBe('waiting');

    geolocation.resolve({ lat: 45.548, lon: 13.7302 });
    await position;
    expect(answer).toEqual({ lat: 45.548, lon: 13.7302 });
  });

  it('asks for a coarse position at most a minute old, within ten seconds by default', async () => {
    const geolocation = mockGeolocation({ lat: 46, lon: 14 });

    await currentPosition();
    await currentPosition(2500);

    expect(geolocation.requests).toEqual([
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
      { enableHighAccuracy: false, timeout: 2500, maximumAge: 60000 },
    ]);
  });
});
