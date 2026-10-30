"""The methodology diagrams (docs/diagrams/*.drawio.svg), as code.

Usage: python3 tools/diagrams/diagrams.py [OUT_DIR]   (default: docs/diagrams)
"""

import math
import sys
from pathlib import Path

from drawio import Diagram

OUT = sys.argv[1] if len(sys.argv) > 1 else str(Path(__file__).resolve().parents[2] / 'docs' / 'diagrams')


def architecture():
    d = Diagram('architecture', 'Architecture', 1010, 600)
    d.box(20, 20, 670, 560, '**Browser** (static site, no backend)', color='container', align='left', valign='top', dashed=True)
    d.box(40, 60, 290, 340, 'Main thread', color='white', align='left', valign='top', fs=12)
    d.box(60, 95, 250, 60, '**MapLibre GL JS map**\nbasemap · AGL overlay · routes', color='yellow')
    d.box(60, 170, 250, 60, '**Svelte 5 panels**\nassumptions · profile · routes', color='yellow')
    d.box(60, 245, 250, 60, '**Settings ↔ URL**\nevery setting in the link', color='yellow')
    client = d.box(60, 325, 250, 60, '**PlannerClient**\none job at a time, latest per kind', color='yellow')
    worker = d.box(370, 60, 290, 340, 'Web Worker (planner.worker.ts)', color='white', align='left', valign='top')
    reach = d.box(385, 95, 125, 75, '**computeReach**\nreach overlay', color='blue', fs=11)
    route = d.box(520, 95, 125, 75, '**RoutePlanner**\nrequired GR,\nroutes, cache', color='blue', fs=11)
    glide = d.box(385, 195, 260, 60, '**lib/glide**\nDijkstra · required GR ·\nstraightening · corridors', color='blue', fs=11)
    terrain = d.box(385, 265, 260, 50, '**compute/terrain**\nsearch radius · grid sampling', color='blue', fs=11)
    loader = d.box(385, 328, 260, 62, '**TileLoader**\nLRU 600 tiles · 8 parallel fetches\nsaved area → archive → AWS', color='blue', fs=11)
    d.edge(reach, glide)
    d.edge(route, glide)
    d.edge(terrain, loader)
    d.edge(client, worker, 'postMessage', pts=[(350, 355)], start=True)
    sw = d.box(40, 420, 290, 60, '**Service worker**\napp shell · map tiles of saved areas', color='purple')
    cache = d.box(40, 500, 630, 62, '**Cache Storage**\none cache per saved area (hf-area-<id>): map tiles under their URLs,\nelevation tiles under /offline-elevation/z/x/y.png', color='purple')
    d.edge(sw, cache)
    d.edge(loader, cache, 'read first', exit=(0.5, 1), entry=(0.75, 0))

    height = d.box(740, 40, 240, 55, '**swisstopo height service**\nexact start / landing ground', color='green')
    pages = d.box(740, 120, 240, 70, '**Static host (GitHub Pages)**\napp files · swissalti3d.pmtiles\n(HTTP range requests)', color='green')
    aws = d.box(740, 215, 240, 55, '**AWS Terrain Tiles**\nterrarium, global, zoom ≤ 13', color='green')
    d.box(740, 295, 240, 55, '**Web3Forms**\nissue reports (report dialog)', color='green')
    basemap = d.box(740, 420, 240, 55, '**Basemap tiles**\nswisstopo · OpenTopoMap', color='green')
    build = d.box(740, 505, 240, 75, '**tools/terrain**\nrun once, offline: swissALTI3D\n2 m → PMTiles, release asset', color='orange')
    d.edge(worker, height, exit=(1, (67 - 60) / 340), entry=(0, 0.5))
    d.edge(loader, pages, exit=(1, 0.3), pts=[(705, 346.5), (705, 155)], entry=(0, 0.5))
    d.edge(loader, aws, exit=(1, 0.7), pts=[(722, 368.5), (722, 242.5)], entry=(0, 0.5))
    d.edge(sw, basemap, exit=(1, 0.5), entry=(0, 0.5))
    d.edge(build, pages, exit=(1, 0.5), pts=[(998, 542.5), (998, 155)], entry=(1, 0.5))
    return d


