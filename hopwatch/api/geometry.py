"""Simplification of route lines for drawing on a map."""

import math

# Points closer than this to the simplified line are dropped; well below what a map at street zoom shows.
TOLERANCE_M = 5.0
_METRES_PER_DEGREE = 111_320.0


def simplify(points: list[tuple[float, float]], tolerance_m: float = TOLERANCE_M) -> list[tuple[float, float]]:
    """`points` (`(lat, lon)`) simplified with the Douglas–Peucker algorithm; the first and last point stay."""
    if len(points) < 3:
        return list(points)
    cos_lat = math.cos(math.radians(points[0][0]))
    xy = [(lon * _METRES_PER_DEGREE * cos_lat, lat * _METRES_PER_DEGREE) for lat, lon in points]
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        start, end = stack.pop()
        (ax, ay), (bx, by) = xy[start], xy[end]
        dx, dy = bx - ax, by - ay
        length_sq = dx * dx + dy * dy
        farthest, distance = -1, tolerance_m
        for index in range(start + 1, end):
            px, py = xy[index]
            if length_sq:
                t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length_sq))
                cx, cy = ax + t * dx, ay + t * dy
            else:
                cx, cy = ax, ay
            gap = math.hypot(px - cx, py - cy)
            if gap > distance:
                farthest, distance = index, gap
        if farthest >= 0:
            keep[farthest] = True
            stack.extend(((start, farthest), (farthest, end)))
    return [point for point, kept in zip(points, keep, strict=True) if kept]
