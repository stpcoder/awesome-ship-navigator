#!/usr/bin/env python3
"""Verify that generated routes avoid obstacles"""

import sqlite3
import json
from shapely.geometry import Point, Polygon, LineString

# Load obstacles
with open('frontend/src/data/obstacles_latlng.json', 'r') as f:
    obstacles = json.load(f)

# Convert obstacles to Shapely polygons
obstacle_polygons = []
for obstacle in obstacles:
    coords = [(c[1], c[0]) for c in obstacle['coordinates']]  # Convert to (lng, lat)
    polygon = Polygon(coords)
    obstacle_polygons.append((obstacle['name'], polygon))

# Get routes from database
conn = sqlite3.connect('ship_routes.db')
cursor = conn.cursor()

cursor.execute("""
    SELECT ship_id, ship_name, path_points
    FROM ship_routes_simulation
    ORDER BY id
""")

print("Verifying routes avoid obstacles...")
print("=" * 50)

all_safe = True
for row in cursor.fetchall():
    ship_id, ship_name, path_points = row
    path = json.loads(path_points)

    print(f"\n{ship_name} ({ship_id}):")
    print(f"  Waypoints: {len(path)}")

    # Check each segment of the path
    segments_safe = True
    for i in range(len(path) - 1):
        lat1, lng1 = path[i]
        lat2, lng2 = path[i + 1]

        # Create line segment
        segment = LineString([(lng1, lat1), (lng2, lat2)])

        # Check against all obstacles
        for obstacle_name, polygon in obstacle_polygons:
            if polygon.intersects(segment):
                print(f"  ❌ Segment {i+1} intersects {obstacle_name}")
                segments_safe = False
                all_safe = False
                break

    if segments_safe:
        print(f"  ✅ All segments avoid obstacles")

conn.close()

print("\n" + "=" * 50)
if all_safe:
    print("✅ All routes successfully avoid obstacles!")
else:
    print("⚠️ Some routes intersect with obstacles")