def pipeline():
    d = Diagram('terrain-pipeline', 'swissALTI3D pipeline', 950, 470)
    xs = [20, 250, 480, 710]
    w, h = 215, 90
    row1 = [
        ('**swisstopo STAC API**\nswissALTI3D items per chunk\n(chunk = one zoom-9 tile)', 'green'),
        ('**Download 2 m GeoTIFFs**\nlatest year per tile, 8 parallel;\ndiscarded after use (~50 GB)', 'blue'),
        ('**LV95 → WGS84**\nswisstopo approx. formulas\n(~1 m, no GDAL)', 'blue'),
        ('**Fold into zoom-13 pixels**\nWeb Mercator, ~13 m in CH;\nrunning MAXIMUM per pixel', 'orange'),
    ]
    row2 = [
        ('**Max-pool 2 × 2**\nzooms 12 … 9 in the chunk,\nzooms 8 … 6 across chunks', 'orange'),
        ('**Fill gaps from AWS**\nterrarium outside swissALTI3D,\nclamped at −450 m', 'blue'),
        ('**Encode terrarium PNG**\nz = R·256 + G + B/256 − 32768\n(1/256 m steps, lossless)', 'blue'),
        ('**Write PMTiles v3**\nHilbert order, gzip directories,\nleaf directories if needed', 'blue'),
    ]
    a = [d.box(x, 40, w, h, t, color=c) for x, (t, c) in zip(xs, row1)]
    b = [d.box(x, 190, w, h, t, color=c) for x, (t, c) in zip(reversed(xs), row2)]
    c = [
        d.box(20, 340, w, h, '**GitHub release asset**\nterrain-YYYY-MM-DD\n(too large for git)', color='green'),
        d.box(250, 340, w, h, '**Pages workflow**\ndownloads it, runs the\nreal-scenario tests, deploys', color='green'),
        d.box(480, 340, w, h, '**App: TileLoader**\nreads tiles by range request;\nAWS where it has none', color='yellow'),
    ]
    d.box(710, 330, 215, 110, 'Memory per chunk: one 4096² float32\ngrid (16 × 16 tiles of 256²).\nDisk: encoded tiles + the output\n(a few hundred MB).\nFull country: ~1 h.', color='grey', align='left', fs=11)
    for seq in (a, b, c):
        for p, q in zip(seq, seq[1:]):
            d.edge(p, q)
    d.edge(a[-1], b[0])
    d.edge(b[-1], c[0])
    d.text(20, 8, 900, 24, 'tools/terrain/build_swissalti3d.py — run once, offline (see tools/terrain/README.md)', fs=12, color='#555555')
    return d


