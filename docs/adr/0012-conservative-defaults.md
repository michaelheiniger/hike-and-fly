# 12. Conservative, visible and shareable defaults

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

The model ignores wind, sink and pilot technique. Pilots of different skill use it. Wrong
optimism can lead to an outlanding in bad terrain.

## Decision

Defaults are deliberately **pessimistic**, always **visible** with an explanation in the
Assumptions panel, and every setting is **editable** and **written into the URL**:

| Setting | Default | Why |
|---|---|---|
| Glide ratio | 5 | A light wing does ~7 at trim; the margin covers sink and headwind |
| Terrain clearance | 50 m | Sink and turbulence near slopes, data errors |
| Launch zone | 500 m | See ADR-0011 |
| Takeoff run | 30 m | See ADR-0011 |
| Arrival height | 100 m | Height for a landing pattern |
| Wind | none | Shown as a warning, not hidden |

All other approximations also err on the safe side (methodology §10).

## Consequences

- Results understate what a good pilot in good air can do; that is intended.
- Links reproduce a plan exactly, even after defaults change (every setting is written).

## Alternatives considered

- **Manufacturer-like glide ratio (7–8)**: matches calm-air performance, too optimistic as
  a planning default.
- **Hidden constants**: simpler UI, but pilots could not judge the result.
