#!/usr/bin/env python3
"""Verify a terrarium PMTiles archive with the official pmtiles reader.

Checks that the header matches the tiles, that every tile is a 256×256 PNG, and
reports tiles and elevation range per zoom. Exits non-zero on any problem.

Usage: uv run verify_pmtiles.py ARCHIVE.pmtiles
"""

import sys
from collections import defaultdict

from pmtiles.reader import MmapSource, Reader, all_tiles

from build_swissalti3d import decode_terrarium


def main(path: str) -> int:
    problems: list[str] = []
    per_zoom: dict[int, list[float]] = defaultdict(lambda: [0, float('inf'), float('-inf')])
    with open(path, 'r+b') as f:
        get_bytes = MmapSource(f)
        reader = Reader(get_bytes)
        header = reader.header()
        metadata = reader.metadata()
        for (z, x, y), data in all_tiles(get_bytes):
            try:
                elevation = decode_terrarium(data)
            except Exception as err:  # noqa: BLE001 - report any undecodable tile
                problems.append(f'{z}/{x}/{y}: not a PNG ({err})')
                continue
            if elevation.shape != (256, 256):
                problems.append(f'{z}/{x}/{y}: size {elevation.shape}')
            stats = per_zoom[z]
            stats[0] += 1
            stats[1] = min(stats[1], float(elevation.min()))
            stats[2] = max(stats[2], float(elevation.max()))

    total = sum(s[0] for s in per_zoom.values())
    print(f"{path}: {metadata.get('name')}, zooms {header['min_zoom']}–{header['max_zoom']}, {total} tiles")
    for z in sorted(per_zoom):
        count, low, high = per_zoom[z]
        print(f'  zoom {z:2}: {count:6} tiles, elevation {low:7.1f} … {high:7.1f} m')
    if total != header['addressed_tiles_count']:
        problems.append(f"header says {header['addressed_tiles_count']} tiles, found {total}")
    if per_zoom and (min(per_zoom) != header['min_zoom'] or max(per_zoom) != header['max_zoom']):
        problems.append('header zoom range does not match the tiles')
    # Switzerland lies between ~190 m (Lago Maggiore) and 4634 m (Dufourspitze).
    for z, (_, low, high) in per_zoom.items():
        if low < -500 or high > 4900:
            problems.append(f'zoom {z}: implausible elevations {low:.0f} … {high:.0f} m')
    for problem in problems:
        print('PROBLEM', problem)
    print('OK' if not problems else f'{len(problems)} problem(s)')
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1]))