def downsampling():
    d = Diagram('downsampling', 'Downsampling', 1000, 470)
    d.box(20, 20, 460, 430, '**A · 2 m terrain → ~13 m pixel: keep the maximum**', color='white', valign='top')
    base = 410
    x0, px, npx = 50, 65, 6

    def h(x):
        return 60 + 170 * math.exp(-((x - 230) / 70) ** 2) + 10 * math.sin(x / 7.0)

    xs = [x0 + i * 6.5 for i in range(int(px * npx / 6.5) + 1)]
    for i in range(npx):
        a, b = x0 + i * px, x0 + (i + 1) * px
        vals = [h(x) for x in xs if a <= x <= b]
        top, mean = max(vals), sum(vals) / len(vals)
        d.box(a, base - top, px, top, color='orange', rounded=False, fill_opacity=35)
        d.line([(a + 3, base - mean), (b - 3, base - mean)], color='#1f5fbf', width=2, dashed=True)
    d.line([(x, base - h(x)) for x in xs], color='#222222', width=2)
    d.line([(35, base), (450, base)], color='#888888', width=1)
    d.line([(40, 60), (70, 60)], color='#222222', width=2)
    d.text(75, 51, 380, 20, 'true terrain (2 m samples)', fs=12)
    d.box(40, 74, 30, 14, color='orange', rounded=False, fill_opacity=35)
    d.text(75, 71, 380, 20, '**max per pixel: used** (never below a real point)', fs=12)
    d.line([(40, 100), (70, 100)], color='#1f5fbf', width=2, dashed=True)
    d.text(75, 91, 380, 20, 'mean per pixel: not used (it lowers ridges)', fs=12)
    peak = max(h(x) for x in xs)
    d.text(320, 150, 155, 76, 'Ridges are never\nunderestimated; passes look\nslightly higher and narrower\n(pessimistic side).', fs=11)
    d.line([(318, 175), (262, base - peak + 2)], color='#666666', width=1, end=True)
    d.text(40, base + 8, 420, 20, '6 pixels of ~13 m (zoom 13) · 2 m data: ~40 points per pixel row (not to scale)', fs=10, color='#555555')

    d.box(500, 20, 480, 430, '**B · Search grid: max of the 2 × 2 pixels around each cell center**', color='white', valign='top')
    gx, gy, s = 540, 60, 56
    vals = [[1175, 1188, 1194, 1201, 1190], [1182, 1203, 1218, 1209, 1197], [1179, 1196, 1211, 1205, 1192], [1170, 1184, 1190, 1188, 1181]]
    for r in range(4):
        for c in range(5):
            hot = r in (1, 2) and c in (1, 2)
            d.box(gx + c * s, gy + r * s, s, s, f'{vals[r][c]}', color='orange' if hot else 'grey', rounded=False, fs=11)
    cx, cy = gx + 2 * s - 4, gy + 2 * s - 8
    d.box(cx - 30, cy - 30, 60, 60, color='none', stroke='#1f5fbf', rounded=False, dashed=True, stroke_width=2, fill='none')
    d.box(cx - 4, cy - 4, 8, 8, color='blue', shape='ellipse', fill='#1f5fbf', stroke='#1f5fbf')
    d.text(gx + 5 * s + 10, gy + 2, 140, 90, 'grey/orange: tile pixels\n(zoom 13, ~13 m)\nblue dashed: one\nsearch cell (≥ 10 m)', fs=11)
    d.text(gx + 5 * s + 10, gy + 100, 140, 70, 'cell = max of the\n4 orange pixels\n= **1218 m**', fs=11)
    d.text(515, 295, 455, 150,
           '• cell size = max(10 m, 2 · radius / √budget)\n'
           '• zoom = coarsest whose pixels ≤ cell size, at most 13\n'
           '• **launch zone** (within 500 m of the start): bilinear\n'
           '   (true) value, minus (tiles − exact ground) at the start\n'
           '• **start and landing cells**: exact ground\n'
           '   (swisstopo height service; offline: bilinear)\n'
           '• every source clamped at −450 m (lowest dry land)', fs=12)
    return d


