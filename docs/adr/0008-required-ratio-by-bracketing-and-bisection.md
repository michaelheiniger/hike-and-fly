# 8. Required glide ratio by bracketing and bisection

- **Status:** Accepted
- **Date:** 2026-10-26

## Context

The route to a landing depends on the glide ratio: a worse glider must go around ridges a
better one flies over. There is no closed form for the smallest sufficient ratio over all
routes. Each candidate ratio costs a full search.

## Decision

Use **monotonicity**: reachable at `g` ⇒ reachable at every `g' > g`. Search ratios on a
grid of **0.05**:

1. Lower bound: path length / (h_start − h_landing − arrival height); no route is shorter.
2. First guess: max(bound, straight-line ratio over the terrain) × 1.03.
3. Grow guesses by 25 % until one reaches; after **two misses, try 25** (beyond any
   paraglider) to detect an unreachable landing after 3 searches (amended 2026-10-29).
4. Bisect between the last failure and the first success.

Searches stop as soon as the landing is settled. The result is rounded up.

## Consequences

- The answer is independent of the guesses; guesses only save searches (~6 instead of ~11
  on the real scenarios, −65 % search time).
- Precision 0.05 and rounding up keep the result conservative.
- Alternatives reuse the procedure with the previous route's ratio as a lower bound.

## Alternatives considered

- **Plain bisection over [1, 25]**: ~9 searches, many at expensive high ratios.
- **Parametric search** (track, per cell, the ratio at which it becomes reachable): one
  search in theory, but the clearance and launch-zone rules depend on distance and
  altitude together, making it complex and hard to verify.
