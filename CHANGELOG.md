# Changelog

All notable changes to this project are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1] - 2026-11-27

### Added

- Project scaffolding: Python package, linting, CI and documentation site.
- Local MOTIS instance with the open IJPP timetable and real-time feeds for Slovenia (`motis/`).
- API: nearby stops, stop search, departures with real-time delay and a destination filter over later stops, and
  the current account.
- Accounts: email sign-up and login, logout, Google and Apple login configured from environment variables, and the
  session token flow for the mobile app, all as API operations under `/api/v1/account`.
- API documentation: ReDoc at `/api/redoc` with a "Try it" button per operation that opens it in Swagger UI
  (`/api/docs`); sessions, errors and data licences documented for every operation.
- Web app: departures from the nearest stop with a map, stop search, destination filter, experience modes,
  settings, English and Slovenian.
- App icon and logo (`branding/`).
- API: journey planning (`/journeys`) through MOTIS, by departure or arrival time, with earlier and later pages;
  departures of several stops at once; transport modes of stops.
- Web app: "From" and "To" with "Leave now", "Depart at" and "Arrive by"; journeys drawn on the map; nearby stops
  within 300 m to add to the departures board, with a setting for the modes included by default; refresh every
  30 seconds with a notice when data is older than two minutes; the reason when the location is not available;
  the last "From" stop when there is no location.
- API: the operator of each departure and journey leg; the list of transport operators (`/operators`).
- Web app: favourite operators, marked from a departure or in the settings and kept on the device; their
  departures and journey legs carry a "Favourite" tag.

### Changed

- Delays from the IJPP real-time feed are labelled as estimates.
