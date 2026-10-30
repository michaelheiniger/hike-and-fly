# 4. Compute on a local metric grid, not in Web Mercator

- **Status:** Accepted
- **Date:** 2026-10-26

## Context

Elevation tiles and the map are in Web Mercator, which stretches distances by
`1 / cos(latitude)`: ~1.46 × in Switzerland. Searching directly on Mercator pixels would
distort every distance and every glide ratio, and the distortion would vary with latitude.

## Decision

Resample the terrain into a **local equirectangular grid** of square metric cells,
centered on the start (reach) or on the box of the route's points (routes). Meters per
degree come from the WGS84 ellipsoid at each row, and the east–west cell width is stored per
row. The map is used only for display: results are drawn back as an image with lat/lon
corners.

## Consequences

- Distances are metric to well under 1 % across a 120 km grid.
- One resampling step per request (tile pixels → grid cells): this is where the
  maximum-of-2 × 2 rule applies ([ADR-0005](0005-maximum-downsampling.md)).
- The overlay image is slightly misregistered at the edges of very large grids; this is
  negligible for display.

## Alternatives considered

- **Search in Mercator with a per-pixel scale factor**: avoids resampling, but every step
  length needs a latitude-dependent correction and the cells are not square in meters.
- **A projected CRS (e.g. LV95)**: exact in Switzerland, but not worldwide, and needs
  projection code for every point.
