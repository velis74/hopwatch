# TODO

## Review the data sources

2026-11-27, session 1164b4e8-b9fc-4415-a3b0-91e0f3dba77a.

The MOTIS feeds follow the Transitous list for Slovenia and come from the derp-si community project, not from
DUJPP:

- static IJPP timetable: GitLab package `derp-si/gtfs-generators`, a repackaging of the official NAP GTFS
  `https://b2b.nap.si/data/b2b.gtfs`;
- real time: `https://rt.gtfs.derp.si/sources/ijpp/trip_updates`. derp-si derives the vehicle positions from
  the IJPP SIRI VM interface and predicts the delays with TransitClock, so the delays are estimates, not
  official data. `rt.gtfs.derp.si` states no terms of use (contact `ojpp@derp.si`); the IJPP service alerts
  URL in `motis/config.yml` is not listed on the portal.

To decide:

- what NAP / DUJPP publishes (GTFS, NeTEx, SIRI VM / ET, GTFS-RT), under which terms, and whether an account
  is needed; take the static timetable from NAP directly;
- an official real-time source: ask DUJPP for access (permission addressed to Velis d.o.o., adapter in
  `hopwatch-server`), with derp-si as a fallback;
- written consent from derp-si before production use of `rt.gtfs.derp.si`;
- `delay_source` of the IJPP delays (`estimate` while they come from derp-si).

## Operators not covered

2026-11-27, session 1164b4e8-b9fc-4415-a3b0-91e0f3dba77a.

Not in the MOTIS data, because the feeds state no licence or need an account:

- LPP city buses (`https://data.lpp.si/api/gtfs/feed.zip`; real time needs an LPP API key);
- city feeds of Maribor (Marprom), Celje, Kranj, Murska Sobota, and the derp-si manual feeds (Sevnica, Novo
  mesto, Velenje, Brežice, Postojna, Koper, Nova Gorica, Ptuj);
- Austria (`data.mobilitaetsverbuende.at`: registered account);
- Croatia (HŽPP: left out to avoid duplicates with IJPP international trains).

To decide per operator: licence request, permission for Velis d.o.o. (adapter in `hopwatch-server`), or
rider-derived data only.
