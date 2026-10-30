# 9. Straighten grid routes and compute their exact required ratio

- **Status:** Accepted
- **Date:** 2026-10-26

## Context

Grid routes zigzag between cell centers and are up to a few percent too long. Showing them
as is looks wrong, and their length inflates the ratio. Each route also needs a required
ratio and arrival heights for any glide ratio the pilot picks, without searching again.

## Decision

1. **Straighten** each route (string pulling): from each vertex, jump to the farthest later
   cell reachable in a straight line that is flyable at the search ratio, checked against
   samples every half cell. The result is never longer than the grid route.
2. For the fixed line, compute the **exact required ratio in closed form** over its samples:
   `max(flown / (a₀ − terrain − clearance(flown)))` and the arrival condition
   `(length − d₀) / (a₀ − h_landing − arrival)`. The sample setting the maximum is the
   *limiting point*.
3. Within the launch zone, samples interpolate between cell centers (capped at their own
   cell); elsewhere they take the cell's maximum.

The straight line from start to landing is evaluated with the same closed form.

## Consequences

- Displayed routes are straight segments; corner paths stay within ~3 % of the shortest.
- Ratios, arrival heights and the limiting point for any glide ratio are instant.
- A route's exact ratio can be slightly below the grid search ratio (the straightened line
  is shorter); both are conservative against the 2 m reference (−0.1 % … +2.1 %).

## Alternatives considered

- **Show raw grid routes**: zigzags and inflated ratios.
- **Smooth with splines**: looks nice but may cut corners into terrain.
