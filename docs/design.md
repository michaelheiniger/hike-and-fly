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

### Alternative routes (milestone 3)

Routes passing on different sides of a mountain: find the best route, penalize/block its
corridor, search again; keep distinct routes (2–3), each with its own required GR.

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
  lib/glide/       pure algorithm (no DOM): grid, search, AGL
  lib/terrain/     tile math, terrarium decoding, tile fetching, grid assembly
  lib/worker/      Web Worker entry: fetch terrain → search → overlay image
  lib/settings/    defaults, URL encoding
  components/      Svelte UI (map, assumptions panel, legend)
```

### Coordinates

Web Mercator stretches distances by ~1.46× at Swiss latitudes, which would distort every
glide ratio. The worker therefore computes on a **local metric grid** (equirectangular,
centered on the start) and the map is used only for display. The result is drawn back as an
image overlay with lat/lon corners; over the search extent the residual distortion is
negligible for display.

## 5. Milestones

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