def glide_model():
    d = Diagram('glide-model', 'Glide model', 960, 450)
    terrain = [(20, 150), (50, 115), (80, 103), (100, 100), (130, 104), (160, 118), (220, 165), (300, 228), (380, 252),
               (430, 222), (470, 200), (510, 228), (560, 288), (640, 328), (720, 342), (800, 349), (880, 352), (940, 352)]

    def ground(x):
        for (x0, y0), (x1, y1) in zip(terrain, terrain[1:]):
            if x0 <= x <= x1:
                return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
        return terrain[-1][1]

    lift = (122, ground(122))
    slope = (180 - lift[1]) / (470 - lift[0])
    glide_y = lambda x: lift[1] + slope * (x - lift[0])  # noqa: E731
    clear = 20
    lz_end = 250

    def ramp(x):
        return clear * min(1, (x - lift[0]) / (lz_end - lift[0])) ** 3 if x > lift[0] else 0

    cl = [(x, ground(x) - ramp(x)) for x in range(int(lift[0]), 941, 4)]
    d.line(terrain, color='#5b4636', width=2.5)
    d.line(cl, color='#b85450', width=1.5, dashed=True)
    d.line([(100, 100), lift], color='#2e8b57', width=5)
    d.line([lift, (880, glide_y(880))], color='#1f5fbf', width=2.5)

    d.box(95, 95, 10, 10, shape='ellipse', fill='#000000', stroke='#000000')
    d.text(20, 40, 220, 34, '**Start** (ground launch)\naltitude h_start', fs=11)
    d.line([(70, 72), (97, 96)], color='#666', width=1, end=True)
    d.text(40, 165, 130, 34, 'takeoff run 30 m\n(liftoff ≤ h_start)', fs=10, color='#2e8b57')
    d.line([(80, 165), (108, 104)], color='#2e8b57', width=1, end=True)
    d.line([(lift[0], 72), (lz_end, 72)], color='#666666', width=1, end=True, start=True)
    d.text(255, 52, 330, 40, '**launch zone 500 m**: clearance(d) = 50 m · (d / 500 m)³\n(1/8 of it at 250 m; full value beyond)', fs=11)
    d.line([(lz_end, 72), (lz_end, ground(lz_end))], color='#999999', width=1, dotted=True)

    d.box(464, 174, 12, 12, shape='ellipse', fill='none', stroke='#000000', stroke_width=2)
    d.text(500, 105, 300, 50, '**limiting point**: the glide touches terrain +\nclearance; it sets the required glide ratio', fs=11)
    d.line([(505, 140), (478, 176)], color='#666', width=1, end=True)
    d.text(300, 108, 240, 20, 'glide: altitude = h_start − d / GR', fs=11, color='#1f5fbf')
    d.text(560, 232, 200, 20, 'terrain + clearance (50 m)', fs=11, color='#b85450')
    d.text(280, 255, 120, 20, 'terrain', fs=11, color='#5b4636')

    ax = 700
    d.line([(ax, glide_y(ax)), (ax, ground(ax))], color='#333333', width=1, end=True, start=True)
    d.text(ax + 4, (glide_y(ax) + ground(ax)) / 2 - 10, 120, 20, 'AGL', fs=11)

    gy = ground(880)
    d.box(875, gy - 5, 10, 10, shape='ellipse', fill='#000000', stroke='#000000')
    d.line([(905, gy), (905, gy - 50)], color='#333333', width=1, end=True, start=True)
    d.line([(885, gy - 50), (925, gy - 50)], color='#333333', width=1)
    d.text(800, 370, 150, 50, '**Landing**\narrival height 100 m\n(arrives higher here)', fs=11, align='right')
    d.text(20, 380, 520, 60, 'Distance d is counted along the path, from the start. Being higher is never\nworse, so the shortest flyable path gives the highest altitude everywhere\n(Dijkstra). Not to scale.', fs=11, color='#555555')
    return d


def stencil():
    d = Diagram('neighbours', '16-neighbour moves', 780, 470)
    gx, gy, s = 40, 60, 70
    neighbours = {(dc, dr) for dc in (-1, 0, 1) for dr in (-1, 0, 1)} - {(0, 0)}
    knights = {(a * sc, b * sr) for sc in (-1, 1) for sr in (-1, 1) for a, b in ((2, 1), (1, 2))}
    via_k = {(1, 0), (1, -1)}
    via_d = {(-1, 0), (0, 1)}
    for r in range(5):
        for c in range(5):
            dc, dr = c - 2, r - 2
            if (dc, dr) == (0, 0):
                col, label = 'blue', 'from'
            elif (dc, dr) in via_k:
                col, label = 'orange', 'via'
            elif (dc, dr) in via_d:
                col, label = 'purple', 'via'
            elif (dc, dr) in neighbours:
                col, label = 'yellow', ''
            elif (dc, dr) in knights:
                col, label = 'green', ''
            else:
                col, label = 'white', ''
            d.box(gx + c * s, gy + r * s, s, s, label, color=col, rounded=False, fs=11)
    cx, cy = gx + 2.5 * s, gy + 2.5 * s
    for dc, dr in sorted(neighbours | knights):
        tx, ty = cx + dc * s, cy + dr * s
        k = 0.42 / math.hypot(dc, dr) * s
        ux, uy = dc / math.hypot(dc, dr), dr / math.hypot(dc, dr)
        special = (dc, dr) in ((2, -1), (-1, 1))
        color = '#d79b00' if (dc, dr) == (2, -1) else '#9673a6' if (dc, dr) == (-1, 1) else '#555555'
        d.line([(cx + ux * 22, cy + uy * 22), (tx - ux * 6, ty - uy * 6)], color=color, width=2.5 if special else 1, end=True)
    d.text(gx, 20, 360, 30, 'Moves from one cell (row 0 is north)', fs=12)
    d.text(420, 40, 350, 420,
           '**16 moves**: 4 orthogonal, 4 diagonal (yellow),\n8 knight moves (green).\n\n'
           '**Worst overestimate of a straight distance**\n8 moves: 8.2 % · 16 moves: 2.7 %\n'
           '(routes are straightened afterwards)\n\n'
           '**Cells crossed must be clear** ("via")\n'
           'orange: knight move (+2, −1);\npurple: diagonal (−1, +1).\n'
           'Their terrain + clearance must stay below\nthe altitude on arrival (conservative).\n\n'
           '**Entering a cell**: arrival altitude ≥ terrain.\n'
           '**Continuing from it**: altitude ≥ terrain\n+ clearance(d); otherwise final glide only.\n\n'
           'Step length uses the row\'s metric cell width\n(cells narrow towards the pole).', fs=12)
    return d


