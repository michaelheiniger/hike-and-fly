# Architecture decision records

Each record explains one main decision: its context, what was decided, its consequences and
the alternatives considered. They follow [Michael Nygard's format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).
The methodology itself is explained in [`../methodology.md`](../methodology.md).

To add one: copy the last record, take the next number, and set its status to *Proposed*
until it is decided. Superseded records stay, with a link to their successor.

| # | Decision | Status | Date |
|---|---|---|---|
| 0001 | [Static site, all computation in the browser](0001-static-client-side-app.md) | Accepted | 2026-10-26 |
| 0002 | [Reachability as a constrained shortest-path search](0002-reachability-as-constrained-shortest-path.md) | Accepted | 2026-10-26 |
| 0003 | [16-neighbour moves with clearance checks on crossed cells](0003-sixteen-neighbour-grid-search.md) | Accepted | 2026-10-26 |
| 0004 | [Compute on a local metric grid, not in Web Mercator](0004-local-metric-grid.md) | Accepted | 2026-10-26 |
| 0005 | [Downsample elevation with the maximum; exact elevation at start and landing](0005-maximum-downsampling.md) | Accepted | 2026-10-26 |
| 0006 | [Terrarium PNG tiles in Web Mercator, packaged as PMTiles](0006-terrarium-tiles-in-pmtiles.md) | Accepted | 2026-10-27 |
| 0007 | [Stream the terrain build; no GDAL](0007-streaming-terrain-build-without-gdal.md) | Accepted | 2026-10-27 |
| 0008 | [Required glide ratio by bracketing and bisection](0008-required-ratio-by-bracketing-and-bisection.md) | Accepted | 2026-10-26 |
| 0009 | [Straighten grid routes and compute their exact required ratio](0009-straightened-routes-with-exact-ratio.md) | Accepted | 2026-10-26 |
| 0010 | [Alternative routes by blocking corridors](0010-alternatives-by-corridor-blocking.md) | Accepted | 2026-10-26 |
| 0011 | [Cubic launch-zone clearance ramp and a takeoff run](0011-launch-zone-ramp-and-takeoff-run.md) | Accepted | 2026-10-28 |
| 0012 | [Conservative, visible and shareable defaults](0012-conservative-defaults.md) | Accepted | 2026-10-28 |
| 0013 | [Cell budgets: 2.25 M for reach, 1 M for routes](0013-cell-budgets.md) | Accepted | 2026-10-29 |
| 0014 | [Offline: service worker and per-area Cache Storage](0014-offline-with-service-worker-and-cache-storage.md) | Accepted | 2026-10-27 |
