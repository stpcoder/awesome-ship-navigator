#!/usr/bin/env python3
"""Debug specific route to understand obstacle intersection"""

import json
import sqlite3
from shapely.geometry import LineString, Polygon

# Load obstacles
with open('frontend/src/data/obstacles_latlng.json', 'r') as f:
    obstacles = json.load(f)

# Get Ship 2 route
conn = sqlite3.connect('ship_routes.db')
cursor = conn.cursor()
cursor.execute("SELECT path_points FROM ship_routes_simulation WHERE ship_id='SHIP002'")
path = json.loads(cursor.fetchone()[0])
conn.close()

print("Ship 2 (동해호) path analysis:")
print("=" * 50)

# Check each segment
for i in range(len(path) - 1):
    lat1, lng1 = path[i]
    lat2, lng2 = path[i + 1]
    segment = LineString([(lng1, lat1), (lng2, lat2)])

    print(f"\nSegment {i+1}: ({lat1:.6f}, {lng1:.6f}) -> ({lat2:.6f}, {lng2:.6f})")

    # Check against all obstacles
    for obstacle in obstacles:
        coords = [(c[1], c[0]) for c in obstacle['coordinates']]  # Convert to (lng, lat)
        polygon = Polygon(coords)

        if polygon.intersects(segment):
            print(f"  ❌ Intersects {obstacle['name']}")

            # Find intersection point
            intersection = polygon.intersection(segment)
            if hasattr(intersection, 'coords'):
                for lng, lat in intersection.coords:
                    print(f"     Intersection at: ({lat:.6f}, {lng:.6f})")

# Also print obstacle 17 boundaries
print("\n" + "=" * 50)
print("박스 17 boundaries:")
for obstacle in obstacles:
    if obstacle['name'] == '박스 17':
        for i, coord in enumerate(obstacle['coordinates']):
            print(f"  Corner {i+1}: ({coord[0]:.6f}, {coord[1]:.6f})")