def reach_flow():
    d = Diagram('reach-flow', 'Reach computation', 820, 760)
    x, w = 190, 440
    n1 = d.box(x, 20, w, 50, '**Start point and start height**\n(AGL or AMSL)', color='yellow')
    n2 = d.box(x, 100, w, 66, '**Ground at the start**\nswisstopo height service (exact);\noffline: bilinear from the tiles', color='blue')
    n3 = d.box(x, 196, w, 86, '**Search radius**\nlowest terrain within min(60 km, max(h_start, 1000) · GR)\nr = min(60 km, (h_start − lowest) · GR · 1.05 + 500 m)\n(coarse tiles: 64 pixels across)', color='blue')
    n4 = d.box(x, 312, w, 112, '**Elevation grid**\nlocal metric grid, centered on the start;\ncell = max(10 m, 2r / √2 250 000) → ≤ 2.25 M cells\ntiles at the coarsest zoom with pixels ≤ cell (≤ 13)\nmax of 2 × 2 pixels; bilinear in the launch zone;\nstart cell: min(cell, h_start)', color='blue')
    n5 = d.box(x, 450, w, 90, '**Dijkstra (searchGlide)**\n16 moves; enter a cell only above its terrain;\ncontinue only above terrain + clearance(d);\nsources: start + takeoff-run liftoffs', color='orange')
    n6 = d.box(x, 568, w, 50, '**d(x)**\nshortest flyable distance to every cell (∞ where unreachable)', color='green')
    o1 = d.box(20, 666, 250, 76, '**AGL overlay**\nh_start − d / GR − terrain\nin colored bands', color='green')
    o2 = d.box(285, 666, 250, 76, '**Reachable area**\ncells with a finite d(x);\nlaunch zone left uncolored', color='green')
    o3 = d.box(550, 666, 250, 76, '**Warnings**\ntruncated (touches the border);\nonly the launch zone reachable', color='red')
    for p, q in ((n1, n2), (n2, n3), (n3, n4), (n4, n5), (n5, n6)):
        d.edge(p, q)
    for o in (o1, o2, o3):
        d.edge(n6, o)
    d.text(640, 330, 175, 70, 'src/lib/compute/reach.ts\nsrc/lib/compute/terrain.ts\nsrc/lib/glide/search.ts', fs=10, color='#555555')
    return d


