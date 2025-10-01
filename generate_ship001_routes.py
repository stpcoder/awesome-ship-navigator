#!/usr/bin/env python3
"""
Generate routes for SHIP_001 only
"""

import sqlite3
import json
from datetime import datetime, timedelta
from typing import List, Tuple, Optional
from core_optimizer_latlng import RouteOptimizer, ShipRoute, ObstaclePolygon
import logging
import os

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def get_ship001_positions(db_path: str):
    """Get SHIP_001 position and destinations from database"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Get only ship 1
    cursor.execute("""
        SELECT
            id, ship_id, name, latitude, longitude,
            fishing_area_lat, fishing_area_lng,
            docking_lat, docking_lng
        FROM ships
        WHERE id = 1
    """)

    row = cursor.fetchone()
    if row:
        ship_info = {
            'id': row[0],
            'ship_id': row[1],
            'name': row[2],
            'current_lat': row[3],
            'current_lng': row[4],
            'fishing_lat': row[5],
            'fishing_lng': row[6],
            'docking_lat': row[7],
            'docking_lng': row[8]
        }
    else:
        ship_info = None

    conn.close()
    return ship_info

def create_obstacles():
    """Load obstacle areas from the actual obstacle data file"""
    obstacles = []

    # Load obstacles from the JSON file used by the frontend
    obstacles_file = 'frontend/src/data/obstacles_latlng.json'

    if os.path.exists(obstacles_file):
        try:
            with open(obstacles_file, 'r') as f:
                obstacles_data = json.load(f)

            logger.info(f"Loading {len(obstacles_data)} obstacles from {obstacles_file}")

            for obstacle_dict in obstacles_data:
                if 'coordinates' in obstacle_dict:
                    # Convert coordinates to the format expected by ObstaclePolygon
                    # The JSON has [lat, lng] format
                    vertices = [(coord[0], coord[1]) for coord in obstacle_dict['coordinates']]

                    # Create obstacle polygon
                    obstacle = ObstaclePolygon(vertices)
                    obstacles.append(obstacle)

            logger.info(f"Successfully created {len(obstacles)} obstacle polygons")

        except Exception as e:
            logger.error(f"Error loading obstacles: {e}")
            # Fallback to a simple test obstacle if file loading fails
            obstacles.append(ObstaclePolygon([
                (35.988, 129.556),  # Near actual ship positions
                (35.989, 129.557),
                (35.988, 129.558),
                (35.987, 129.557)
            ]))
    else:
        logger.warning(f"Obstacles file not found: {obstacles_file}")
        # Create a test obstacle near the actual ship routes
        obstacles.append(ObstaclePolygon([
            (35.988, 129.556),  # Near actual ship positions
            (35.989, 129.557),
            (35.988, 129.558),
            (35.987, 129.557)
        ]))

    return obstacles

def generate_routes_for_ship001(ship: dict, start_time: datetime):
    """Generate two routes (departure and arrival) for SHIP_001"""
    obstacles = create_obstacles()
    routes = {}

    # Get existing ships' routes for collision avoidance
    db_path = 'ship_routes.db'
    existing_ships = []

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT ship_id, ship_name, departure_time, path_points, speed_knots
        FROM ship_routes_simulation
        WHERE ship_id != 'SHIP001'
        ORDER BY departure_time
    """)

    for row in cursor.fetchall():
        ship_id_db, ship_name, departure_str, path_json, speed = row
        path = json.loads(path_json)
        departure_dt = datetime.fromisoformat(departure_str)

        # Create ShipRoute object for collision checking
        existing_route = ShipRoute(
            name=ship_name,
            ship_id=ship_id_db,
            start=tuple(path[0]) if path else (0, 0),
            goal=tuple(path[-1]) if path else (0, 0),
            path=[tuple(p) for p in path],
            departure_time=departure_dt,
            speed_knots=speed
        )
        existing_route.calculate_timestamps()
        existing_ships.append(existing_route)

    conn.close()

    # Create optimizer with existing routes for collision checking
    optimizer = RouteOptimizer(obstacles, existing_routes=existing_ships)

    # Generate DEPARTURE route (docking -> fishing)
    logger.info(f"Generating DEPARTURE route for {ship['name']} ({ship['ship_id']})")
    logger.info(f"  From: ({ship['docking_lat']:.6f}, {ship['docking_lng']:.6f})")
    logger.info(f"  To: ({ship['fishing_lat']:.6f}, {ship['fishing_lng']:.6f})")

    departure_path = optimizer.find_path_astar(
        ship['docking_lat'], ship['docking_lng'],
        ship['fishing_lat'], ship['fishing_lng'],
        departure_time=start_time
    )

    if departure_path:
        logger.info(f"  Departure path found with {len(departure_path)} waypoints")

        # Create ship route
        ship_route = ShipRoute(
            name=ship['name'],
            ship_id=ship['ship_id'],
            start=(ship['docking_lat'], ship['docking_lng']),
            goal=(ship['fishing_lat'], ship['fishing_lng']),
            path=departure_path,
            departure_time=start_time,
            speed_knots=10.0  # Default speed
        )
        ship_route.calculate_timestamps()

        # Calculate arrival time and distance
        total_distance = 0
        for j in range(len(departure_path) - 1):
            from core_optimizer_latlng import haversine_distance
            dist = haversine_distance(departure_path[j][0], departure_path[j][1],
                                     departure_path[j+1][0], departure_path[j+1][1])
            total_distance += dist

        # Calculate arrival time (distance / speed = time)
        travel_time_hours = total_distance / 10.0  # 10 knots speed
        arrival_time = start_time + timedelta(hours=travel_time_hours)

        routes['departure'] = {
            'ship_id': ship['ship_id'],
            'ship_name': ship['name'],
            'departure_time': start_time.isoformat(),
            'arrival_time': arrival_time.isoformat(),
            'path': departure_path,
            'speed_knots': 10.0,
            'direction': 'to_fishing',
            'total_distance_nm': total_distance
        }

    # Generate ARRIVAL route (fishing -> docking)
    logger.info(f"Generating ARRIVAL route for {ship['name']} ({ship['ship_id']})")
    logger.info(f"  From: ({ship['fishing_lat']:.6f}, {ship['fishing_lng']:.6f})")
    logger.info(f"  To: ({ship['docking_lat']:.6f}, {ship['docking_lng']:.6f})")

    arrival_path = optimizer.find_path_astar(
        ship['fishing_lat'], ship['fishing_lng'],
        ship['docking_lat'], ship['docking_lng'],
        departure_time=start_time
    )

    if arrival_path:
        logger.info(f"  Arrival path found with {len(arrival_path)} waypoints")

        # Create ship route
        ship_route = ShipRoute(
            name=ship['name'],
            ship_id=ship['ship_id'],
            start=(ship['fishing_lat'], ship['fishing_lng']),
            goal=(ship['docking_lat'], ship['docking_lng']),
            path=arrival_path,
            departure_time=start_time,
            speed_knots=10.0  # Default speed
        )
        ship_route.calculate_timestamps()

        # Calculate arrival time and distance
        total_distance = 0
        for j in range(len(arrival_path) - 1):
            from core_optimizer_latlng import haversine_distance
            dist = haversine_distance(arrival_path[j][0], arrival_path[j][1],
                                     arrival_path[j+1][0], arrival_path[j+1][1])
            total_distance += dist

        # Calculate arrival time (distance / speed = time)
        travel_time_hours = total_distance / 10.0  # 10 knots speed
        arrival_time = start_time + timedelta(hours=travel_time_hours)

        routes['arrival'] = {
            'ship_id': ship['ship_id'],
            'ship_name': ship['name'],
            'departure_time': start_time.isoformat(),
            'arrival_time': arrival_time.isoformat(),
            'path': arrival_path,
            'speed_knots': 10.0,
            'direction': 'to_docking',
            'total_distance_nm': total_distance
        }

    return routes

