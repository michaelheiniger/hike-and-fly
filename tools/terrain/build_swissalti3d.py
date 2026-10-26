#!/usr/bin/env python3
"""Build terrarium elevation tiles from swissALTI3D, packaged as one PMTiles file.

swissALTI3D (swisstopo, 2 m, LV95) is streamed tile by tile from the STAC API and
folded into Web Mercator pixels with a running maximum: a pixel is never lower
than any real point inside it, so ridges are never underestimated. Lower zooms
take the maximum of their four children. Pixels outside swissALTI3D coverage are
filled from the global AWS terrarium tiles, so border tiles are seamless.

Raw downloads are discarded after use: the full country (~50 GB of 2 m tiles)
needs only the output and a work directory of encoded tiles.

Usage:
  build_swissalti3d.py OUT.pmtiles [--bbox W S E N] [--maxzoom 13] [--minzoom 6]
                                   [--work DIR] [--workers 8]

Requires Python 3 with numpy and Pillow. No GDAL.
"""

from __future__ import annotations

import argparse
import gzip
import io
import json
import math
import os
import shutil
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

TILE = 256
STAC_ITEMS = 'https://data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swissalti3d/items'
AWS_TERRARIUM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
# Switzerland and Liechtenstein, generously.
SWITZERLAND = (5.9, 45.8, 10.5, 47.85)
# Pixels without swissALTI3D data.
NODATA = -np.inf
# Mosaic chunks are tiles of this zoom: 16×16 tiles of 256² at zoom 13.
CHUNK_ZOOM = 9

USER_AGENT = 'hike-and-fly terrain builder'


# --- Coordinates ---------------------------------------------------------------


def lv95_to_wgs84(e: np.ndarray, n: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """swisstopo's approximate formulas (accuracy ~1 m). Returns (lon, lat) in degrees."""
    y = (e - 2_600_000) / 1_000_000
    x = (n - 1_200_000) / 1_000_000
    lon = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y**3
    lat = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.0140 * x**3
    return lon * 100 / 36, lat * 100 / 36


def world_pixel(lon: np.ndarray, lat: np.ndarray, z: int) -> tuple[np.ndarray, np.ndarray]:
    """Web Mercator world pixel coordinates at zoom z."""
    scale = TILE * 2**z
    s = np.sin(np.radians(lat))
    x = (lon + 180) / 360 * scale
    y = (0.5 - np.log((1 + s) / (1 - s)) / (4 * math.pi)) * scale
    return x, y


def tile_bounds(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    """(west, south, east, north) of a tile in degrees."""
    n = 2**z

    def lat(ty: float) -> float:
        return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * ty / n))))

    return x / n * 360 - 180, lat(y + 1), (x + 1) / n * 360 - 180, lat(y)


