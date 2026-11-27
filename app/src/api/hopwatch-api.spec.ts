import { describe, expect, it } from 'vitest';

import { mockApi } from '../test-utils';

import { accountMe, departures, nearbyStops, searchStops } from './hopwatch-api';

const STOP = { id: 'si:1', name: 'Ljubljana', lat: 46.0569, lon: 14.5058 };

describe('Hopwatch API client', () => {
  it('asks for stops around a position within 1 km by default', async () => {
    const requests = mockApi('get', '/stops/nearby', [{ ...STOP, distance_m: 120 }]);

    await expect(nearbyStops(46.0569, 14.5058)).resolves.toEqual([{ ...STOP, distance_m: 120 }]);
    await nearbyStops(46, 14, 5000);

    expect(requests.map((request) => Object.fromEntries(request.url.searchParams))).toEqual([
      { lat: '46.0569', lon: '14.5058', radius_m: '1000' },
      { lat: '46', lon: '14', radius_m: '5000' },
    ]);
  });

  it('searches stops by name', async () => {
    const requests = mockApi('get', '/stops', [STOP]);

    await expect(searchStops('Ljub')).resolves.toEqual([STOP]);

    expect(requests[0].url.searchParams.get('q')).toBe('Ljub');
  });

  it('asks for departures of the next hour and sends a destination only when given', async () => {
    const requests = mockApi('get', '/departures', []);

    await expect(departures('si:1')).resolves.toEqual([]);
    await departures('si:1', 'Koper', 90);

    expect(requests.map((request) => Object.fromEntries(request.url.searchParams))).toEqual([
      { stop_id: 'si:1', window_minutes: '60' },
      { stop_id: 'si:1', window_minutes: '90', destination: 'Koper' },
    ]);
  });

  it('gives the logged-in account and sends the session cookie', async () => {
    const account = { id: 7, email: 'ana@example.com', display_name: 'Ana' };
    const requests = mockApi('get', '/account/me', account);

    await expect(accountMe()).resolves.toEqual(account);
    expect(requests).toHaveLength(1);
  });

  it('rejects when the server answers with an error', async () => {
    mockApi('get', '/stops', { detail: 'down' }, { status: 503 });

    await expect(searchStops('Ko')).rejects.toThrow();
  });
});
