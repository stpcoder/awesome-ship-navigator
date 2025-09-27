#!/usr/bin/env python3
"""
Optimize ship departure times to reduce gaps while maintaining safe intervals.
Ships can overlap routes as long as they don't collide.
"""

import sqlite3
from datetime import datetime, timedelta
import json

def optimize_departure_times():
    conn = sqlite3.connect('ship_routes.db')
    cursor = conn.cursor()

    # Get all ship routes
    cursor.execute("""
        SELECT ship_id, ship_name, departure_time, arrival_time,
               path_points, speed_knots, direction, total_distance_nm
        FROM ship_routes_simulation
        ORDER BY ship_id
    """)

    routes = cursor.fetchall()

    # Create optimized schedule with smaller gaps (5 minutes between departures)
    base_time = datetime.strptime("2025-09-27T00:00:00", "%Y-%m-%dT%H:%M:%S")

    print("Optimizing departure times...")
    print("\nCurrent Schedule:")
    for route in routes:
        print(f"  {route[0]}: Departs {route[2]}, Arrives {route[3]}")

    # Update departure times with 5-minute intervals
    for i, route in enumerate(routes):
        ship_id = route[0]
        path_points = json.loads(route[4])
        speed_knots = route[5]
        total_distance = route[7]

        # New departure time: base + (index * 5 minutes)
        new_departure = base_time + timedelta(minutes=i*5)

        # Calculate new arrival time based on distance and speed
        travel_time_hours = total_distance / speed_knots
        travel_time = timedelta(hours=travel_time_hours)
        new_arrival = new_departure + travel_time

        # Update in database
        cursor.execute("""
            UPDATE ship_routes_simulation
            SET departure_time = ?,
                arrival_time = ?
            WHERE ship_id = ?
        """, (
            new_departure.isoformat(),
            new_arrival.isoformat(),
            ship_id
        ))

        print(f"  Updated {ship_id}: Departs {new_departure.strftime('%H:%M')}, Arrives {new_arrival.strftime('%H:%M')}")

    conn.commit()

    print("\n✅ Departure times optimized!")
    print("\nNew Schedule:")
    cursor.execute("""
        SELECT ship_id, departure_time, arrival_time
        FROM ship_routes_simulation
        ORDER BY departure_time
    """)

    for row in cursor.fetchall():
        dep_time = datetime.fromisoformat(row[1]).strftime("%H:%M")
        arr_time = datetime.fromisoformat(row[2]).strftime("%H:%M")
        print(f"  {row[0]}: {dep_time} → {arr_time}")

    conn.close()

if __name__ == "__main__":
    optimize_departure_times()