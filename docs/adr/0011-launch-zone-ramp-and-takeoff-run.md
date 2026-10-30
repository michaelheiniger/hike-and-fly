# 11. Cubic launch-zone clearance ramp and a takeoff run

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

A ground launch starts at AGL 0, so the full clearance cannot apply from the first
meter. A linear ramp still blocked launches above a flat summit top or a shoulder just below
the takeoff. Many takeoffs also start flatter than the glide path: the pilot runs down a
gentle slope before lifting off where it steepens. Without that, a gentle takeoff blocked
everything (Amisbühl: 6.5 instead of 5.0).

## Decision

- **Launch zone** (default 500 m): the clearance grows with the **cube** of the distance
  flown since the liftoff, `c(d) = C · min(1, d / L)³` (1/8 of it at mid-distance). The Assumptions panel lists its
  value at each quarter.
- **Takeoff run** (default 30 m, ground launches only): every cell within the run and not
  above the start is an extra source of the search, at its own ground, with a distance equal
  to the height run down × GR, so `altitude = h_start − d / GR` holds everywhere. The
  clearance ramp restarts at each liftoff. Routes show the run before the glide
  (decided 2026-10-29).

## Consequences

- Ground launches work on real takeoffs (all nine validation scenarios).
- Close to the takeoff, the model asks little clearance: the pilot is responsible for the
  first few hundred meters, as in reality.
- Both lengths are settings and appear in the URL.

## Alternatives considered

- **Constant small clearance near the start**: a step in the requirement; any choice is
  either too strict on flat tops or too loose further out.
- **Linear ramp** (used until 2026-10-28): it asked 1 m of extra height per 10 m right from
  the launch, so a flat summit or a shoulder just below blocked launches the pilot can fly.
- **Start the glide some meters above the ground**: hides the problem but overstates every
  altitude.
