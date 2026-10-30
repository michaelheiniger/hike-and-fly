# 14. Offline: service worker and per-area Cache Storage

- **Status:** Accepted
- **Date:** 2026-10-27

## Context

Pilots plan at home and check in the field without coverage. The app must start offline,
show the map and compute with the same elevation as online.

## Decision

- A **hand-written service worker** precaches the built app shell (file list and version
  filled in by a small Vite plugin); the app is an installable PWA.
- **"Download this area"** stores, in **one Cache Storage cache per area**: map and
  slope tiles (zoom 8 to the chosen detail, under their real URLs, served by the service
  worker), and elevation tiles for zooms 10–13 over the area + 5 km and zooms 6–9 for 60 km
  around it (the reach search looks for the lowest terrain far out).
- Elevation tiles are stored under synthetic URLs (`/offline-elevation/z/x/y.png`) that
  the **worker reads directly** from Cache Storage, before any network source.
- OpenTopoMap is excluded from downloads: its policy forbids bulk downloads.

## Consequences

- Offline results equal online ones (same zoom-13 cap), except the start and landing
  ground, which come from the tiles instead of the height service.
- Elevation works offline even if the service worker is not active.
- Areas are listed with size and can be deleted; storage persistence is requested.

## Alternatives considered

- **IndexedDB for tiles**: more code; Cache Storage maps naturally to URLs.
- **Workbox**: more features than needed, another dependency to keep current.
- **Download the whole archive**: a few hundred MB, too much for phones.
