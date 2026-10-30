# 5. Downsample elevation with the maximum; exact elevation at start and landing

- **Status:** Accepted
- **Date:** 2026-10-26

## Context

swissALTI3D has 2 m pixels. The search needs ≥ 10 m cells (2 m would be hundreds of
millions of cells), so the data is reduced twice: 2 m → ~13 m tile pixels when building the
archive, then tile pixels → search cells in the browser. Any reduction loses detail; the
question is in which direction the error goes. Underestimating a ridge can route a glide
through it.

## Decision

Reduce with the **maximum** at every step: a 13 m pixel is the maximum of its 2 m points,
lower zooms the maximum of 2 × 2 children, and a search cell the maximum of the 2 × 2 pixels
around its center. A cell is never lower than any real point inside it.

The maximum is optimistic where the pilot is *on* the terrain, so there are three exceptions:

1. **Start and landing ground** come from the swisstopo height service (exact), or offline
   from bilinear interpolation of the tiles.
2. **Start and landing cells** are lowered to that exact ground (`min`).
3. **Cells within the launch zone** use bilinear (true-ground) values, lowered by the
   difference between the tiles and the exact ground at the start.

## Consequences

- Ridges are never underestimated; passes look slightly higher and narrower and steep
  slopes read meters high (pessimistic). This is the largest remaining error: up to
  +12.8 % on a straight line skimming a steep slope (Amisbühl), against the 2 m profile.
- Without the exceptions, a ground launch on a slope finds nothing reachable.
- Narrow gullies narrower than about two pixels disappear.

## Alternatives considered

- **Mean / bilinear everywhere**: closer to the truth on average, but cuts ridge tops:
  unsafe.
- **Keep 2 m data near routes only**: more accurate, much more data and complexity; the
  measured gain from finer *cells* alone was ≤ 1 point ([ADR-0013](0013-cell-budgets.md)).
- **Zoom 14 (~6.5 m) archive**: would halve the slope error, but the archive grows to
  ~2.5 GB, beyond GitHub's 2 GiB release asset limit.
