"""Unit tests for the swissALTI3D builder (no network). Run: python3 -m unittest discover tools/terrain"""

import gzip
import unittest

import numpy as np

from build_swissalti3d import decode_terrarium, encode_terrarium, lv95_to_wgs84, max_pool, serialize_directory, varint, zxy_to_tile_id


class TileIdTest(unittest.TestCase):
    def test_matches_pmtiles_reference(self):
        # Values from the pmtiles JavaScript library (zxyToTileId).
        cases = [
            ((0, 0, 0), 0), ((1, 0, 0), 1), ((1, 0, 1), 2), ((1, 1, 1), 3), ((1, 1, 0), 4),
            ((2, 1, 3), 11), ((13, 4279, 2892), 79377604), ((14, 8559, 5784), 317510420),
        ]
        for zxy, expected in cases:
            self.assertEqual(zxy_to_tile_id(*zxy), expected, zxy)


class CoordinatesTest(unittest.TestCase):
    def test_bern_reference_point(self):
        # LV95 origin (old observatory Bern): 46.95108° N, 7.43864° E.
        lon, lat = lv95_to_wgs84(np.array(2_600_000.0), np.array(1_200_000.0))
        self.assertAlmostEqual(float(lat), 46.95108, places=5)
        self.assertAlmostEqual(float(lon), 7.43864, places=5)


class TerrariumTest(unittest.TestCase):
    def test_round_trip(self):
        elevation = np.array([[0.0, 4478.25], [-12.5, 1234.5]], dtype=np.float32)
        np.testing.assert_allclose(decode_terrarium(encode_terrarium(elevation)), elevation, atol=1 / 256)


class MaxPoolTest(unittest.TestCase):
    def test_keeps_maximum_and_ignores_no_data(self):
        a = np.array([[1, 5, -np.inf, -np.inf], [2, 3, -np.inf, 7]], dtype=np.float32)
        np.testing.assert_array_equal(max_pool(a), [[5, 7]])


class DirectoryTest(unittest.TestCase):
    def test_contiguous_offsets_are_zero(self):
        raw = gzip.decompress(serialize_directory([(5, 0, 10, 1), (7, 10, 3, 1)]))
        expected = varint(2) + varint(5) + varint(2) + varint(1) * 2 + varint(10) + varint(3) + varint(1) + varint(0)
        self.assertEqual(raw, expected)


if __name__ == '__main__':
    unittest.main()
