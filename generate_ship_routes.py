#!/usr/bin/env python3
"""
Generate routes for 9 ships (excluding ship 1) with A* algorithm
Ships 2-5: From docking to fishing area
Ships 6-10: From fishing area to docking
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

def get_ship_positions(db_path: str):
    """Get current ship positions and destinations from database"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Get ships 2-10 (excluding ship 1)
    cursor.execute("""
        SELECT
            id, ship_id, name, latitude, longitude,
            fishing_area_lat, fishing_area_lng,
            docking_lat, docking_lng
        FROM ships
        WHERE id BETWEEN 2 AND 10
        ORDER BY id
    """)

    ships = []
    for row in cursor.fetchall():
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

        # Determine start and goal based on ship ID
        if ship_info['id'] <= 5:  # Ships 2-5: dock -> fishing
            ship_info['start_lat'] = ship_info['docking_lat']
            ship_info['start_lng'] = ship_info['docking_lng']
            ship_info['goal_lat'] = ship_info['fishing_lat']
            ship_info['goal_lng'] = ship_info['fishing_lng']
            ship_info['direction'] = 'to_fishing'
        else:  # Ships 6-10: fishing -> dock
            ship_info['start_lat'] = ship_info['fishing_lat']
            ship_info['start_lng'] = ship_info['fishing_lng']
            ship_info['goal_lat'] = ship_info['docking_lat']
            ship_info['goal_lng'] = ship_info['docking_lng']
            ship_info['direction'] = 'to_docking'

        ships.append(ship_info)

    conn.close()
    return ships

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

def generate_routes(ships: List[dict], start_time: datetime):
    """Generate routes with collision avoidance between ships"""
    obstacles = create_obstacles()
    routes = []
    existing_ship_routes = []  # Keep track of existing routes for collision checking

    # Custom departure order with tight 5-minute intervals starting at 2 minutes
    # Compact schedule for rapid sequential departures
    ship_order_map = {
        'EUM002': {'order': 0, 'offset': 2},     # First ship: 2 minutes after start
        'EUM010': {'order': 1, 'offset': 7},     # Second ship: 7 minutes (5 min gap)
        'EUM003': {'order': 2, 'offset': 12},    # 12 minutes (5 min gap)
        'EUM009': {'order': 3, 'offset': 17},    # 17 minutes (5 min gap)
        'EUM005': {'order': 4, 'offset': 22},    # 22 minutes (5 min gap)
        'EUM007': {'order': 5, 'offset': 27},    # 27 minutes (5 min gap)
        'EUM004': {'order': 6, 'offset': 32},    # 32 minutes (5 min gap)
        'EUM006': {'order': 7, 'offset': 37},    # 37 minutes (5 min gap)
        'EUM008': {'order': 8, 'offset': 42},    # 42 minutes (5 min gap)
    }

    # Sort ships by custom order
    sorted_ships = sorted(ships, key=lambda s: ship_order_map.get(s['ship_id'], {}).get('order', 999))

    for ship in sorted_ships:
        ship_id = ship['ship_id']
        ship_info = ship_order_map.get(ship_id, {'offset': 150})  # Default offset if not found
        departure_offset = ship_info['offset']

        logger.info(f"Generating route for {ship['name']} ({ship['ship_id']}) with collision avoidance")
        logger.info(f"  From: ({ship['start_lat']:.6f}, {ship['start_lng']:.6f})")
        logger.info(f"  To: ({ship['goal_lat']:.6f}, {ship['goal_lng']:.6f})")
        logger.info(f"  Departure offset: {departure_offset} minutes")

        current_time = start_time + timedelta(minutes=departure_offset)

        # Create optimizer with existing routes for collision checking
        optimizer = RouteOptimizer(obstacles, existing_routes=existing_ship_routes)

        # Find path using A* algorithm
        path = optimizer.find_path_astar(
            ship['start_lat'], ship['start_lng'],
            ship['goal_lat'], ship['goal_lng'],
            departure_time=current_time
        )

        if path:
            logger.info(f"  Path found with {len(path)} waypoints")

            # Create ship route
            ship_route = ShipRoute(
                name=ship['name'],
                ship_id=ship['ship_id'],
                start=(ship['start_lat'], ship['start_lng']),
                goal=(ship['goal_lat'], ship['goal_lng']),
                path=path,
                departure_time=current_time,
                speed_knots=10.0  # Default speed
            )
            ship_route.calculate_timestamps()

            # Add to existing routes for next ship's collision checking
            existing_ship_routes.append(ship_route)

            # Calculate arrival time and distance
            total_distance = ship_route.path_length_nm if hasattr(ship_route, 'path_length_nm') else 0
            if total_distance == 0:
                # Calculate distance from path
                for j in range(len(path) - 1):
                    from core_optimizer_latlng import haversine_distance
                    dist = haversine_distance(path[j][0], path[j][1], path[j+1][0], path[j+1][1])
                    total_distance += dist
                ship_route.path_length_nm = total_distance

            # Calculate arrival time (distance / speed = time)
            travel_time_hours = total_distance / 10.0  # 10 knots speed
            arrival_time = current_time + timedelta(hours=travel_time_hours)

            routes.append({
                'ship_id': ship['ship_id'],
                'ship_name': ship['name'],
                'departure_time': current_time.isoformat(),
                'arrival_time': arrival_time.isoformat(),
                'path': path,
                'speed_knots': 10.0,
                'direction': ship['direction'],
                'total_distance_nm': total_distance
            })
        else:
            logger.warning(f"  No path found for {ship['name']}")

    # Sort routes by ship_id before returning for consistent output
    routes.sort(key=lambda r: r['ship_id'])
    return routes

def save_routes_to_db(routes: List[dict], db_path: str):
    """Save generated routes to database"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Create routes table if not exists
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ship_routes_simulation (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ship_id TEXT NOT NULL,
            ship_name TEXT,
            departure_time TEXT,
            arrival_time TEXT,
            path TEXT,  -- JSON array of [lat, lng] points
            speed_knots REAL,
            direction TEXT,
            total_distance_nm REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Clear existing routes
    cursor.execute("DELETE FROM ship_routes_simulation")

    # Insert new routes
    for route in routes:
        cursor.execute("""
            INSERT INTO ship_routes_simulation
            (ship_id, ship_name, departure_time, arrival_time, path,
             speed_knots, direction, total_distance_nm)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            route['ship_id'],
            route['ship_name'],
            route['departure_time'],
            route['arrival_time'],
            json.dumps(route['path']),
            route['speed_knots'],
            route['direction'],
            route['total_distance_nm']
        ))

    conn.commit()
    conn.close()
    logger.info(f"Saved {len(routes)} routes to database")

def main():
    """Main function to generate and save routes"""
    logger.info("Starting independent route generation for 9 ships...")

    # Database path
    db_path = 'ship_routes.db'

    # Get ship positions
    ships = get_ship_positions(db_path)
    logger.info(f"Found {len(ships)} ships to route")

    # Set start time to a fixed base time (0 in simulation)
    # This creates consistent demo data
    start_time = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

    # Generate routes
    routes = generate_routes(ships, start_time)

    # Save to database
    save_routes_to_db(routes, db_path)

    # Print summary
    print("\n=== Route Generation Summary ===")
    for route in routes:
        print(f"\n{route['ship_name']} ({route['ship_id']}):")
        print(f"  Direction: {route['direction']}")
        print(f"  Departure: {route['departure_time']}")
        print(f"  Waypoints: {len(route['path'])}")
        print(f"  Distance: {route['total_distance_nm']:.2f} NM")

if __name__ == "__main__":
    main()