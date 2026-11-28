# Architecture

Design of Hopwatch. The components described here are not implemented yet; this document is the reference for
the implementation.

## Purpose

Hopwatch shows public transport (trains, buses, later shared mobility) in real time on an OpenStreetMap map. It
fills the gap where operators hold real-time data but do not publish it: rider-shared vehicle positions and
sources read with the operator's permission provide delays that other journey planners do not show.

## Components

| Component | Repository | Licence | Role |
| --- | --- | --- | --- |
| Core (`hopwatch`, Python) | `velis74/hopwatch` | MIT | source adapter interface, open adapters, rider position matching, public API |
| App (Vue, Capacitor) | `velis74/hopwatch` | MIT | mobile app for Android and iOS |
| Routing engine | MOTIS (upstream) | MIT | timetables, journey planning, real-time updates |
| Server (`hopwatch-server`) | `velis-doo/hopwatch-server` (private) | proprietary | adapters for sources used with permission, deployment |

The server package depends on the core and registers its adapters through Python entry points. The core finds
every installed adapter; only Velis d.o.o. servers have the server package installed. The adapter interface is
public API of the core and follows semantic versioning.

MOTIS reads three kinds of input:

- open feeds (GTFS, GTFS-RT, NeTEx, SIRI); the list of open feeds for Slovenia, Croatia and Austria is
  contributed to Transitous, and the Hopwatch instance uses the same list;
- feeds that the server package's adapters produce from sources used with permission;
- the GTFS-RT feed that the core derives from rider-shared positions.

Hopwatch runs its own MOTIS instance and does not use the public Transitous API.

## Data layers

| Layer | Licence of the data | Available through |
| --- | --- | --- |
| Open sources | the source's licence (ODbL stays ODbL, CC BY keeps attribution) | app, public API |
| Rider-derived vehicle positions and delays | ODbL | app, public API |
| Sources used with permission | the terms of the permission | app; public API only where the permission allows redistribution |

Raw rider traces are never published. Data under a share-alike licence is stored apart from data used with
permission, so that combining them does not extend the share-alike obligation.

Requests for permission ask for redistribution through the public API, not only for display in the app.

## Rider-shared positions

- Sharing is one opt-in for the whole app, revocable in the settings at any time. The app works fully without
  it.
- Positions are sent only while the app is in the foreground. The app does not request background location.
- The device matches its position to a vehicle (trip and stop sequence) and sends only the trip, the position
  and the time, without a user identity. The start and the end of a journey are not sent.
- With approximate location (Android coarse, iOS reduced accuracy) the app neither matches nor shares; the
  position only selects nearby stops.
- While sharing, the app shows which vehicle the position is shared for.
- A position off the vehicle's route or implying an impossible speed is rejected; a vehicle position is
  published when it is consistent across devices.
- Every delay shown names its source: official, riders or estimate.

## Accounts

- Every operation the apps call is a fastapi-viewsets action under `/api/v1` and is documented in the OpenAPI
  schema. Sign-up, login, logout, social login and the session state are actions of `/api/v1/account`; no other
  URL is called by the apps.
- The account actions run django-allauth's flows (`hopwatch.accounts.flows`) in a Django request built from the
  API request (`hopwatch.accounts.bridge`), prepared as allauth's headless views prepare theirs; the API does not
  reimplement authentication.
- The web app is a `browser` client: the session is Django's session cookie, `GET /api/v1/account/session` sets
  the CSRF cookie, and every `POST` passes Django's CSRF check (origin and `X-CSRFToken`). The mobile app is an
  `app` client (`X-Client-Type: app`): login answers a session token that it sends in `X-Session-Token`, without
  cookies or CSRF.
- On the phone, Google and Apple login use the native SDK, which returns an ID token; the app posts it to
  `POST /api/v1/account/social/token` and receives a session token. In the browser,
  `POST /api/v1/account/social/redirect` answers the provider's URL; the provider returns to its callback under
  `/accounts/` (a Django view, the only route the providers call), which redirects to the app.
- Other actions resolve the user from the Django session cookie or the `X-Session-Token` header.
- A social provider is enabled only when its credentials are set in the environment; the login page shows only
  the enabled providers.

## Public API

- Standard formats first: GTFS, GTFS-RT and, where needed, SIRI. A Hopwatch API (REST, muxws push) covers what
  the standards do not: rider reports and subscriptions to a trip or a stop.
- Access requires an API key. A free key has a quota above the use of one phone; higher quotas are paid and
  managed with allowances.
- Third-party applications use the public API. The app does not load third-party plugins.

## App

- The Vue code is compiled into the app. A newer bundle downloads in the background and becomes active on the
  next start; a bundle that does not confirm a successful start is rolled back. Capgo
  (`@capgo/capacitor-updater`, self-hosted) is the first candidate.
- Versions: the bundle declares the minimum native shell version it needs, and the server offers each shell the
  newest compatible bundle. The API supports a window of older bundle versions, because a bundle stays in use
  until the app restarts. The API, the bundle and the native shell each follow semantic versioning.
- Offline: when a journey is planned, the app stores its stops, timetable, route shape, transfers and map tiles
  for the corridor. Without a connection the device's GPS and the stored route give the position, the time to
  the destination and the time to a transfer. The delay of a connecting vehicle is shown as the last known value
  with its age. Rider reports collected offline are sent when the connection returns.

## User interface

- The start screen has a journey form: "From" (filled with the nearest stop), "To", a swap button and the time
  choice "Leave now", "Depart at" or "Arrive by".