def main():
    """Main function to generate and save routes for SHIP_001"""
    logger.info("Generating routes for SHIP_001...")

    # Database path
    db_path = 'ship_routes.db'

    # Get ship positions
    ship = get_ship001_positions(db_path)
    if not ship:
        logger.error("SHIP_001 not found in database")
        return

    logger.info(f"Found {ship['name']} ({ship['ship_id']})")

    # Set start time to a fixed base time
    start_time = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

    # Generate routes
    routes = generate_routes_for_ship001(ship, start_time)

    # Save routes to Python file for hardcoding
    with open('ship001_routes.py', 'w') as f:
        f.write('"""Hardcoded routes for SHIP_001"""\n\n')
        f.write('SHIP001_ROUTES = ')
        f.write(json.dumps(routes, indent=2))

    # Print summary
    print("\n=== SHIP_001 Route Generation Summary ===")
    for route_type, route_data in routes.items():
        print(f"\n{route_type.upper()} Route:")
        print(f"  Ship: {route_data['ship_name']} ({route_data['ship_id']})")
        print(f"  Direction: {route_data['direction']}")
        print(f"  Waypoints: {len(route_data['path'])}")
        print(f"  Distance: {route_data['total_distance_nm']:.2f} NM")
        print(f"  Path preview (first 3 points):")
        for i, point in enumerate(route_data['path'][:3]):
            print(f"    {i+1}. ({point[0]:.6f}, {point[1]:.6f})")

    print(f"\n✅ Routes saved to ship001_routes.py")

if __name__ == "__main__":
    main()