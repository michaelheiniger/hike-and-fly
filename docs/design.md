# Hike & Fly Planner — Design

A web app for paraglider pilots planning a hike & fly: pick a start and a landing on a map,
see the area reachable for a given glide ratio (color-coded by height above ground), and the
glide ratio required to reach the landing — taking terrain into account (the glider can fly
around mountains, never through them).

Scope: Switzerland first, worldwide later. Ultimately usable offline in the mountains.

## 1. Core algorithm

### Reachable area and AGL

Height lost is proportional to distance flown (`Δh = d / GR`), and being higher is never
worse. So the highest possible altitude over any point comes from the **shortest flyable
path** to it. This makes the problem a constrained shortest-path search on a terrain grid:

- Resample the terrain into a local metric grid centered on the start.
- Run Dijkstra from the start. A cell may be entered only if the glider would still be
  above the terrain plus the required clearance there:
  `h_start − d / GR ≥ terrain(cell) + clearance(d)`
- Result: `d(x)`, the shortest flyable distance to every cell. From it:
  - `altitude(x) = h_start − d(x) / GR`
  - `AGL(x) = altitude(x) − terrain(x)` → the color-coded overlay
  - reachable area = cells with a finite `d(x)`
  - route to any point = backtrack the predecessor of each cell

One search yields the overlay, the reachable area, and the best route to every point.

**Distance accuracy.** 8-neighbour moves overestimate straight-line distances by up to ~8 %,
which directly inflates glide ratios. The search uses 16-neighbour moves (knight moves
included), bounding the error to ~2.7 % in open air. Paths bending around obstacle corners
follow cell centers and come out up to ~5 % long (conservative). Theta* (any-angle) or
fast marching can tighten this later.

### Required glide ratio (milestone 2)

