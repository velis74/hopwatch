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

## Data quality reports for operators

2026-11-27, session 1164b4e8-b9fc-4415-a3b0-91e0f3dba77a.

Compare the actual running (real-time feeds, later rider-shared positions) with the published timetable and offer
operators a data quality report where the deviations are significant:

- punctuality by line, stop and hour; sections where the timetable is systematically wrong;
- wrong stop coordinates (vehicles stop elsewhere), missing or extra stops, wrong platforms, trips that do not run;
- accuracy of the operator's own real-time predictions against the actual arrival.

Conditions:

- needs a history of delays and vehicle positions, which nothing stores today: a new server component with a database
  and processing, in `hopwatch-server` (a Velis d.o.o. service, not part of the open core);
- reports derived from CC BY-SA data: decide how their licence follows from the sources.

## My journey, "Did I miss it?" and "Interested in this ride"

2026-11-27, session 1164b4e8-b9fc-4415-a3b0-91e0f3dba77a. Agreed design; the next PR after the languages and
favourites work. Uses vue-forms, vuetify-inputs and modal-form-kit; lists stay as they are until df-grid has table
semantics (see below).

- "Did I miss it?": the user enters a train or line number (`LPV 2418`, `A6375`) or a scheduled time; the stop is
  "From". The app finds the trip in the stop's timetable (±2 h, so the departures API needs a window that starts in
  the past) and answers: not departed yet, departs in X min (Y min late); departed X min ago; cancelled. Several
  matches are offered as a list.
- "Interested in this ride": a button on every departure and journey adds the ride to "My rides" on the device. The
  list shows the live state (delay, platform, departed). Rides are cleaned up 3 days after arrival (setting); a ride
  marked "Keep" stays. Needs a trip status endpoint (one trip at one stop: times, delay, platform, cancelled).
- "My journey": a named group of rides; rides in a journey are never cleaned up. Per ride a plan column (planned
  departure and arrival, planned price) and a realisation column (actual times from real-time data, price paid,
  used / not used, "I have a ticket", "Buy ticket" link from `ticket_url` or the operator's site). The journey report
  sums plan and realisation (rides, time, price, difference); CSV export.
- App state: without an active journey the home page is discovery as now. With an active journey (at most one; started
  by "Start journey" or automatically when its first ride is due within a few hours; ended by "End journey" or after
  the last arrival, which opens the report) the home page opens the planner with From/To of the current leg, and the
  departures board and "Did I miss it?" are limited to the stops and rides of the plan; "All stops" switches back to
  discovery while the journey stays active.
- Everything stays on the device; syncing with the account is a later decision. Design goes into
  `docs/design/architecture.md` (User interface).

## "Get moving" reminder

2026-11-28, session 1164b4e8-b9fc-4415-a3b0-91e0f3dba77a.

- For a ride in "My rides" or the current leg of the active journey, the app notifies the rider when it is time to set
  off for the boarding stop: departure (expected, with the delay) minus the time to reach the stop minus a margin
  (setting).
- Optional loud alarm for the same moment (alarm sound, also when the phone is silent where the platform allows it):
  Capacitor local notifications with an alarm channel on Android, a time-sensitive / critical alert on iOS.
- The time to reach the stop follows the current position: MOTIS plans from coordinates (`fromPlace` as
  `lat,lon`) with the first mile on foot (`preTransitModes`), later also with public transport to the boarding stop
  (a plan from the position to the boarding stop, arriving by the departure). The reminder is rescheduled when the
  position or the delay changes.
- UI: a bell button on every ride in "My rides" opens the reminder's settings: on / off, minutes before, reserve
  time as a percentage of the time to the stop, loud alarm, alarm ringtone, and "set the alarm in the clock app
  instead" (Android `AlarmClock.ACTION_SET_ALARM`; iOS has no public API for the Clock app). The bell shows whether a
  reminder is set.
- To decide: positions while the app is in the background. The architecture allows location only in the foreground;
  without background location the reminder uses the last position the app saw and a scheduled refresh of the delay.

## Library work this app waits for

2026-11-27, session 1164b4e8-b9fc-4415-a3b0-91e0f3dba77a.

- `@dynamicforms/vue-grid` (workarounds in `departures-list.vue`, `journey-list.vue`, `app/src/test-setup.ts`): the
  `#item` slot replaces the row card (measuring ref, `even` / `odd`, `state-*` classes), so the lists draw their own
  card; the responsive layout is measured without the `#item` slot (own 720 px breakpoint); no height that follows
  the content up to a maximum; no visually hidden header row; the shadow grid retries `getComputedStyle` every frame
  while `grid-template-columns` is `none`, also after unmount; added records render after the 100 ms windowing
  throttle.
- `@dynamicforms/vuetify-inputs` `df-select` (workarounds in `stop-search.vue`, `nearby-stops.vue`): the clear button
  is not in the tab order (own "Clear" button); no separate chip text (CSS hides the modes in the chip); no option
  accessible name (hidden ", " in the content); the chosen chip is not announced on focus (`aria-description`);
  `minQueryLength` counts untrimmed text (own check). `df-date-time` has no local value format without an offset
  (conversion in `journey-form.vue`).
- `dynamicforms-fastapi-viewsets`: the `ApiErrorBody` and `ApiFieldError` schema descriptions name Django and
  pydantic; let the application replace them or word them neutrally. `hopwatch/api/main_test.py` exempts the two
  schemas from the infrastructure check until then.

## Smaller items

2026-11-27, session 1164b4e8-b9fc-4415-a3b0-91e0f3dba77a.

- "Support this project" screen (one-time, monthly, yearly support through in-app purchases; a small supporter perk
  so that subscriptions pass store review) belongs to the Capacitor app PR. The app stays free for everyone.
- The German, Croatian and Serbian texts need a native speaker's review before release.

## Platforms reported by riders

2026-11-27, session 1164b4e8-b9fc-4415-a3b0-91e0f3dba77a.

Where the timetable has no platform (IJPP has none), ask the rider after the departure whether they found the vehicle
and at which platform, and show the platform to other riders of the same stop and line. Needs a server-side store
of reports, a consistency rule before a platform is shown (several reports agree, recent), the source named as
"riders" like rider delays, and the reports under the rider-derived data licence (ODbL).
