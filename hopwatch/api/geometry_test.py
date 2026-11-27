from hopwatch.api.geometry import simplify


def test_points_on_a_straight_line_reduce_to_its_ends():
    line = [(46.0, 14.0 + i * 0.0001) for i in range(100)]

    assert simplify(line) == [line[0], line[-1]]


def test_a_corner_stays():
    corner = [(46.0, 14.0), (46.0, 14.001), (46.0, 14.002), (46.001, 14.002), (46.002, 14.002)]

    assert simplify(corner) == [(46.0, 14.0), (46.0, 14.002), (46.002, 14.002)]


def test_a_detour_shorter_than_the_tolerance_is_dropped():
    # About 1 m off the line.
    points = [(46.0, 14.0), (46.00001, 14.0005), (46.0, 14.001)]

    assert simplify(points) == [(46.0, 14.0), (46.0, 14.001)]


def test_short_lines_stay_as_they_are():
    assert simplify([]) == []
    assert simplify([(46.0, 14.0), (46.1, 14.1)]) == [(46.0, 14.0), (46.1, 14.1)]
