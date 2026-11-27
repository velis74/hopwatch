# MOTIS for local development

Hopwatch runs its own [MOTIS](https://github.com/motis-project/motis) instance (v2.11.4, official image
`ghcr.io/motis-project/motis:2.11.4`) for timetables, real-time updates, stop search and street routing. The API
listens on <http://127.0.0.1:8180>; the MOTIS web UI is served on the same address.

| Path | Content |
| --- | --- |
| `config.yml` | MOTIS configuration: datasets, GTFS-RT feeds, OSM, tiles, street routing, geocoding |
| `docker-compose.yml` | `motis-import` (profile `import`) and `motis` (server) |
| `data/` | downloaded inputs and the imported database in `data/import/` (not in git) |
| `samples/` | trimmed real API responses |

## Fetch, import and run

```bash
scripts/fetch-motis-data.sh                                        # ~370 MB into motis/data/
docker compose -f motis/docker-compose.yml run --rm motis-import   # writes motis/data/import/ (~1 GB)
docker compose -f motis/docker-compose.yml up -d motis             # API on 127.0.0.1:8180
curl http://127.0.0.1:8180/api/v1/health                           # {"rt":true,"gbfs":false}
docker compose -f motis/docker-compose.yml down                    # stop
```

The containers run as UID/GID 1000; set `MOTIS_UID` / `MOTIS_GID` when `motis/data/` belongs to another user.

The static feeds are snapshots: the timetable only covers the service days the downloaded feed contains. Refresh
by running the fetch script and the import again, then restart the server
(`docker compose -f motis/docker-compose.yml restart motis`). Real-time feeds are polled every 60 seconds.

## API used by the backend

All times are UTC (ISO 8601). Stop ids carry the dataset tag as prefix (`ijpp_1122804`). Coordinates are
`latitude,longitude`.

| Need | Request | Sample |
| --- | --- | --- |
| Stops in a bounding box | `GET /api/v6/map/stops?min={minLat},{minLon}&max={maxLat},{maxLon}` | `samples/map-stops.json` |
| Stops nearest to a coordinate | `GET /api/v1/reverse-geocode?place={lat},{lon}&type=STOP&numResults=3` | `samples/reverse-geocode.json` |
| Stop search by name | `GET /api/v1/geocode?text={text}&type=STOP` (optional `place={lat},{lon}` bias, `language=sl`) | `samples/geocode.json` |
| Departures with real time | `GET /api/v6/stoptimes?stopId={id}&n={count}&fetchStops=true` | `samples/stoptimes.json` |
| Later stops of a trip | `GET /api/v6/trip?tripId={tripId}&detailedLegs=false` | `samples/trip.json` |
| Ride details with the path | `GET /api/v6/trip?tripId={tripId}` | `samples/trip-detailed.json` |
| Journey planning | `GET /api/v5/plan?fromPlace={stopId or lat,lon}&toPlace={stopId}&time={ISO}&arriveBy={bool}` (optional `pageCursor`) | `samples/plan.json` |
| Routes serving a stop | `GET /api/v6/stop?stopId={id}` | `samples/stop.json` |

- `stoptimes`: each `stopTimes[]` entry has `place.departure` (real-time estimate when available) and
  `place.scheduledDeparture`; the delay is their difference. `realTime` is `true` when the trip has real-time data;
  `place.departureTimestampReason` is `SCHEDULED`, `PREDICTED`, `PROPAGATED` or `NO_RT_DATA`. Platforms are
  `place.track` / `place.scheduledTrack`; the current Slovenian feeds publish none. `cancelled`, `tripCancelled` and
  `place.alerts` (GTFS-RT service alerts) are included. `fetchStops=true` adds `nextStops` (later stops with times)
  to each departure; it is marked experimental in the MOTIS API. Other parameters: `time`, `window` (seconds),
  `mode` (e.g. `RAIL,BUS`), `radius`, `pageCursor` (`nextPageCursor` / `previousPageCursor` in the response).
- `trip` returns the trip as an itinerary with one leg per trip segment; `legs[].intermediateStops` hold the stops
  between `from` and `to`, each with real-time and scheduled times. `tripId` comes from a stop time or leg and
  includes the service date (`20261127_08:56_ijpp_465929`), so it is valid only for that day. An unknown trip
  answers 404, a malformed `tripId` 400. `legGeometry` (encoded polyline) is empty with `detailedLegs=false`.
  `bikesAllowed` and `wheelchairAccessible` (`ACCESSIBLE`, `NOT_ACCESSIBLE`, `UNKNOWN`) describe the vehicle.
- The full API description is the `openapi.yaml` of the MOTIS release.

## Data sources, licences and attribution

The feed list follows [Transitous](https://github.com/public-transport/transitous) (`feeds/si.json`). Only feeds
with a licence that allows reuse in Hopwatch are configured.

| Dataset tag | Content | URL | Licence | Attribution |
| --- | --- | --- | --- | --- |
| `ijpp` | IJPP national timetable: intercity and suburban buses (Nomago, Arriva, LPP suburban, AP Murska Sobota), SŽ trains and international trains to and through Slovenia | `https://gitlab.com/api/v4/projects/derp-si%2Fgtfs-generators/packages/generic/IJPP/latest/ijpp_intl_gtfs.zip` (derived from [NAP](https://nap.si/en/datasets_details?id=6fc3966a-5e3f-cf10-1df3-70d3af14d03d) `https://b2b.nap.si/data/b2b.gtfs`) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | Družba za upravljanje javnega potniškega prometa (DUJPP), nap.si |
| `ijpp` (real time) | trip updates and service alerts for the IJPP feed | `https://rt.gtfs.derp.si/sources/ijpp/trip_updates`, `https://rt.gtfs.derp.si/sources/ijpp/service_alerts` | as the IJPP feed (CC BY-SA 4.0) | DUJPP, nap.si; SŽ – Potniški promet |
| `kranjskagora` | Kranjska Gora local buses | `https://jbb.ghsq.de/gtfs/si-kranjska-gora.gtfs.zip` (rehost of [NAP](https://nap.si/en/datasets_details?id=b1f8aacc-e144-490c-a1d7-d0b07c2e8ac3) `https://b2b.nap.si/data/b2b.gtfs.kranjska-gora`) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | DUJPP, nap.si |
| OSM | Slovenia extract (streets, addresses, map tiles) | `https://download.geofabrik.de/europe/slovenia-latest.osm.pbf` | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) | © OpenStreetMap contributors |

CC BY-SA 4.0 requires attribution in the app and that timetable data Hopwatch redistributes in adapted form is
published under the same licence.

Not configured:

- LPP city buses (`https://data.lpp.si/api/gtfs/feed.zip`, real time `https://rt.gtfs.derp.si/sources/lpp/all`):
  no licence is stated by LPP or in Transitous.
- City networks of Maribor, Celje, Kranj, Murska Sobota, Sevnica, Novo mesto, Velenje, Brežice, Postojna, Koper,
  Nova Gorica and Ptuj: no licence is recorded in Transitous.
- Austria (`data.mobilitaetsverbuende.at`, including railway reference data): downloads require a registered
  account.
- HŽPP (Croatia, CC0 1.0): the international trains to and from Slovenia are already in the IJPP feed; adding the
  feed duplicates them unless `merge_dupes_inter_src` is enabled.
- Trenitalia (`proxy.busone.app`): no licence is recorded in Transitous.
