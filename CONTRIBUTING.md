# Contributing to Hopwatch

## Licence of contributions

Hopwatch is licensed under the MIT licence. By opening a pull request you agree that your contribution is
licensed under the same licence and that you have the right to license it so. You keep the copyright of your
contribution.

## Data sources

Hopwatch reads timetables, real-time updates and vehicle positions from many sources. Every source is
implemented as an adapter. An adapter is accepted into this repository only if the data it reads may be used
without individual permission:

- the source publishes the data under an open licence (for example CC0, CC BY or ODbL), or
- the source is a national access point or another publication that EU law (Delegated Regulation (EU)
  2024/490, Implementing Regulation (EU) 2026/253) requires to be freely accessible, under its published terms.

A pull request that adds an adapter states the source, its licence or terms of use, and a link to them. The
adapter keeps the attribution the licence requires.

A source whose terms do not allow such use (restricted APIs, websites without a permissive licence) is not
read by an adapter in this repository. Velis d.o.o. asks the operator for permission. An adapter for such a
source is written only after the operator has given written permission addressed to Velis d.o.o., and it is
not part of this repository.

Never commit credentials, API keys or endpoints that a source's terms require to be kept confidential.

## Rider data

Vehicle positions shared by riders are personal data. Code that collects, transmits or stores them sends only
what is needed to match a position to a vehicle, and never a rider's identity or a trace of their journey.

## Accessibility

Every screen of the app works with a screen reader (TalkBack, VoiceOver), with the system font size and with
reduced motion. A pull request that changes the user interface keeps it so.

## Before opening a pull request

```sh
uv sync
uv run ruff check .
uv run ruff format --check .
uv run python -m vue_i18n.check app/src/locales/ --source app/src
uv run pytest
npm ci
npm run lint
```
