# Elevation data

`build_swissalti3d.py` turns swisstopo's swissALTI3D (2 m) into one PMTiles archive of
terrarium PNG tiles, which the app reads at `public/terrain/swissalti3d.pmtiles`. Without
the archive the app falls back to the global AWS Terrain Tiles.

```sh
# All of Switzerland (~50 GB streamed from swisstopo, ~1 h, output a few hundred MB)
python3 tools/terrain/build_swissalti3d.py public/terrain/swissalti3d.pmtiles

# A region, for testing
python3 tools/terrain/build_swissalti3d.py public/terrain/swissalti3d.pmtiles --bbox 8.0 46.62 8.2 46.74

# Tests (no network)
python3 -m unittest discover tools/terrain
```

Requirements: Python 3, numpy, Pillow. No GDAL: LV95 is converted with swisstopo's
approximate formulas (~1 m), far below the output pixel size.

What it does, and why (see `docs/design.md`):

- Streams each 2 m tile and discards it, so disk use stays small.
- Folds every 2 m pixel into its Web Mercator pixel with a running **maximum**: obstacles
  are never underestimated. Lower zooms take the max of their four children.
- Default zooms 6–13 (~13 m pixels in Switzerland at zoom 13).
- Fills pixels outside swissALTI3D from AWS Terrain Tiles, so border tiles are seamless.
- Writes PMTiles v3 (clustered, gzip directories, PNG tiles) with a small built-in writer.

The archive is generated data and is not committed.
