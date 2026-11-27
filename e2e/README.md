# End-to-end tests

Scenario tests of the app in a real browser against the real development servers and MOTIS; nothing is mocked.
They select elements only by role and accessible name, and every page is checked with axe (no serious or critical
WCAG 2.2 A/AA violations).

| File | Covers |
| --- | --- |
| `experience.e2e.ts` | experience dialog, its persistence, settings (experience, language), reduced motion |
| `departures.e2e.ts` | departures from the nearest stop, "From" stop search, map, live region, refresh |
| `journeys.e2e.ts` | "From"/"To" form, journey list, "Earlier"/"Later", "Depart at"/"Arrive by", swap, map, clearing "To" |
| `nearby-stops.e2e.ts` | "Nearby stops" chips, merged departures, "Add a stop", "Include nearby stops by default" setting |
| `refresh.e2e.ts` | refresh every 30 s, on visibility and after a frozen page; "Not updated since" (fake clock) |
| `accounts.e2e.ts` | sign-up, log-out, failed and keyboard log-in, social login buttons |
| `support.ts` | fixture constants and shared helpers |

## Running

```bash
docker compose -f motis/docker-compose.yml up -d motis   # MOTIS on 127.0.0.1:8180 (motis/README.md)
scripts/dev.sh                                           # Django 8100, FastAPI 8101, Vite 5180
npx playwright install chromium                          # once
npm run test:e2e                                         # both projects: desktop Chromium and Pixel 7
npm run test:e2e -- --project=chromium departures        # one project, one file
```

`HOPWATCH_BASE_URL` points the tests at another address than `http://127.0.0.1:5180`.

## Fixture

The browser is placed at 46.0584, 14.5127, about 20 m from Ljubljana railway station (MOTIS stop
`ijpp_1122804`); the time zone is `Europe/Ljubljana`. Journeys go to "Kranj" (`ijpp_1122811`), the stop search
uses "Ljubljana" and "Lesce-Bled", and the nearby stop is the bus station "Ljubljana AP" (`ijpp_1168813`, about
160 m away). One scenario runs with geolocation denied.

Departures come from the imported timetable for the current time:

- Between 21:00 and 05:30 Ljubljana time the fixture stop has too few departures in the next 60 minutes, and the
  assertions on the list contents are skipped.
- Many service calendars in the current IJPP feed end on 2026-12-13. From 14 December 2026 the fixture stop has
  almost no departures until the feed with the new timetable is fetched and imported again (motis/README.md).

The social login buttons are expected exactly for the providers that `/_allauth/browser/v1/config` lists, so the
tests pass with and without configured providers.

Each sign-up scenario creates a new user `e2e-<time>-<random>@example.com` in the development database.