def required_flow():
    d = Diagram('required-ratio', 'Required glide ratio', 1000, 900)
    W = 380
    a1 = d.box(20, 20, W, 86, '**Lower bound**\nh = h_start − h_landing − arrival height\nbound = path length / h (no route is shorter)\n(alternatives: ≥ the previous route\'s ratio)', color='yellow')
    a2 = d.box(20, 136, W, 70, '**First guess**\nk = ceil(max(bound, straight-line GR) · 1.03 / 0.05)\n(grid routes run up to ~3 % long)', color='blue')
    a3 = d.box(20, 236, W, 70, '**Search with GR = k · 0.05**\nDijkstra leg by leg through the waypoints,\nstopping once the landing is settled', color='orange')
    d1 = d.box(80, 336, 260, 110, 'Landing reached\nwith the arrival\nheight?', color='yellow', shape='rhombus')
    a4 = d.box(20, 476, W, 50, 'best = k', color='green')
    d2 = d.box(80, 556, 260, 100, 'best − fail > 1?', color='yellow', shape='rhombus')
    a5 = d.box(20, 681, W, 70, '**Bisection**\nsearch at mid = floor((fail + best) / 2):\nreached → best = mid, else fail = mid', color='orange')
    a6 = d.box(20, 790, W, 60, '**Required GR = best · 0.05**\n(rounded up to the 0.05 grid: conservative)', color='green')
    for p, q in ((a1, a2), (a2, a3), (a3, d1)):
        d.edge(p, q)
    d.edge(d1, a4, 'yes')
    d.edge(a4, d2)
    d.edge(d2, a5, 'yes')
    d.edge(a5, d2, exit=(0, 0.5), pts=[(8, 716), (8, 606)], entry=(0, 0.5))
    d.edge(d2, a6, 'no', exit=(1, 0.5), pts=[(450, 606), (450, 820)], entry=(1, 0.5))

    b4 = d.box(560, 236, W, 70, '**Grow the guess**\nk = max(k + 1, ceil(1.25 · k)), at most GR 25', color='blue')
    b1 = d.box(560, 356, W, 70, 'fail = k; misses + 1\n(fail at GR 25 → unreachable)', color='red')
    d3 = d.box(630, 456, 240, 100, 'second miss?', color='yellow', shape='rhombus')
    b2 = d.box(560, 581, W, 60, '**Try GR 25**\n(beyond any paraglider)', color='orange')
    d4 = d.box(670, 666, 160, 90, 'reaches?', color='yellow', shape='rhombus')
    b3 = d.box(560, 800, 170, 50, '**Unreachable**', color='red')
    d.edge(d1, b1, 'no', exit=(1, 0.5), entry=(0, 0.5))
    d.edge(b1, d3)
    d.edge(d3, b2, 'yes')
    d.edge(b2, d4)
    d.edge(d4, b3, 'no', exit=(0, 0.5), pts=[(645, 711)], entry=(0.5, 0))
    d.edge(d3, b4, 'no', exit=(1, 0.5), pts=[(960, 506), (960, 253.5)], entry=(1, 0.25))
    d.edge(d4, b4, 'yes', exit=(1, 0.5), pts=[(978, 711), (978, 288.5)], entry=(1, 0.75))
    d.edge(b4, a3, entry=(1, 0.5))
    d.text(745, 785, 250, 110, 'Reachability is monotonic in GR:\nreached at g ⇒ reached at any g′ > g.\nThe answer does not depend on the\nguesses; good guesses only save\nsearches (~6 instead of ~11).', fs=11, color='#555555')
    return d


