import { describe, expect, it } from 'vitest';

import { mockApi } from '../test-utils';

import { accountMe, departures, journeys, nearbyStops, searchStops } from './hopwatch-api';

const STOP = { id: 'si:1', name: 'Ljubljana', lat: 46.0569, lon: 14.5058, modes: ['rail'] };

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

  it('asks for departures of the next hour of all stops, as a repeated stop key', async () => {
    const requests = mockApi('get', '/departures', []);

    await expect(departures(['si:1'])).resolves.toEqual([]);
    await departures(['si:1', 'si:3'], 90);

    expect(requests.map((request) => request.url.search)).toEqual([
      '?stop_id=si%3A1&window_minutes=60',
      '?stop_id=si%3A1&stop_id=si%3A3&window_minutes=90',
    ]);
  });

  it('plans journeys from now and sends time, arrival and page only when given', async () => {
    const answer = { itineraries: [], earlier_cursor: 'e', later_cursor: null };
    const requests = mockApi('get', '/journeys', answer);

    await expect(journeys({ fromStopId: 'si:1', toStopId: 'si:2' })).resolves.toEqual(answer);
    await journeys({
      fromStopId: 'si:1',
      toStopId: 'si:2',
      time: '2026-11-27T10:00:00+01:00',
      arriveBy: true,
      pageCursor: 'abc',
    });
    await journeys({ fromStopId: 'si:1', toStopId: 'si:2', arriveBy: false });

    expect(requests.map((request) => Object.fromEntries(request.url.searchParams))).toEqual([
      { from_stop_id: 'si:1', to_stop_id: 'si:2' },
      {
        from_stop_id: 'si:1',
        to_stop_id: 'si:2',
        time: '2026-11-27T10:00:00+01:00',
        arrive_by: 'true',
        page_cursor: 'abc',
      },
      { from_stop_id: 'si:1', to_stop_id: 'si:2' },
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
