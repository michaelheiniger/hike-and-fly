# Elevation data

`build_swissalti3d.py` turns swisstopo's swissALTI3D (2 m) into one PMTiles archive of
terrarium PNG tiles, which the app reads at `public/terrain/swissalti3d.pmtiles`. Without
the archive the app falls back to the global AWS Terrain Tiles.

Run from `tools/terrain` with [uv](https://docs.astral.sh/uv/), which installs the pinned
dependencies (numpy, Pillow; the official `pmtiles` reader for verification) on first use:

```sh
cd tools/terrain

# All of Switzerland (~50 GB streamed from swisstopo, ~1 h, output a few hundred MB)
uv run build_swissalti3d.py ../../public/terrain/swissalti3d.pmtiles

# A region, for testing
uv run build_swissalti3d.py ../../public/terrain/swissalti3d.pmtiles --bbox 8.0 46.62 8.2 46.74

# Check an archive with the official pmtiles reader
uv run verify_pmtiles.py ../../public/terrain/swissalti3d.pmtiles

# Tests (no network)
uv run python -m unittest
```

No GDAL: LV95 is converted with swisstopo's approximate formulas (~1 m), far below the
output pixel size. Dependency versions are locked in `uv.lock` and limited to releases at
least two weeks old (`exclude-newer` in `pyproject.toml`).

What it does, and why (see `docs/design.md`):

- Streams each 2 m tile and discards it, so disk use stays small.
- Folds every 2 m pixel into its Web Mercator pixel with a running **maximum**: obstacles
  are never underestimated. Lower zooms take the max of their four children.
- Default zooms 6–13 (~13 m pixels in Switzerland at zoom 13).
- Fills pixels outside swissALTI3D from AWS Terrain Tiles, so border tiles are seamless.
- Writes PMTiles v3 (clustered, gzip directories, PNG tiles) with a small built-in writer.

The archive is generated data and is not committed.

## Deployment

The GitHub Pages workflow (`.github/workflows/pages.yml`) takes the archive from a
release asset. After a rebuild, publish it under a new tag and update `TERRAIN_RELEASE`:

    gh release create terrain-YYYY-MM-DD public/terrain/swissalti3d.pmtiles \
      --title "swissALTI3D terrain YYYY-MM-DD" --notes "Elevation archive for the app."