- Without "To" the start screen lists departures from the "From" stop in the next 60 minutes. Other stops within
  300 m are filter chips (mode icons, name, distance; screen readers get checkboxes) that add their departures to the
  list; the settings choose the modes whose nearby stops are checked by default. "Add a stop" finds any other stop
  by name; added stops are kept on the device per "From" stop and checked by default. The list takes at most 10
  stops, "From" included. A list of several stops names the stop of each departure.
- With "To" the start screen lists journeys from MOTIS, one page at a time, with earlier and later pages. The map
  draws the selected journey: one line per leg coloured by mode, walks dashed.
- Layout: on wide screens (Vuetify `md` and up) the form is on top and below it the list (departures or journeys) is
  on the left and the map on the right, sticky and as high as the viewport below the app bar. Narrow screens have one
  column with the map below the list or the details.
- Navigation: the app bar holds the logo and the title, a link to the start page. The main navigation (`nav` landmark
  "Main navigation") is a Vuetify navigation drawer with Departures and Settings and, at the bottom, the logged-in
  email with "Log out", or "Log in"; the current page is marked with `aria-current="page"`. From `md` up it is a rail
  of icons that widens over the page on hover and while it holds keyboard focus. Below `md` it is a temporary drawer
  opened by the "Menu" button in the app bar (`aria-expanded`, `aria-controls`): opening moves focus to its first
  item and keeps Tab inside; navigation, Escape and the scrim close it, and focus returns to the button unless the
  new page has taken it.
- Narrow screens show the views in succession: form, list, details. The form's submit button ("Show departures",
  "Find journeys") opens the list (`/?view=list`) with the form collapsed to a one-line summary and a "Change"
  button; a departure or a journey's "Details" opens its details. The browser Back returns to the list, then to the
  form. Wide screens show the details in place of the list, beside the form and the map, with "Back to the list"; a
  changed search closes them. On every view change focus moves to the heading of the new view and a live region
  announces it.
- Details are child routes of the start page, which keeps the search and the list while they are open:
  `/ride/:tripId` (query `from` and `to`: the stop ids where the rider boards and gets off; `at`: the scheduled
  departure at the boarding stop, which picks the visit of a stop the ride calls at more than once and the boarding
  stop when `from` is a station the ride calls at by another stop id; without them the ride from its first to its
  last stop) and `/journey` (query `id`: the itinerary chosen in the journeys list, kept in a
  store for the browser tab and replaced by its newer version on every refresh of the list).
- Ride details (`GET /api/v1/trips/{trip_id}`): mode, line and headsign, the operator with the favourite toggle, the
  boarding stop with time, expected time, delay and platform, the exit stop, the travel time, a timeline of every stop
  between them with its times (passed stops dimmed and marked "Passed"), the amenities that are known (bicycles,
  wheelchairs; icon and text), "Buy ticket" when the ride has a ticket link, and a prominent notice for a cancelled
  ride or stop. The map draws the ride between the two stops with a dot at each stop. Journey details: departure,
  arrival, duration and transfers, then each leg in order: a ride as in the ride details (the leg's own times until
  its ride has loaded), a walk with distance and time, and before each ride that follows another the transfer with
  its waiting time. Details refresh like the lists and announce a changed delay at the boarding stop.
- Departures, journeys and details refresh while the page is visible, when 30 seconds have passed since the last load (checked
  every half second, so a page shown again or resumed after a freeze refreshes at once). Data older than two
  minutes carries a notice with the time of the last update.
- Favourite operators: the user marks operators (from a departure or in the settings) as favourites; their ids and
  names are kept on the device, so the settings also list a favourite the API does not list. Departures and journey
  legs of a favourite operator carry a "Favourite" tag. MOTIS answers name the operator (`agencyId`) of each trip but
  have no operator list, so `/api/v1/operators` reads the `agency.txt` of the GTFS feeds MOTIS loads
  (`TIMETABLE_FEEDS`, re-read when a file changes) and adds every operator an answer named since the process started.
- The app learns frequent stop, time and destination combinations on the device and offers them as one-tap
  filters. This data does not leave the device.
- When the device moves along a vehicle's route, the start screen shows the journey: time to the destination,
  time to a transfer and the state of the connection.

## Accessibility

Accessibility is a primary feature:

- Every screen works with TalkBack and VoiceOver from the first release. The departures and journey lists are
  the primary view and the text equivalent of the map.
- Delay changes are announced through live regions.
- The app follows the system font size, `prefers-reduced-motion` and contrast settings.
- On the first start the app asks for an experience: "Simple and large" or "Lively". The choice is stored on
  the device and changes presentation only (density, font scale, animation, contrast). Both meet WCAG 2.2 AA.
  The user guide describes the differences.
- Automated accessibility checks run in the end-to-end tests.

## Languages

Slovenian, English (en-GB), German, Croatian, Serbian in Cyrillic (`sr-Cyrl`, the source) and Serbian in Latin
script (`sr-Latn`, derived by transliteration). The app uses vue-i18n; server texts use vue-i18n-python with the
same message files.

- The message files are `app/src/locales/<locale>.json`, one per locale except `sr-Latn`: its messages are the
  `sr-Cyrl` messages transliterated when the app starts (`app/src/serbian-latin.ts`). Placeholders and linked
  messages stay as written.
- The app starts in the language chosen on the device, otherwise in the first browser language it offers, otherwise
  in English. A Serbian browser language starts in Cyrillic unless it names Latin script (`sr-Latn`).
- The strings of the DynamicForms libraries are under `inputs` and `modal` in every message file; Vuetify's own
  strings come from Vuetify's locales. Times and lists are formatted with `Intl` for the locale's language tag.
- CI checks the message files and the keys the app asks for with `python -m vue_i18n.check`.
