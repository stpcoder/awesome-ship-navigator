#!/usr/bin/env python3
"""Copy ship data from ship_management.db to ship_routes.db"""

import sqlite3

# Source database
source_conn = sqlite3.connect('ship_management.db')
source_cursor = source_conn.cursor()

# Destination database
dest_conn = sqlite3.connect('ship_routes.db')
dest_cursor = dest_conn.cursor()

# Get all data from source
source_cursor.execute("SELECT * FROM ships")
ships = source_cursor.fetchall()

print(f"Found {len(ships)} ships in ship_management.db")

# Clear existing ships in destination
dest_cursor.execute("DELETE FROM ships")

# Insert data to destination
for ship in ships:
    # ship tuple contains all 19 fields from ship_management.db
    # We need to add pol_addr as NULL since it's in the destination schema but not source
    dest_cursor.execute("""
        INSERT INTO ships (
            id, ship_id, name, type, length, breath, depth, gt, pol, pol_addr,
            latitude, longitude, speed, course,
            fishing_area_lat, fishing_area_lng,
            docking_lat, docking_lng,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, ship)

dest_conn.commit()

# Verify
dest_cursor.execute("SELECT id, ship_id, name, latitude, longitude FROM ships")
result = dest_cursor.fetchall()
print(f"Successfully copied {len(result)} ships to ship_routes.db")
for ship in result:
    print(f"  {ship[0]}. {ship[2]} ({ship[1]}): lat={ship[3]}, lng={ship[4]}")

source_conn.close()
dest_conn.close()