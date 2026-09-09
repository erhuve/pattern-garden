import json
import math
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path

root = Path(__file__).resolve().parent.parent
data = json.loads(subprocess.check_output(["bun", str(root / "tests/glyph_geometry.ts")], cwd=root))


def contains(x, y, polygon):
    inside = False
    for (ax, ay), (bx, by) in zip(polygon, polygon[1:] + polygon[:1]):
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
            inside = not inside
    return inside


total = 0
for item in data:
    faces = []
    for index, group in enumerate(ET.fromstring('<svg>' + item['svg'] + '</svg>')):
        for face in group:
            faces.append((index, [tuple(map(float, point.split(','))) for point in face.attrib['points'].split()]))
    points = [p for _, polygon in faces for p in polygon]
    bad = []
    for ix in range(math.floor(min(p[0] for p in points) * 5), math.ceil(max(p[0] for p in points) * 5)):
        x = ix / 5 + 0.071
        for iy in range(math.floor(min(p[1] for p in points) * 5), math.ceil(max(p[1] for p in points) * 5)):
            y = iy / 5 + 0.083
            ray = []
            for index, box in enumerate(item['boxes']):
                low = max(box['min'][0] - x / 60, box['min'][1] + x / 60, (box['min'][2] + y) / 30)
                high = min(box['max'][0] - x / 60, box['max'][1] + x / 60, (box['max'][2] + y) / 30)
                if high - low > 0.00001:
                    ray.append((high, index))
            if not ray:
                continue
            total += 1
            expected = max(ray)[1]
            hits = [index for index, polygon in faces if contains(x, y, polygon)]
            assert hits, (item['kind'], item['facing'], 'unpainted solid', x, y)
            depths = {index: depth for depth, index in ray}
            if hits[-1] != expected and hits[-1] in depths and abs(depths[expected] - depths[hits[-1]]) > 0.0001:
                bad.append((x, y, expected, hits[-1]))
    assert not bad, (item['kind'], item['facing'], len(bad), bad[:3])
    print(f"PASS: {item['kind']} {item['facing']} painter ordering matches ray geometry")
print(f"PASS: {total} surface samples across all 16 directional views")
