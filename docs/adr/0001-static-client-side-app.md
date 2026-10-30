# 1. Static site, all computation in the browser

- **Status:** Accepted
- **Date:** 2026-10-26

## Context

The planner is used in the mountains, often without a network connection, and must keep
working there. It also has no budget or operator for a server. The computations (terrain
loading, shortest-path searches) are CPU-heavy but bounded: a few million cells.

## Decision

Build a **static site with no backend**. All computation runs in the browser, in a **Web
Worker** so the map stays responsive. The worker is a pure TypeScript module (`lib/glide`
has no DOM), portable to Rust/WASM if profiling ever demands it.

Stack: TypeScript, Vite, Svelte 5, MapLibre GL JS, Vitest. Hosting: GitHub Pages. External
services are optional enhancements (swisstopo height service, Web3Forms for issue reports);
the app works without them.

## Consequences

- Works offline once assets and elevation tiles are cached ([ADR-0014](0014-offline-with-service-worker-and-cache-storage.md)).
- No server cost, no accounts, no personal data stored by the app.
- Every plan is reproducible from its URL, which holds every setting.
- Performance is limited by the pilot's device: cell budgets must stay modest
  ([ADR-0013](0013-cell-budgets.md)).
- Elevation data must be served as static files ([ADR-0006](0006-terrarium-tiles-in-pmtiles.md)).

## Alternatives considered

- **Server-side computation**: faster and could use 2 m data directly, but needs a network
  connection in the field, hosting and operations.
- **Native mobile app**: offline by design, but two codebases and store distribution.