The route depends on the glide ratio: a worse glider loses height faster, ridges become walls
and it has to go around. Reachability is monotonic in GR (reachable at GR g ⇒ reachable at
any g' > g), so the minimum GR is found by **binary search**, running the search for each
candidate (~10 runs for 0.05 precision). If the straight line is clear, the result equals
`distance / (h_start − h_landing − arrival_height)`.

Implementation notes:

- The route search uses its own grid, centered between start and landing with room for
  detours (≤ 1 M cells, as it runs ~10 times). Each run stops once the landing is settled.
- Start and landing cells use their true elevation; the rest of the grid keeps the max.
- The required GR is rounded up to 0.1 (conservative), and the grid's distance overestimate
  (≤ ~3–5 %) also errs on the safe side.
- Terrain and required GR are cached per (start, landing, assumptions): moving the GR slider
  only reruns one search for the pilot's own route.
- Two routes exist: the one at the required GR (it may detour around a ridge) and the one
  flown with the pilot's GR (which may cross it). The map and profile show the pilot's route
  when it reaches the landing, otherwise the required one, dashed.
- The arrival can exceed the arrival height at the required GR: the limiting point may be a
  ridge en route (the glide path touches the clearance line in the profile).

### Alternative routes (milestone 3)

Routes passing on different sides of a mountain: find the best route, block its corridor
(a band of 10 % of the straight distance, 300 m–1.5 km, left open near start and landing),
search again; up to 3 routes. The pilot's own shortest route joins the list when it lies
outside the corridors already found. Alternatives run in a second pass, after the best
route is shown.

- **Straightening.** Grid routes are replaced by straight segments wherever flyable
  (string pulling against dense samples). This removes the zigzag and most of the grid's
  distance overestimate; paths around obstacle corners stay within ~3 %.
- **Exact required GR per route.** For a fixed route line, the minimum GR is a closed form
  over samples (~2 per cell): `max(d / (h_start − terrain − clearance(d)))` and the arrival
  condition. Arrival heights for any GR follow instantly, without searching.
- **Labels.** Each route is described by the side of the straight line it lies on (average
  signed offset) and how far: "South-east side, 1.0 km off", or "Along the straight line".

### Display

- AGL bands red → green (ColorBrewer RdYlGn); a color-blind scheme (viridis, monotonic
  lightness) is a per-browser preference. The profile's glide path uses the same colors.
- The launch zone (cells reached within the launch zone distance) is left uncolored.

## 2. Assumptions and defaults

Defaults are always visible in an **Assumptions panel**, each with an explanation, and every
one of them can be changed. All settings are encoded in the URL so plans can be shared.

| Setting | Default | Rationale |
|---|---|---|
| Start height | 0 m AGL (input in AGL or AMSL) | Ground launch. Higher values model climbing in a thermal first. |
| Glide ratio | 7 | Realistic still-air value for a light wing at trim, below the brochure value. |
| Terrain clearance | 100 m | Margin for sink, turbulence near slopes, and elevation data errors. |
| Launch zone | 500 m | Clearance ramps from 0 at the start to full over this distance; otherwise nothing is reachable from a ground launch. |
| Arrival height over landing | 100 m | Height for the landing pattern (milestone 2). |
| Wind | none (still air) | Shown as a warning, not hidden. |
| Elevation resolution | depends on source (~10–30 m) | Shown so the pilot knows the data limits. |

**Start point.** With a start height above 0 AGL, the point is a "start" (e.g. the top of a
thermal) rather than strictly a takeoff. The math is identical.

**Search bounds.** The grid extends to the maximum possible glide distance:
`(h_start − lowest terrain nearby) × GR`, capped to keep memory and time bounded. Resolution
is chosen so the cell count stays within a budget.

## 3. Elevation data

### Development / worldwide

Public **AWS Terrain Tiles** (terrarium encoding, Web Mercator, global, max zoom 15):
`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`.

### Switzerland (milestone 4)

Built by `tools/terrain/build_swissalti3d.py` (see its README) into
`public/terrain/swissalti3d.pmtiles`; the app falls back to AWS tiles where the archive has
none, and caps zooms at the archive's maximum (13, ~13 m pixels) so sources never mix in an
area. No GDAL: LV95 → WGS84 uses swisstopo's approximate formulas (~1 m). The 2 m tiles are
streamed and discarded (the whole country is ~50 GB of downloads, ~1 h).

Start and landing elevations come from swisstopo's height service when online (exact),
since the tiles keep the maximum per pixel; offline, the tiles are interpolated.

**swissALTI3D** (swisstopo, 2 m, open data) preprocessed once by a script in the repo:

1. **Resample** 2 m → pyramid of levels (finest ~6–13 m). 2 m would be hundreds of millions
   of cells for a typical search area; a few meters of elevation error is irrelevant next to
   a 100 m clearance.
2. **Downsample with the maximum**, not the mean: a cell is never lower than any real point
   inside it, so ridges are never underestimated (safe side). Passes look slightly higher and
   narrower — slightly pessimistic.
   *Caveat:* max is optimistic for the start altitude, so start/landing elevations come from
   true elevation (mean layer at the finest level, or the swisstopo height API online).
3. **Reproject to Web Mercator tiles**: same grid as the global data (going worldwide =
   another file) and MapLibre can render hillshade/3D terrain from the same tiles.
4. **Encode as terrarium PNG**: `elevation = R·256 + G + B/256 − 32768`. Lossless, decoded
   natively by browsers, read natively by MapLibre.
5. **Package as one PMTiles file**: served from any static host via HTTP range requests, and
   one file (or a regional slice) to store for offline use.

The app only knows "a terrarium tile source"; Swiss or global data are interchangeable.

## 4. Architecture

Static site, no backend — all computation in the browser (required for offline use).

| Layer | Choice |
|---|---|
| Language | TypeScript |
| Build | Vite |
| UI | Svelte 5 |
| Map | MapLibre GL JS |
| Compute | Web Worker; pure TS module, portable to Rust/WASM if profiling demands |
| Tests | Vitest (synthetic terrains: cone, wall, ridge with a gap) |

```
src/
  lib/glide/       pure algorithm (no DOM): Dijkstra search, AGL, route tracing
  lib/terrain/     geo math, terrarium decoding, grid sampling, tile loading
  lib/compute/     reach pipeline (terrain → search), Web Worker and its client
  lib/render/      AGL color bands and overlay image
  lib/map/         basemap definitions
  lib/settings.svelte.ts   defaults, explanations, URL encoding
  components/      Svelte UI (map, assumptions panel, legend)
```

### Coordinates

Web Mercator stretches distances by ~1.46× at Swiss latitudes, which would distort every
glide ratio. The worker therefore computes on a **local metric grid** (equirectangular,
centered on the start) and the map is used only for display. The result is drawn back as an
image overlay with lat/lon corners; over the search extent the residual distortion is
negligible for display.

## 5. Offline (milestone 5)

- **App shell:** a hand-written service worker (`sw/service-worker.js`) precaches the built
  files; a small Vite plugin fills in the file list and a version per build. Navigations
  fall back to the cached shell. Installable as a PWA (manifest, icons). Production only.
- **Areas:** "Download this area" stores what the visible map area needs, one Cache Storage
  cache per area (`hf-area-<id>`), with tile count and size estimate first, progress,
  cancel, and a list of saved areas (show/delete); storage persistence is requested.
  - swisstopo map and slope-class tiles, zooms 8 to the chosen detail (13–16), under their
    real URLs, served by the service worker. OpenTopoMap is excluded: its policy forbids
    bulk downloads.
  - Elevation tiles: zooms 10–13 over the area (+5 km), 6–9 for 60 km around it (the reach
    search looks for the lowest terrain far out). Stored under synthetic URLs
    (`/offline-elevation/z/x/y.png`) that the computation worker reads first, directly from
    Cache Storage: elevation works offline without the service worker.
- All elevation sources are capped at zoom 13, so online and offline results agree.
- Offline, start and landing heights come from the tiles (slightly high, as they keep the
  maximum) unless the browser still caches the height service's answer (1 day).

## 6. Milestones

1. **Reachable area** — map, click to set start, start height (AGL/AMSL), AGL overlay for a
   glide ratio, Assumptions panel, legend.
2. **Required glide ratio** — landing click, binary search for min GR, best route on map,
   altitude profile chart (terrain vs. glide line).
3. **Alternative routes** — 2–3 distinct routes with their GR, route list.
4. **Swiss elevation data** — swissALTI3D → PMTiles pipeline replacing AWS tiles.
5. **Offline** — PWA; download a region (elevation + base map), everything works offline.

### Later

Wind (direction-dependent cost), multi-leg plans (thermal at A to X m → glide to B → climb →
final glide), airspace (OpenAIP), glide polar instead of fixed GR, lee-side warnings, GPX
export, takeoff catalogue.