def route_flow():
    d = Diagram('route-pipeline', 'Route planning', 1000, 840)
    d.box(20, 20, 470, 640, '**Pass 1: best route** (shown first)', color='container', align='left', valign='top', dashed=True)
    d.box(510, 20, 470, 460, '**Pass 2: alternatives** (in the background)', color='container', align='left', valign='top', dashed=True)
    W = 430
    p1 = d.box(40, 60, W, 100, '**Prepare the plan**\ngrid around the box of start, waypoints and landing:\nradius = min(60 km, span + max(3 km, span)), ≤ 1 M cells\nexact start and landing ground written into their cells', color='blue')
    p2 = d.box(40, 190, W, 70, '**Straight line over the terrain**\nclosed-form GR and its limiting point\n(shown to the pilot; also the first guess)', color='blue')
    p3 = d.box(40, 290, W, 70, '**Required GR by bisection**\n→ best grid route (one cell list per leg)', color='orange')
    p4 = d.box(40, 390, W, 70, '**Straighten each leg**\nstring pulling against ~2 samples per cell', color='blue')
    p5 = d.box(40, 490, W, 80, '**Exact required GR of the route**\nmax over samples of flown / (h − terrain − clearance),\nand the arrival condition', color='green')
    for p, q in ((p1, p2), (p2, p3), (p3, p4), (p4, p5)):
        d.edge(p, q)
    q1 = d.box(530, 60, W, 90, '**Corridor of the last route**\nband ± 10 % of the path length (300 m – 1.5 km),\nopen within 1.5 × band of start, waypoints, landing', color='blue')
    q2 = d.box(530, 180, W, 60, '**Block all corridors so far**\n(their cells get an elevation of 10⁶ m)', color='red')
    q3 = d.box(530, 270, W, 70, '**Required GR on the blocked grid**\nhint: at least the last route\'s search ratio', color='orange')
    q4 = d.box(530, 370, W, 70, '**Straighten + exact GR**\nup to 2 alternatives (3 routes in all)', color='green')
    for p, q in ((q1, q2), (q2, q3), (q3, q4)):
        d.edge(p, q)
    d.edge(q4, q1, 'next', exit=(1, 0.5), pts=[(972, 405), (972, 105)], entry=(1, 0.5))
    d.edge(p5, q1, exit=(1, 0.25), pts=[(500, 510), (500, 105)], entry=(0, 0.5))
    r2 = d.box(510, 520, 470, 90, '**Route options**\nsorted by required GR; labelled by side and offset\n("South-east side, 1.0 km off")', color='yellow')
    d.edge(p5, r2, exit=(1, 0.75), entry=(0, 1 / 3))
    d.edge(q4, r2)
    r1 = d.box(20, 690, 470, 100, '**Pilot\'s own route**\neach GR change: one search for the shortest route at the\npilot\'s GR; it joins the list unless more than half of it\nlies inside a corridor already found. Shown when it reaches\nthe landing; else the required route, dashed.', color='yellow')
    d.edge(r1, r2, exit=(1, 0.5), pts=[(745, 740)], entry=(0.5, 1))
    d.text(520, 765, 460, 60, 'Terrain and the required-GR routes are cached per start, landing,\nwaypoints and assumptions: moving the GR slider re-runs only\nthe pilot\'s route.  src/lib/compute/route.ts', fs=11, color='#555555')
    return d


def corridors():
    d = Diagram('corridors', 'Alternative routes', 900, 480)
    S, L = (100, 380), (800, 120)
    d.box(340, 180, 220, 140, '**summit**', color='grey', shape='ellipse', valign='top')
    r1 = [S, (430, 360), (600, 280), L]
    r2 = [S, (300, 200), (520, 140), L]

    def along(pts, dist):
        for a, b in zip(pts, pts[1:]):
            l = math.dist(a, b)
            if dist <= l:
                t = dist / l
                return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
            dist -= l
        return pts[-1]

    total = sum(math.dist(a, b) for a, b in zip(r1, r1[1:]))
    keep = 80
    band = [along(r1, keep)] + [p for p in r1[1:-1]] + [along(r1, total - keep)]
    d.line(band, color='#d79b00', width=50, opacity=25)
    d.line([S, L], color='#888888', width=1.5, dashed=True, text='straight line (direct)')
    d.line(r1, color='#1f5fbf', width=3, end=True)
    d.line(r2, color='#9673a6', width=3, end=True)
    for p in (S, L):
        d.box(p[0] - keep, p[1] - keep, 2 * keep, 2 * keep, color='none', fill='none', stroke='#d79b00', shape='ellipse', dashed=True)
        d.box(p[0] - 6, p[1] - 6, 12, 12, shape='ellipse', fill='#000000', stroke='#000000')
    d.text(30, 395, 120, 20, '**Start**', fs=12)
    d.text(815, 95, 80, 20, '**Landing**', fs=12)
    d.text(560, 330, 330, 64, '**1 · best route**: "South-east side, 0.9 km off"\norange band: its corridor, ± 10 % of the length\n(300 m – 1.5 km), blocked for the next search', fs=11, color='#1f5fbf')
    d.text(130, 105, 330, 50, '**2 · alternative** (searched with the corridor\nblocked): "North-west side, 1.1 km off"', fs=11, color='#9673a6')
    d.text(170, 420, 360, 50, 'dashed circles: kept open (1.5 × band) near start,\nlanding and waypoints, which every route must reach', fs=10, color='#d79b00')
    d.text(560, 410, 330, 64, 'Side = sign of the average signed offset of\nthe route from the straight line; "along the\nstraight line" when below max(150 m, 3 %).', fs=10, color='#555555')
    return d



for make in (architecture, pipeline, downsampling, glide_model, stencil, reach_flow, required_flow, route_flow, corridors):
    print(make().save(OUT))
