#!/usr/bin/env python3
"""Check if ship positions are inside buffered obstacles"""

import json
import math
from shapely.geometry import Point, Polygon

# Load obstacles
with open('frontend/src/data/obstacles_latlng.json', 'r') as f:
    obstacles = json.load(f)

# Ship positions to check
positions = [
    ('Ship 1 dock', 35.986336025267406, 129.55268741316098),
    ('Ship 2 dock', 35.98767719209434, 129.5537203204886),
    ('Ship 3 dock', 35.98869949407204, 129.55497172230673),
    ('Ship 4 dock', 35.990135036644844, 129.55646198930378),
    ('Ship 5 dock', 35.9905142439701, 129.55833666345876),
]

# Check with buffer
OBSTACLE_MARGIN_NM = 0.1  # From the code
lat_nm_per_degree = 60.0
lng_nm_per_degree = 60.0 * math.cos(math.radians(35.98))
avg_nm_per_degree = (lat_nm_per_degree + lng_nm_per_degree) / 2
margin_degrees = OBSTACLE_MARGIN_NM / avg_nm_per_degree

print(f'Buffer margin: {margin_degrees:.6f} degrees (~{OBSTACLE_MARGIN_NM} NM)')
print(f'This is approximately {margin_degrees * 111000:.1f} meters\n')

for ship_name, lat, lng in positions:
    point = Point(lng, lat)
    inside_any = False

    for obstacle in obstacles:
        coords = [(c[1], c[0]) for c in obstacle['coordinates']]  # Convert to (lng, lat) for Shapely
        polygon = Polygon(coords)
        buffered = polygon.buffer(margin_degrees)

        if buffered.contains(point):
            print(f'❌ {ship_name} at ({lat:.6f}, {lng:.6f}) is inside buffered {obstacle["name"]}')
            inside_any = True
            break

    if not inside_any:
        print(f'✅ {ship_name} is clear of all buffered obstacles')

# Check without buffer
print('\nWithout buffer:')
for ship_name, lat, lng in positions:
    point = Point(lng, lat)
    inside_any = False

    for obstacle in obstacles:
        coords = [(c[1], c[0]) for c in obstacle['coordinates']]
        polygon = Polygon(coords)

        if polygon.contains(point):
            print(f'❌ {ship_name} is inside {obstacle["name"]}')
            inside_any = True
            break

    if not inside_any:
        print(f'✅ {ship_name} is clear of all obstacles')