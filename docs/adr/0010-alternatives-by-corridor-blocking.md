# 10. Alternative routes by blocking corridors

- **Status:** Accepted
- **Date:** 2026-10-26

## Context

Pilots want to see whether a route around the other side of a mountain is possible, and
at which ratio. The shortest-path search only returns one best route; slightly shifted
copies of it are not useful alternatives.

## Decision

After each route, **block its corridor**: cells within `w = clamp(10 % of the path length,
300 m, 1.5 km)`, but left open within `1.5 w` of the start, landing and waypoints. Then
search again for the required ratio on the blocked grid, with the previous ratio as a
lower bound. Up to **2 alternatives** (3 routes), computed in a second pass after the best
route is shown. The pilot's own shortest route joins the list when more than half of it
lies outside the corridors already found. Routes are labelled by the side of the straight
line they lie on (average signed offset) and how far.

## Consequences

- Alternatives are genuinely different (other side of a ridge, other valley).
- Each alternative costs one more required-ratio search; the second pass keeps the UI
  responsive.
- A band that is too wide could hide a valid nearby alternative; too narrow returns
  near-duplicates. The real scenarios pin the routes found, so a change to the rule shows
  in the tests.

## Alternatives considered

- **k-shortest paths (Yen)**: returns near-identical paths differing by a cell.
- **Penalty instead of blocking**: softer, but the result depends on a penalty weight
  with no physical meaning.
