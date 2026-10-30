# 13. Cell budgets: 2.25 M for reach, 1 M for routes

- **Status:** Accepted
- **Date:** 2026-10-29

## Context

Search grids trade accuracy for time on the pilot's device. The reach grid is searched
once per request; the route grid ~6–10 times (required ratio, alternatives). Larger
budgets were measured on 2026-10-29: 4 M cells for both (10 m cells up to 10 km).

## Decision

Keep **2.25 M cells for reach** and **1 M cells for routes**, with a 10 m minimum cell
size and a 60 km maximum radius.

## Consequences

- Measured with 4 M: accuracy against the 2 m reference improved by at most ~1 point
  (15 km thermal route +1.9 % → +1.0 %), while time to the best route rose 2–5 ×
  (9.7 km route 1.2 → 4.5 s, 15.4 km 1.5 → 7.4 s, desktop Node).
- The large gaps (Amisbühl straight line +12.8 %, Brunni +8.4 %) come from the 13 m
  elevation pixels (maximum per pixel on steep slopes), not from the cell size
  ([ADR-0005](0005-maximum-downsampling.md)).
- Don't propose larger default budgets again without new evidence. A desktop-only
  "Detail: High" setting remains an option.

## Alternatives considered

- **4 M cells**: rejected, see above.
- **Adaptive budgets by device speed**: possible later; results would then differ between
  devices, which complicates sharing and support.
