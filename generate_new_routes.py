#!/usr/bin/env python3
"""Generate new routes for EUM002-EUM010 (keeping SHIP001 untouched)"""

import sqlite3
import json
from datetime import datetime, timedelta
from math import radians, sin, cos, sqrt, atan2

# Connect to database
conn = sqlite3.connect('ship_routes.db')
cursor = conn.cursor()

# First, delete existing routes for EUM002-EUM010 only
print("🗑️  Clearing existing routes for EUM002-EUM010...")
cursor.execute("DELETE FROM ship_routes_simulation WHERE ship_id LIKE 'EUM%' AND ship_id != 'EUM001'")

# Get ship data from database
ships_data = []
for i in range(2, 11):  # EUM002 to EUM010
    ship_id = f'EUM{i:03d}'
    cursor.execute("""
        SELECT ship_id, name, latitude, longitude,
               docking_lat, docking_lng, fishing_area_lat, fishing_area_lng
        FROM ships WHERE ship_id = ?
    """, (ship_id,))
    result = cursor.fetchone()
    if result:
        ships_data.append({
            'ship_id': result[0],
            'ship_name': result[1],
            'current_lat': result[2],
            'current_lng': result[3],
            'docking_lat': result[4],
            'docking_lng': result[5],
            'fishing_lat': result[6],
            'fishing_lng': result[7]
        })

print(f"📋 Found {len(ships_data)} ships to process")

# Base time for routes
base_time = datetime(2025, 9, 28, 0, 0, 0)

# Custom departure order with tighter intervals (3 minutes instead of 5)
departure_schedule = [
    ('EUM002', 2),   # 00:02
    ('EUM003', 5),   # 00:05
    ('EUM004', 8),   # 00:08
    ('EUM005', 11),  # 00:11
    ('EUM006', 14),  # 00:14
    ('EUM007', 17),  # 00:17
    ('EUM008', 20),  # 00:20
    ('EUM009', 23),  # 00:23
    ('EUM010', 26),  # 00:26
]

def calculate_distance_nm(lat1, lon1, lat2, lon2):
    """Calculate distance in nautical miles"""
    R = 3440.065  # Earth radius in nautical miles
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))
    return R * c

def generate_path(start_lat, start_lng, end_lat, end_lng, num_points=7):
    """Generate path with more waypoints for smoother route"""
    path = []
    for i in range(num_points):
        ratio = i / (num_points - 1)
        lat = start_lat + (end_lat - start_lat) * ratio
        lng = start_lng + (end_lng - start_lng) * ratio
        path.append([lat, lng])
    return path

# Process each ship
for ship_id, departure_minute in departure_schedule:
    # Find ship data
    ship = next((s for s in ships_data if s['ship_id'] == ship_id), None)
    if not ship:
        print(f"⚠️  Ship {ship_id} not found")
        continue

    ship_num = int(ship_id[3:])

    # Morning departure (정박지 → 어장)
    morning_departure = base_time + timedelta(minutes=departure_minute)
    morning_arrival = morning_departure + timedelta(minutes=30)  # 30 minute journey

    morning_path = generate_path(
        ship['docking_lat'], ship['docking_lng'],
        ship['fishing_lat'], ship['fishing_lng']
    )

    distance_nm = calculate_distance_nm(
        ship['docking_lat'], ship['docking_lng'],
        ship['fishing_lat'], ship['fishing_lng']
    )

    # Insert morning route (to_fishing)
    cursor.execute("""
        INSERT INTO ship_routes_simulation
        (ship_id, ship_name, departure_time, arrival_time, path,
         speed_knots, direction, total_distance_nm)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        ship['ship_id'],
        ship['ship_name'],
        morning_departure.isoformat(),
        morning_arrival.isoformat(),
        json.dumps(morning_path),
        10.0,
        'to_fishing',
        distance_nm
    ))
    print(f"✅ {ship_id} morning route: dock→fish at {morning_departure.strftime('%H:%M')}")

    # Afternoon return (어장 → 정박지)
    afternoon_departure = morning_arrival + timedelta(hours=2)  # 2 hours at fishing ground
    afternoon_arrival = afternoon_departure + timedelta(minutes=30)

    return_path = generate_path(
        ship['fishing_lat'], ship['fishing_lng'],
        ship['docking_lat'], ship['docking_lng']
    )

    # Insert afternoon route (to_docking)
    cursor.execute("""
        INSERT INTO ship_routes_simulation
        (ship_id, ship_name, departure_time, arrival_time, path,
         speed_knots, direction, total_distance_nm)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        ship['ship_id'],
        ship['ship_name'],
        afternoon_departure.isoformat(),
        afternoon_arrival.isoformat(),
        json.dumps(return_path),
        10.0,
        'to_docking',
        distance_nm
    ))
    print(f"   Return: fish→dock at {afternoon_departure.strftime('%H:%M')}")

conn.commit()

# Verify the generation
print("\n🔍 Verification:")
cursor.execute("""
    SELECT ship_id, COUNT(*) as route_count,
           MIN(departure_time) as first_departure,
           MAX(arrival_time) as last_arrival
    FROM ship_routes_simulation
    WHERE ship_id LIKE 'EUM%'
    GROUP BY ship_id
    ORDER BY ship_id
""")
results = cursor.fetchall()
for ship_id, count, first_dep, last_arr in results:
    print(f"  {ship_id}: {count} routes, first departure: {first_dep[11:16]}, last arrival: {last_arr[11:16]}")

cursor.execute("SELECT COUNT(*) FROM ship_routes_simulation WHERE ship_id LIKE 'EUM%'")
total = cursor.fetchone()[0]
print(f"\n📊 Total routes in database: {total}")

conn.close()
print("\n✅ Route generation complete!")