def tiles_in_bbox(z: int, bbox: tuple[float, float, float, float]) -> list[tuple[int, int]]:
    w, s, e, n = bbox
    x0, y0 = world_pixel(np.array(w), np.array(n), z)
    x1, y1 = world_pixel(np.array(e), np.array(s), z)
    return [
        (x, y)
        for y in range(int(y0) // TILE, int(y1) // TILE + 1)
        for x in range(int(x0) // TILE, int(x1) // TILE + 1)
    ]


# --- Terrarium -------------------------------------------------------------------


def encode_terrarium(elevation: np.ndarray) -> bytes:
    """elevation = R·256 + G + B/256 − 32768, as an RGB PNG."""
    v = np.clip(elevation.astype(np.float64) + 32768, 0, 65535.996)
    whole = np.floor(v)
    rgb = np.empty(elevation.shape + (3,), dtype=np.uint8)
    rgb[..., 0] = (whole // 256).astype(np.uint8)
    rgb[..., 1] = (whole % 256).astype(np.uint8)
    rgb[..., 2] = np.floor((v - whole) * 256).astype(np.uint8)
    out = io.BytesIO()
    Image.fromarray(rgb, 'RGB').save(out, 'PNG', compress_level=6)
    return out.getvalue()


def decode_terrarium(png: bytes) -> np.ndarray:
    rgb = np.asarray(Image.open(io.BytesIO(png)).convert('RGB'), dtype=np.float64)
    return (rgb[..., 0] * 256 + rgb[..., 1] + rgb[..., 2] / 256 - 32768).astype(np.float32)


# --- Downloads -------------------------------------------------------------------


def fetch(url: str, attempts: int = 4) -> bytes:
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
            with urllib.request.urlopen(request, timeout=60) as response:
                return response.read()
        except (urllib.error.URLError, TimeoutError, ConnectionError) as err:
            if attempt == attempts - 1:
                raise RuntimeError(f'{url}: {err}') from err
            time.sleep(2**attempt)
    raise AssertionError('unreachable')


def stac_tiles(bbox: tuple[float, float, float, float]) -> list[str]:
    """URLs of the latest 2 m GeoTIFF of every swissALTI3D tile intersecting bbox."""
    latest: dict[str, tuple[str, str]] = {}  # tile name -> (year, url)
    url: str | None = f'{STAC_ITEMS}?bbox={",".join(f"{v:.6f}" for v in bbox)}&limit=100'
    while url:
        page = json.loads(fetch(url))
        for item in page['features']:
            # Ids look like swissalti3d_2019_2646-1166: several years may exist.
            _, year, name = item['id'].split('_')
            for asset in item['assets'].values():
                if asset['href'].endswith('_2_2056_5728.tif') and (name not in latest or year > latest[name][0]):
                    latest[name] = (year, asset['href'])
        url = next((link['href'] for link in page.get('links', []) if link.get('rel') == 'next'), None)
    return [href for _, href in latest.values()]


def read_alti_tile(data: bytes) -> tuple[np.ndarray, float, float, float]:
    """Elevations and LV95 (east, north) of the top-left corner and pixel size."""
    image = Image.open(io.BytesIO(data))
    pixel = image.tag_v2[33550][0]
    _, _, _, east, north, _ = image.tag_v2[33922]
    return np.asarray(image, dtype=np.float32), east, north, pixel


def aws_tile(z: int, x: int, y: int) -> np.ndarray:
    return decode_terrarium(fetch(AWS_TERRARIUM.format(z=z, x=x, y=y)))


# --- Mosaic ----------------------------------------------------------------------


class Chunk:
    """Max mosaic of one CHUNK_ZOOM tile at maxzoom resolution."""

    def __init__(self, cx: int, cy: int, maxzoom: int):
        self.maxzoom = maxzoom
        self.size = TILE * 2 ** (maxzoom - CHUNK_ZOOM)
        self.x0 = cx * self.size
        self.y0 = cy * self.size
        self.data = np.full(self.size * self.size, NODATA, dtype=np.float32)

    def add(self, elevation: np.ndarray, east: float, north: float, pixel: float) -> None:
        rows, cols = elevation.shape
        valid = elevation > -1000  # swissALTI3D marks no data with -9999
        jj, ii = np.nonzero(valid)
        lon, lat = lv95_to_wgs84(east + (ii + 0.5) * pixel, north - (jj + 0.5) * pixel)
        px, py = world_pixel(lon, lat, self.maxzoom)
        px = np.floor(px).astype(np.int64) - self.x0
        py = np.floor(py).astype(np.int64) - self.y0
        inside = (px >= 0) & (px < self.size) & (py >= 0) & (py < self.size)
        np.maximum.at(self.data, py[inside] * self.size + px[inside], elevation[valid][inside])

    def grid(self) -> np.ndarray:
        return self.data.reshape(self.size, self.size)


def max_pool(a: np.ndarray) -> np.ndarray:
    """Halves resolution keeping the maximum of each 2×2 block (NODATA is -inf)."""
    h, w = a.shape
    return a.reshape(h // 2, 2, w // 2, 2).max(axis=(1, 3))


def finish_tile(z: int, x: int, y: int, elevation: np.ndarray) -> bytes | None:
    """Encodes a tile, filling pixels without data from AWS; None if it has no data at all."""
    missing = ~np.isfinite(elevation)
    if missing.all():
        return None
    if missing.any():
        elevation = np.where(missing, aws_tile(z, x, y), elevation)
    return encode_terrarium(elevation)


# --- PMTiles v3 ------------------------------------------------------------------


def zxy_to_tile_id(z: int, x: int, y: int) -> int:
    """Hilbert-curve tile id, as in the PMTiles spec."""
    acc = ((1 << (2 * z)) - 1) // 3
    n = 1 << z
    d = 0
    s = n // 2
    while s > 0:
        rx = 1 if x & s else 0
        ry = 1 if y & s else 0
        d += s * s * ((3 * rx) ^ ry)
        if ry == 0:
            if rx == 1:
                x = s - 1 - x
                y = s - 1 - y
            x, y = y, x
        s //= 2
    return acc + d


def varint(v: int) -> bytes:
    out = bytearray()
    while v >= 0x80:
        out.append((v & 0x7F) | 0x80)
        v >>= 7
    out.append(v)
    return bytes(out)


def serialize_directory(entries: list[tuple[int, int, int, int]]) -> bytes:
    """Entries (tile_id, offset, length, run_length), sorted by tile id; gzip-compressed."""
    out = bytearray(varint(len(entries)))
    last = 0
    for tile_id, *_ in entries:
        out += varint(tile_id - last)
        last = tile_id
    for *_, run_length in entries:
        out += varint(run_length)
    for _, _, length, _ in entries:
        out += varint(length)
    for i, (_, offset, _, _) in enumerate(entries):
        previous = entries[i - 1] if i else None
        out += varint(0 if previous and offset == previous[1] + previous[2] else offset + 1)
    return gzip.compress(bytes(out), mtime=0)


def write_pmtiles(path: Path, tiles: dict[tuple[int, int, int], Path], bbox, metadata: dict) -> None:
    ordered = sorted(tiles.items(), key=lambda item: zxy_to_tile_id(*item[0]))
    entries = []
    offset = 0
    for (z, x, y), file in ordered:
        length = file.stat().st_size
        entries.append((zxy_to_tile_id(z, x, y), offset, length, 1))
        offset += length
    tile_data_length = offset

    # The header and root directory must fit in the first 16 KiB: use leaf directories if needed.
    root = serialize_directory(entries)
    leaves = b''
    leaf_size = 4096
    while 127 + len(root) > 16384:
        leaf_entries = []
        leaf_blobs = []
        position = 0
        for i in range(0, len(entries), leaf_size):
            blob = serialize_directory(entries[i : i + leaf_size])
            leaf_entries.append((entries[i][0], position, len(blob), 0))
            leaf_blobs.append(blob)
            position += len(blob)
        root = serialize_directory(leaf_entries)
        leaves = b''.join(leaf_blobs)
        leaf_size *= 2

    meta = gzip.compress(json.dumps(metadata).encode(), mtime=0)
    root_offset = 127
    meta_offset = root_offset + len(root)
    leaves_offset = meta_offset + len(meta)
    data_offset = leaves_offset + len(leaves)
    zooms = [z for z, _, _ in tiles]
    w, s, e, n = bbox
    e7 = lambda v: int(round(v * 1e7))  # noqa: E731
    header = (
        b'PMTiles'
        + bytes([3])
        + b''.join(
            v.to_bytes(8, 'little')
            for v in (
                root_offset, len(root), meta_offset, len(meta), leaves_offset, len(leaves),
                data_offset, tile_data_length, len(entries), len(entries), len(entries),
            )
        )
        + bytes([1, 2, 1, 2, min(zooms), max(zooms)])  # clustered, gzip dirs, raw tiles, png
        + b''.join(e7(v).to_bytes(4, 'little', signed=True) for v in (w, s, e, n))
        + bytes([min(max(zooms), 10)])
        + e7((w + e) / 2).to_bytes(4, 'little', signed=True)
        + e7((s + n) / 2).to_bytes(4, 'little', signed=True)
    )
    assert len(header) == 127
    with open(path, 'wb') as out:
        out.write(header)
        out.write(root)
        out.write(meta)
        out.write(leaves)
        for _, file in ordered:
            out.write(file.read_bytes())


# --- Build -----------------------------------------------------------------------


def build(out: Path, bbox, maxzoom: int, minzoom: int, work: Path, workers: int) -> None:
    tiles_dir = work / 'tiles'
    tiles_dir.mkdir(parents=True, exist_ok=True)
    written: dict[tuple[int, int, int], Path] = {}
    chunk_tops: dict[tuple[int, int], np.ndarray] = {}

    def save(z: int, x: int, y: int, elevation: np.ndarray) -> None:
        png = finish_tile(z, x, y, elevation)
        if png is not None:
            file = tiles_dir / f'{z}-{x}-{y}.png'
            file.write_bytes(png)
            written[(z, x, y)] = file

    chunks = tiles_in_bbox(CHUNK_ZOOM, bbox)
    started = time.time()
    downloaded = 0
    for k, (cx, cy) in enumerate(chunks, 1):
        w, s, e, n = tile_bounds(CHUNK_ZOOM, cx, cy)
        query = (max(w, bbox[0]), max(s, bbox[1]), min(e, bbox[2]), min(n, bbox[3]))
        urls = stac_tiles(query)
        print(f'chunk {k}/{len(chunks)} ({CHUNK_ZOOM}/{cx}/{cy}): {len(urls)} swissALTI3D tiles', flush=True)
        if not urls:
            continue
        chunk = Chunk(cx, cy, maxzoom)
        with ThreadPoolExecutor(workers) as pool:
            for i, data in enumerate(pool.map(fetch, urls), 1):
                chunk.add(*read_alti_tile(data))
                downloaded += len(data)
                if i % 200 == 0:
                    rate = downloaded / 1e6 / (time.time() - started)
                    print(f'  {i}/{len(urls)} tiles, {downloaded / 1e9:.1f} GB at {rate:.0f} MB/s', flush=True)

        # Zoom levels maxzoom … CHUNK_ZOOM from this chunk.
        grid = chunk.grid()
        for z in range(maxzoom, CHUNK_ZOOM - 1, -1):
            if z < maxzoom:
                grid = max_pool(grid)
            per_side = grid.shape[0] // TILE
            for ty in range(per_side):
                for tx in range(per_side):
                    tile = grid[ty * TILE : (ty + 1) * TILE, tx * TILE : (tx + 1) * TILE]
                    if z >= minzoom:
                        save(z, cx * per_side + tx, cy * per_side + ty, tile)
        chunk_tops[(cx, cy)] = grid

    # Zoom levels below CHUNK_ZOOM: max of children across chunks.
    level = chunk_tops
    for z in range(CHUNK_ZOOM - 1, minzoom - 1, -1):
        parents: dict[tuple[int, int], np.ndarray] = {}
        for x, y in {(x // 2, y // 2) for x, y in level}:
            full = np.full((2 * TILE, 2 * TILE), NODATA, dtype=np.float32)
            for dy in range(2):
                for dx in range(2):
                    child = level.get((2 * x + dx, 2 * y + dy))
                    if child is not None:
                        full[dy * TILE : (dy + 1) * TILE, dx * TILE : (dx + 1) * TILE] = child
            parents[(x, y)] = max_pool(full)
            save(z, x, y, parents[(x, y)])
        level = parents

    metadata = {
        'name': 'swissALTI3D terrarium',
        'description': 'swissALTI3D 2 m, maximum-downsampled; AWS Terrain Tiles outside coverage',
        'attribution': '© swisstopo (swissALTI3D); Mapzen, AWS (outside Switzerland)',
        'encoding': 'terrarium',
        'type': 'baselayer',
        'format': 'png',
    }
    write_pmtiles(out, written, bbox, metadata)
    elapsed = time.time() - started
    print(f'wrote {out}: {len(written)} tiles, {out.stat().st_size / 1e6:.0f} MB in {elapsed / 60:.1f} min')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('out', type=Path)
    parser.add_argument('--bbox', type=float, nargs=4, metavar=('W', 'S', 'E', 'N'), default=SWITZERLAND)
    parser.add_argument('--maxzoom', type=int, default=13)
    parser.add_argument('--minzoom', type=int, default=6)
    parser.add_argument('--work', type=Path, default=None, help='directory for encoded tiles (default: next to OUT)')
    parser.add_argument('--workers', type=int, default=8)
    args = parser.parse_args()
    if args.maxzoom < CHUNK_ZOOM:
        sys.exit(f'--maxzoom must be at least {CHUNK_ZOOM}')
    work = args.work or args.out.with_suffix('.work')
    build(args.out, tuple(args.bbox), args.maxzoom, args.minzoom, work, args.workers)
    shutil.rmtree(work)


if __name__ == '__main__':
    os.umask(0o022)
    main()
