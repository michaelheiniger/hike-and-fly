# 2. Reachability as a constrained shortest-path search

- **Status:** Accepted
- **Date:** 2026-10-26

## Context

We need, for a start point and a glide ratio, the highest altitude the glider can have
over every point, flying around terrain rather than through it. With a fixed glide ratio
in still air, height lost is proportional to distance flown (`Δh = d / GR`), and being
higher over a point is never worse.

## Decision

Compute the **shortest flyable distance** `d(x)` from the start to every cell of a terrain
grid with **Dijkstra's algorithm**, where a move is allowed only if the glider stays above
the terrain (to enter a cell) and above terrain + clearance (to continue from it). Then:

- `altitude(x) = h_start − d(x) / GR`, `AGL(x) = altitude(x) − terrain(x)`;
- reachable area = cells with finite `d`;
- route to any cell = predecessor chain.

The flight model is a **fixed glide ratio in still air**: no wind, no polar, no lift.

## Consequences

- One search yields the overlay, the reachable area and the best route to every point.
- Correctness rests on a simple, checkable argument (shortest = highest) and on
  monotonicity in the glide ratio, which the required-ratio search exploits
  ([ADR-0008](0008-required-ratio-by-bracketing-and-bisection.md)).
- Wind cannot be added as a simple scalar: a direction-dependent cost would make the
  problem anisotropic (still solvable with Dijkstra, with a per-direction step cost).
- Grid paths overestimate distances; see [ADR-0003](0003-sixteen-neighbour-grid-search.md).

## Alternatives considered

- **Line-of-sight / radial sweeps** from the start: fast, but cannot go around obstacles.
- **Fast marching (eikonal solver)**: smoother distances, but obstacle constraints that
  depend on the arrival altitude are harder to express and to test.
- **Visibility graph over terrain contours**: exact any-angle paths, but the obstacle set
  depends on altitude, so it would have to be rebuilt per glide ratio.
