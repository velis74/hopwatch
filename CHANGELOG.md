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
- Accounts: email sign-up and login, logout, Google and Apple login configured from environment variables, the
  allauth app client for the mobile app.
- Web app: departures from the nearest stop with a map, stop search, destination filter, experience modes,
  settings, English and Slovenian.
- App icon and logo (`branding/`).
