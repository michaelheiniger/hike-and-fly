# 3. 16-neighbour moves with clearance checks on crossed cells

- **Status:** Accepted
- **Date:** 2026-10-26

## Context

With 8-neighbour moves, a straight line in a direction between an axis and a diagonal is
approximated by a zigzag up to 8.2 % longer (`1 / cos 22.5°`). A distance error inflates
the glide ratio directly: 8 % turns a 5.0 into a 5.4. Diagonal moves also touch the corner
between two cells and could slip through a zero-width gap between two blocked cells.

## Decision

Use **16 moves**: 4 orthogonal, 4 diagonal and 8 knight moves `(±2, ±1)`, `(±1, ±2)`. This bounds
the overestimate of a straight distance to **2.7 %**. For every non-orthogonal move, the
**two cells it crosses** must also be clear by the clearance, checked at the (lower)
arrival altitude. Step lengths use the metric cell width of the row.

Grid routes are then straightened ([ADR-0009](0009-straightened-routes-with-exact-ratio.md)),
which removes most of the remaining overestimate for displayed routes.

## Consequences

- Twice the edges per cell compared to 8 moves, and up to two crossed cells to check per
  edge: each search does more work.
- The remaining error (≤ 2.7 % in open air, ≤ ~5 % around obstacle corners) is on the safe
  side: distances are overestimated, so ratios are too.
- The first guess of the required-ratio search adds 3 % for this error
  (`GRID_SLACK` in `required.ts`).

## Alternatives considered

- **8 moves**: simpler and faster, 8 % error.
- **32 moves**: ~1 % error, but more crossed cells to check and twice the work again.
- **Theta\* / any-angle search**: exact straight segments, but line-of-sight checks per
  relaxation are costly on millions of cells; could be revisited.
