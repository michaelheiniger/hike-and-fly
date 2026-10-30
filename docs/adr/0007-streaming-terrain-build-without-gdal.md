# 7. Stream the terrain build; no GDAL

- **Status:** Accepted
- **Date:** 2026-10-27

## Context

Building the archive reads all of swissALTI3D: ~50 GB of 2 m GeoTIFFs. The build machine
has tight disk space and no administrator rights; GDAL is hard to install there and heavy
as a dependency.

## Decision

`tools/terrain/build_swissalti3d.py` **streams** each GeoTIFF from swisstopo's STAC API,
folds it into the zoom-13 pixels of a zoom-9 chunk (4096² floats in memory) with a running
maximum, and **discards** it. Only encoded tiles and the output reach the disk.
Reprojection uses **swisstopo's approximate LV95 ↔ WGS84 formulas** (~1 m), reading the
GeoTIFF georeferencing tags with Pillow. Dependencies: numpy and Pillow only, pinned with
uv; a small PMTiles writer is built in and checked with the official reader.

## Consequences

- Runs anywhere Python runs; ~1 h for the whole country.
- ~1 m reprojection error, far below the 13 m pixel.
- The script relies on swissALTI3D's GeoTIFF layout and tags as Pillow reads them today;
  a format change at swisstopo would need an update.
- The archive is generated data: published as a GitHub release asset, not committed.

## Alternatives considered

- **GDAL (gdalwarp + gdal2tiles / rio-pmtiles)**: standard and exact, but a heavy native
  dependency and intermediate files of tens of GB.
- **Download everything first**: simpler, needs ~50 GB of disk.
