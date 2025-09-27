#!/usr/bin/env python3
"""Setup script to initialize database with 10 ships as specified"""

import sqlite3
from datetime import datetime

# Connect to database
conn = sqlite3.connect('ship_management.db')
cursor = conn.cursor()

# Create ships table if it doesn't exist
cursor.execute("""
    CREATE TABLE IF NOT EXISTS ships (
        id INTEGER PRIMARY KEY,
        ship_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        length REAL,
        breath REAL,
        depth REAL,
        gt REAL,
        pol TEXT,
        latitude REAL,
        longitude REAL,
        speed REAL DEFAULT 0,
        course REAL DEFAULT 0,
        fishing_area_lat REAL,
        fishing_area_lng REAL,
        docking_lat REAL,
        docking_lng REAL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
""")

# Clear existing ships
cursor.execute("DELETE FROM ships")

# Ship positions data
ship_data = [
    # Ships 1-5: Currently at dock (정박 위치)
    {
        'id': 1,
        'ship_id': 'SHIP001',
        'name': '해성호',
        'type': '어선',
        'length': 20.1,
        'breath': 6.0,
        'depth': 1.8,
        'gt': 72,
        'pol': '포항',
        'latitude': 35.986434,
        'longitude': 129.552186,
        'docking_lat': 35.986434,
        'docking_lng': 129.552186,
        'fishing_area_lat': 35.980422,  # Ship 6's current position
        'fishing_area_lng': 129.568797
    },
    {
        'id': 2,
        'ship_id': 'SHIP002',
        'name': '동해호',
        'type': '어선',
        'length': 18.5,
        'breath': 5.5,
        'depth': 1.7,
        'gt': 65,
        'pol': '포항',
        'latitude': 35.988128,
        'longitude': 129.553293,
        'docking_lat': 35.988128,
        'docking_lng': 129.553293,
        'fishing_area_lat': 35.988268,  # Ship 7's current position
        'fishing_area_lng': 129.577491
    },
    {
        'id': 3,
        'ship_id': 'SHIP003',
        'name': '태평양호',
        'type': '어선',
        'length': 22.3,
        'breath': 6.5,
        'depth': 2.0,
        'gt': 85,
        'pol': '포항',
        'latitude': 35.989121,
        'longitude': 129.554669,
        'docking_lat': 35.989121,
        'docking_lng': 129.554669,
        'fishing_area_lat': 35.977445,  # Ship 8's current position
        'fishing_area_lng': 129.572475
    },
    {
        'id': 4,
        'ship_id': 'SHIP004',
        'name': '청룡호',
        'type': '어선',
        'length': 19.8,
        'breath': 5.8,
        'depth': 1.9,
        'gt': 70,
        'pol': '포항',
        'latitude': 35.990597,
        'longitude': 129.556164,
        'docking_lat': 35.990597,
        'docking_lng': 129.556164,
        'fishing_area_lat': 35.986104,  # Ship 9's current position
        'fishing_area_lng': 129.577959
    },
    {
        'id': 5,
        'ship_id': 'SHIP005',
        'name': '백두호',
        'type': '어선',
        'length': 21.0,
        'breath': 6.2,
        'depth': 1.85,
        'gt': 75,
        'pol': '포항',
        'latitude': 35.990852,
        'longitude': 129.558254,
        'docking_lat': 35.990852,
        'docking_lng': 129.558254,
        'fishing_area_lat': 35.977066,  # Ship 10's current position
        'fishing_area_lng': 129.573344
    },
    # Ships 6-10: Currently at fishing area (어장)
    {
        'id': 6,
        'ship_id': 'SHIP006',
        'name': '진주호',
        'type': '어선',
        'length': 19.5,
        'breath': 5.7,
        'depth': 1.75,
        'gt': 68,
        'pol': '포항',
        'latitude': 35.980422,
        'longitude': 129.568797,
        'fishing_area_lat': 35.980422,
        'fishing_area_lng': 129.568797,
        'docking_lat': 35.986434,  # Near Ship 1's position
        'docking_lng': 129.552486  # Slightly offset
    },
    {
        'id': 7,
        'ship_id': 'SHIP007',
        'name': '금성호',
        'type': '어선',
        'length': 20.5,
        'breath': 6.1,
        'depth': 1.82,
        'gt': 73,
        'pol': '포항',
        'latitude': 35.988268,
        'longitude': 129.577491,
        'fishing_area_lat': 35.988268,
        'fishing_area_lng': 129.577491,
        'docking_lat': 35.988128,  # Near Ship 2's position
        'docking_lng': 129.553593  # Slightly offset
    },
    {
        'id': 8,
        'ship_id': 'SHIP008',
        'name': '은하호',
        'type': '어선',
        'length': 18.8,
        'breath': 5.6,
        'depth': 1.72,
        'gt': 66,
        'pol': '포항',
        'latitude': 35.977445,
        'longitude': 129.572475,
        'fishing_area_lat': 35.977445,
        'fishing_area_lng': 129.572475,
        'docking_lat': 35.989121,  # Near Ship 3's position
        'docking_lng': 129.554969  # Slightly offset
    },
    {
        'id': 9,
        'ship_id': 'SHIP009',
        'name': '남해호',
        'type': '어선',
        'length': 21.5,
        'breath': 6.3,
        'depth': 1.95,
        'gt': 78,
        'pol': '포항',
        'latitude': 35.986104,
        'longitude': 129.577959,
        'fishing_area_lat': 35.986104,
        'fishing_area_lng': 129.577959,
        'docking_lat': 35.990597,  # Near Ship 4's position
        'docking_lng': 129.556464  # Slightly offset
    },
    {
        'id': 10,
        'ship_id': 'SHIP010',
        'name': '서해호',
        'type': '어선',
        'length': 19.2,
        'breath': 5.9,
        'depth': 1.77,
        'gt': 69,
        'pol': '포항',
        'latitude': 35.977066,
        'longitude': 129.573344,
        'fishing_area_lat': 35.977066,
        'fishing_area_lng': 129.573344,
        'docking_lat': 35.990852,  # Near Ship 5's position
        'docking_lng': 129.558554  # Slightly offset
    }
]

# Insert ships
for ship in ship_data:
    cursor.execute("""
        INSERT INTO ships (
            id, ship_id, name, type, length, breath, depth, gt, pol,
            latitude, longitude,
            docking_lat, docking_lng,
            fishing_area_lat, fishing_area_lng
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        ship['id'], ship['ship_id'], ship['name'], ship['type'],
        ship['length'], ship['breath'], ship['depth'], ship['gt'], ship['pol'],
        ship['latitude'], ship['longitude'],
        ship['docking_lat'], ship['docking_lng'],
        ship['fishing_area_lat'], ship['fishing_area_lng']
    ))

# Commit changes
conn.commit()

# Verify the data
cursor.execute("SELECT id, ship_id, name, latitude, longitude FROM ships ORDER BY id")
ships = cursor.fetchall()
print(f"Successfully initialized {len(ships)} ships:")
for ship in ships:
    print(f"  {ship[0]}. {ship[2]} ({ship[1]}): lat={ship[3]:.6f}, lng={ship[4]:.6f}")

conn.close()
print("\nDatabase setup complete!")