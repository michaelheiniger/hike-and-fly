# 6. Terrarium PNG tiles in Web Mercator, packaged as PMTiles

- **Status:** Accepted
- **Date:** 2026-10-27

## Context

The app is static ([ADR-0001](0001-static-client-side-app.md)) and must read elevation
for any area, online and offline, in Switzerland first and worldwide later. A global
fallback exists: AWS Terrain Tiles, terrarium PNG in Web Mercator.

## Decision

Serve the Swiss data in the **same format as the global fallback**: 256 × 256 **terrarium
PNG** tiles (`z = R·256 + G + B/256 − 32768`) on the **Web Mercator** tile grid, zooms 6–13,
packaged as **one PMTiles v3 file** read with HTTP range requests. The loader tries, per tile:
saved offline area → archive → AWS. **All sources are capped at zoom 13**, so sources never
mix within an area and online and offline results agree. Every source is clamped at
−450 m (lowest dry land), as AWS has sea depths and spikes down to −20 775 m.

## Consequences

- The app only knows "a terrarium tile source"; going worldwide means another file.
- Lossless, decoded natively by browsers; MapLibre can render hillshade from the same tiles.
- One file to host, cache or slice for offline use; no tile server.
- PNG compresses elevation less well than specialised formats; the archive is a few
  hundred MB.

## Alternatives considered

- **Cloud-Optimized GeoTIFF**: standard, but needs a GeoTIFF decoder in the browser and
  is not readable by MapLibre.
- **Mapbox Terrain-RGB**: equivalent, but a different encoding than the global fallback.
- **Individual tile files on Pages**: hundreds of thousands of files, slow deploys.
