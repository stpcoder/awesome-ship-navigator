"""
Ship Navigation Core Optimizer with A* Algorithm
Using Lat/Lng coordinates directly (no pixel conversion)
"""

import numpy as np
import heapq
from typing import List, Tuple, Optional, Set, Dict
from datetime import datetime, timedelta
import math
from shapely.geometry import Point, Polygon, LineString
from shapely.ops import nearest_points
import logging
from dataclasses import dataclass

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Constants for navigation
EARTH_RADIUS_KM = 6371.0  # Earth's radius in kilometers
KM_TO_NM = 0.539957  # Conversion factor from km to nautical miles

# Ship speed constants (in knots)
DEFAULT_SHIP_SPEED = 10.0  # Default speed if not specified
MAX_SHIP_SPEED = 25.0  # Maximum allowed speed

# Safety margins
COLLISION_RADIUS_NM = 0.5  # Minimum distance between ships in nautical miles
OBSTACLE_MARGIN_NM = 0.3  # Safety margin around obstacles in nautical miles

# Grid resolution for A* pathfinding (in degrees)
# Smaller values = more precise but slower
GRID_RESOLUTION = 0.0005  # Approximately 55 meters at this latitude

def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Calculate the great circle distance between two points on Earth.
    Returns distance in nautical miles.
    """
    # Convert to radians
    lat1, lng1, lat2, lng2 = map(math.radians, [lat1, lng1, lat2, lng2])

    # Haversine formula
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng/2)**2
    c = 2 * math.asin(math.sqrt(a))

    # Distance in km, then convert to nautical miles
    distance_km = EARTH_RADIUS_KM * c
    return distance_km * KM_TO_NM

def calculate_bearing(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Calculate the bearing from point 1 to point 2.
    Returns bearing in degrees (0-360).
    """
    lat1, lng1, lat2, lng2 = map(math.radians, [lat1, lng1, lat2, lng2])

    dlng = lng2 - lng1
    x = math.sin(dlng) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlng)

    bearing = math.atan2(x, y)
    bearing = math.degrees(bearing)
    bearing = (bearing + 360) % 360

    return bearing

def interpolate_position(lat1: float, lng1: float, lat2: float, lng2: float, fraction: float) -> Tuple[float, float]:
    """
    Interpolate position between two points.
    fraction: 0.0 = point1, 1.0 = point2
    """
    lat = lat1 + (lat2 - lat1) * fraction
    lng = lng1 + (lng2 - lng1) * fraction
    return lat, lng

class Node:
    """Node for A* pathfinding using lat/lng coordinates"""
    def __init__(self, lat: float, lng: float, g: float = 0, h: float = 0, parent=None):
        self.lat = lat
        self.lng = lng
        self.g = g  # Cost from start
        self.h = h  # Heuristic cost to goal
        self.f = g + h  # Total cost
        self.parent = parent

    def __lt__(self, other):
        return self.f < other.f

    def __eq__(self, other):
        if other is None:
            return False
        # Consider nodes equal if they're very close (within grid resolution)
        return (abs(self.lat - other.lat) < GRID_RESOLUTION/2 and
                abs(self.lng - other.lng) < GRID_RESOLUTION/2)

    def __hash__(self):
        # Round to grid resolution for hashing
        lat_rounded = round(self.lat / GRID_RESOLUTION) * GRID_RESOLUTION
        lng_rounded = round(self.lng / GRID_RESOLUTION) * GRID_RESOLUTION
        return hash((lat_rounded, lng_rounded))

@dataclass
class ShipRoute:
    """Represents a ship's route using lat/lng waypoints"""
    name: str
    ship_id: str
    start: Tuple[float, float]  # (lat, lng)
    goal: Tuple[float, float]  # (lat, lng)
    path: List[Tuple[float, float]]  # List of (lat, lng) waypoints
    departure_time: datetime
    speed_knots: float
    color: str = 'blue'
    path_length_nm: float = 0
    timestamps: List[datetime] = None

    def calculate_timestamps(self):
        """Calculate arrival time at each waypoint"""
        if not self.path:
            return

        self.timestamps = [self.departure_time]
        cumulative_time = self.departure_time
        self.path_length_nm = 0

        for i in range(len(self.path) - 1):
            lat1, lng1 = self.path[i]
            lat2, lng2 = self.path[i + 1]

            # Calculate distance between waypoints
            distance_nm = haversine_distance(lat1, lng1, lat2, lng2)
            self.path_length_nm += distance_nm

            # Calculate travel time (distance / speed)
            travel_hours = distance_nm / self.speed_knots
            cumulative_time += timedelta(hours=travel_hours)
            self.timestamps.append(cumulative_time)

    def get_position_at_time(self, query_time: datetime) -> Optional[Tuple[float, float]]:
        """Get ship position at a specific time"""
        if not self.timestamps or query_time < self.departure_time:
            return None

        # Check if route is complete
        if query_time >= self.timestamps[-1]:
            return self.path[-1]

        # Find which segment the ship is on
        for i in range(len(self.timestamps) - 1):
            if self.timestamps[i] <= query_time < self.timestamps[i + 1]:
                # Interpolate position on this segment
                segment_start = self.timestamps[i]
                segment_end = self.timestamps[i + 1]
                segment_duration = (segment_end - segment_start).total_seconds()

                if segment_duration == 0:
                    return self.path[i]

                elapsed = (query_time - segment_start).total_seconds()
                fraction = elapsed / segment_duration

                lat1, lng1 = self.path[i]
                lat2, lng2 = self.path[i + 1]

                return interpolate_position(lat1, lng1, lat2, lng2, fraction)

        return self.path[-1]

class ObstaclePolygon:
    """Represents an obstacle area defined by lat/lng vertices"""
    def __init__(self, vertices: List[Tuple[float, float]]):
        """
        vertices: List of (lat, lng) tuples defining the polygon
        """
        self.vertices = vertices
        # Convert to shapely polygon for collision detection
        # Note: Shapely uses (lng, lat) order
        self.polygon = Polygon([(lng, lat) for lat, lng in vertices])

        # Add safety margin (convert NM to approximate degrees)
        # At this latitude, 1 degree ≈ 60 NM
        margin_degrees = OBSTACLE_MARGIN_NM / 60.0
        self.buffered_polygon = self.polygon.buffer(margin_degrees)

    def contains_point(self, lat: float, lng: float) -> bool:
        """Check if a point is inside the obstacle (with safety margin)"""
        point = Point(lng, lat)
        return self.buffered_polygon.contains(point)

    def intersects_line(self, lat1: float, lng1: float, lat2: float, lng2: float) -> bool:
        """Check if a line segment intersects the obstacle"""
        line = LineString([(lng1, lat1), (lng2, lat2)])
        return self.buffered_polygon.intersects(line)

    def distance_to_point(self, lat: float, lng: float) -> float:
        """Get minimum distance from point to obstacle boundary (in degrees)"""
        point = Point(lng, lat)
        if self.buffered_polygon.contains(point):
            return 0.0

        nearest = nearest_points(self.buffered_polygon, point)[0]
        return point.distance(nearest)

class CollisionChecker:
    """Check for collisions with obstacles and other ships"""
    def __init__(self, obstacles: List[ObstaclePolygon]):
        self.obstacles = obstacles
        self.existing_routes: List[ShipRoute] = []

    def add_route(self, route: ShipRoute):
        """Add an existing route to check against"""
        self.existing_routes.append(route)

    def is_position_safe(self, lat: float, lng: float,
                         check_time: Optional[datetime] = None) -> bool:
        """Check if a position is safe (not in obstacle or too close to other ships)"""
        # Check obstacles
        for obstacle in self.obstacles:
            if obstacle.contains_point(lat, lng):
                return False

        # Check other ships if time is specified
        if check_time:
            for route in self.existing_routes:
                other_pos = route.get_position_at_time(check_time)
                if other_pos:
                    distance = haversine_distance(lat, lng, other_pos[0], other_pos[1])
                    if distance < COLLISION_RADIUS_NM:
                        return False

        return True

    def is_path_safe(self, lat1: float, lng1: float, lat2: float, lng2: float,
                     start_time: Optional[datetime] = None,
                     travel_time_hours: Optional[float] = None) -> bool:
        """Check if a path segment is safe"""
        # Check obstacle intersection
        for obstacle in self.obstacles:
            if obstacle.intersects_line(lat1, lng1, lat2, lng2):
                return False

        # Check collision with other ships along the path
        if start_time and travel_time_hours:
            # Sample points along the path
            num_samples = max(2, int(travel_time_hours * 4))  # Check every 15 minutes
            for i in range(num_samples):
                fraction = i / (num_samples - 1) if num_samples > 1 else 0
                check_lat, check_lng = interpolate_position(lat1, lng1, lat2, lng2, fraction)
                check_time = start_time + timedelta(hours=travel_time_hours * fraction)

                if not self.is_position_safe(check_lat, check_lng, check_time):
                    return False

        return True

class PathAdjuster:
    """Adjust departure times to avoid collisions"""
    def __init__(self, collision_checker: CollisionChecker):
        self.collision_checker = collision_checker

    def find_safe_departure_time(self, path: List[Tuple[float, float]],
                                 preferred_time: datetime,
                                 speed: float = DEFAULT_SHIP_SPEED,
                                 max_delay_hours: float = 24) -> Optional[datetime]:
        """Find a safe departure time near the preferred time"""
        # Try the preferred time first
        test_route = ShipRoute("test", "test", path[0], path[-1], path,
                              preferred_time, speed)
        test_route.calculate_timestamps()

        # Check if the route is safe at preferred time
        is_safe = True
        for i in range(len(path) - 1):
            lat1, lng1 = path[i]
            lat2, lng2 = path[i + 1]

            distance_nm = haversine_distance(lat1, lng1, lat2, lng2)
            travel_hours = distance_nm / speed

            segment_start = test_route.timestamps[i]

            if not self.collision_checker.is_path_safe(lat1, lng1, lat2, lng2,
                                                       segment_start, travel_hours):
                is_safe = False
                break

        if is_safe:
            return preferred_time

        # Try alternative times
        for delay_hours in np.arange(0.5, max_delay_hours, 0.5):
            for direction in [1, -1]:  # Try both later and earlier
                test_time = preferred_time + timedelta(hours=delay_hours * direction)

                test_route = ShipRoute("test", "test", path[0], path[-1], path,
                                     test_time, speed)
                test_route.calculate_timestamps()

                is_safe = True
                for i in range(len(path) - 1):
                    lat1, lng1 = path[i]
                    lat2, lng2 = path[i + 1]

                    distance_nm = haversine_distance(lat1, lng1, lat2, lng2)
                    travel_hours = distance_nm / speed

                    segment_start = test_route.timestamps[i]

                    if not self.collision_checker.is_path_safe(lat1, lng1, lat2, lng2,
                                                               segment_start, travel_hours):
                        is_safe = False
                        break

                if is_safe:
                    return test_time

        return None

class RouteOptimizer:
    """Main route optimization using A* algorithm with lat/lng coordinates"""
    def __init__(self, obstacles: List[ObstaclePolygon],
                 existing_routes: Optional[List[ShipRoute]] = None):
        self.collision_checker = CollisionChecker(obstacles)
        if existing_routes:
            for route in existing_routes:
                self.collision_checker.add_route(route)

        self.path_adjuster = PathAdjuster(self.collision_checker)

    def get_neighbors(self, node: Node, goal_lat: float, goal_lng: float) -> List[Node]:
        """Get valid neighboring positions"""
        neighbors = []

        # 8-directional movement with adaptive step size
        base_step = GRID_RESOLUTION
        distance_to_goal = haversine_distance(node.lat, node.lng, goal_lat, goal_lng)

        # Use larger steps when far from goal, smaller steps when close
        if distance_to_goal > 5.0:  # More than 5 NM away
            step = base_step * 10
        elif distance_to_goal > 1.0:  # 1-5 NM away
            step = base_step * 5
        else:
            step = base_step

        # 8 directions: N, NE, E, SE, S, SW, W, NW
        directions = [
            (step, 0),      # North
            (step, step),   # Northeast
            (0, step),      # East
            (-step, step),  # Southeast
            (-step, 0),     # South
            (-step, -step), # Southwest
            (0, -step),     # West
            (step, -step)   # Northwest
        ]

        for dlat, dlng in directions:
            new_lat = node.lat + dlat
            new_lng = node.lng + dlng

            # Check if position is safe
            if self.collision_checker.is_position_safe(new_lat, new_lng):
                # Calculate costs
                move_distance = haversine_distance(node.lat, node.lng, new_lat, new_lng)
                g = node.g + move_distance
                h = haversine_distance(new_lat, new_lng, goal_lat, goal_lng)

                neighbor = Node(new_lat, new_lng, g, h, node)
                neighbors.append(neighbor)

        return neighbors

    def find_path_astar(self, start_lat: float, start_lng: float,
                       goal_lat: float, goal_lng: float,
                       departure_time: Optional[datetime] = None) -> Optional[List[Tuple[float, float]]]:
        """Find optimal path using A* algorithm"""
        logger.info(f"Finding path from ({start_lat}, {start_lng}) to ({goal_lat}, {goal_lng})")

        # Check if start and goal are valid
        if not self.collision_checker.is_position_safe(start_lat, start_lng):
            logger.error("Start position is not safe")
            return None

        if not self.collision_checker.is_position_safe(goal_lat, goal_lng):
            logger.error("Goal position is not safe")
            return None

        # Initialize A* algorithm
        start_node = Node(start_lat, start_lng, 0,
                         haversine_distance(start_lat, start_lng, goal_lat, goal_lng))
        goal_node = Node(goal_lat, goal_lng)

        open_set = []
        heapq.heappush(open_set, start_node)
        closed_set = set()

        # Limit iterations to prevent infinite loops
        max_iterations = 100000
        iteration = 0

        while open_set and iteration < max_iterations:
            iteration += 1

            current = heapq.heappop(open_set)

            # Check if we reached the goal (within tolerance)
            if abs(current.lat - goal_lat) < GRID_RESOLUTION and \
               abs(current.lng - goal_lng) < GRID_RESOLUTION:
                # Reconstruct path
                path = []
                while current:
                    path.append((current.lat, current.lng))
                    current = current.parent

                path.reverse()

                # Simplify path by removing unnecessary waypoints
                simplified_path = self.simplify_path(path)

                logger.info(f"Path found with {len(simplified_path)} waypoints")
                return simplified_path

            closed_set.add(current)

            # Get neighbors
            for neighbor in self.get_neighbors(current, goal_lat, goal_lng):
                if neighbor in closed_set:
                    continue

                # Check if neighbor is already in open set with better cost
                in_open = False
                for i, node in enumerate(open_set):
                    if node == neighbor:
                        if node.g > neighbor.g:
                            open_set[i] = neighbor
                            heapq.heapify(open_set)
                        in_open = True
                        break

                if not in_open:
                    heapq.heappush(open_set, neighbor)

            # Log progress periodically
            if iteration % 1000 == 0:
                logger.info(f"A* iteration {iteration}, open set size: {len(open_set)}")

        logger.warning(f"No path found after {iteration} iterations")

        # If no path found, try direct path with obstacle avoidance
        return self.find_direct_path_with_avoidance(start_lat, start_lng, goal_lat, goal_lng)

    def simplify_path(self, path: List[Tuple[float, float]]) -> List[Tuple[float, float]]:
        """Remove unnecessary waypoints from path"""
        if len(path) <= 2:
            return path

        simplified = [path[0]]

        i = 0
        while i < len(path) - 1:
            # Try to skip ahead as far as possible
            j = len(path) - 1
            while j > i + 1:
                lat1, lng1 = path[i]
                lat2, lng2 = path[j]

                # Check if direct path is safe
                if self.collision_checker.is_path_safe(lat1, lng1, lat2, lng2):
                    simplified.append(path[j])
                    i = j
                    break
                j -= 1
            else:
                # Can't skip, add next point
                i += 1
                if i < len(path):
                    simplified.append(path[i])

        # Always include the goal
        if simplified[-1] != path[-1]:
            simplified.append(path[-1])

        return simplified

    def find_direct_path_with_avoidance(self, start_lat: float, start_lng: float,
                                       goal_lat: float, goal_lng: float) -> List[Tuple[float, float]]:
        """Try to find a simple path with basic obstacle avoidance"""
        logger.info("Attempting direct path with obstacle avoidance")

        # Check if direct path is possible
        if self.collision_checker.is_path_safe(start_lat, start_lng, goal_lat, goal_lng):
            return [(start_lat, start_lng), (goal_lat, goal_lng)]

        # Try intermediate waypoints around obstacles
        waypoints = [(start_lat, start_lng)]

        # Add some intermediate points to go around obstacles
        # This is a simplified approach - just try some offset points
        mid_lat = (start_lat + goal_lat) / 2
        mid_lng = (start_lng + goal_lng) / 2

        # Try offsets in different directions
        offsets = [
            (0.01, 0.01), (0.01, -0.01), (-0.01, 0.01), (-0.01, -0.01),
            (0.02, 0), (0, 0.02), (-0.02, 0), (0, -0.02)
        ]

        for dlat, dlng in offsets:
            test_lat = mid_lat + dlat
            test_lng = mid_lng + dlng

            if self.collision_checker.is_position_safe(test_lat, test_lng):
                if self.collision_checker.is_path_safe(start_lat, start_lng, test_lat, test_lng) and \
                   self.collision_checker.is_path_safe(test_lat, test_lng, goal_lat, goal_lng):
                    waypoints.append((test_lat, test_lng))
                    waypoints.append((goal_lat, goal_lng))
                    return waypoints

        # If no simple path found, return direct path anyway (will be marked as unsafe)
        logger.warning("No safe path found, returning direct path")
        return [(start_lat, start_lng), (goal_lat, goal_lng)]

    def optimize_route(self, start_lat: float, start_lng: float,
                      goal_lat: float, goal_lng: float,
                      departure_time: datetime,
                      speed: float = DEFAULT_SHIP_SPEED,
                      allow_time_adjustment: bool = True) -> Dict:
        """
        Main function to optimize a route.
        Returns dict with route details and adjusted departure time if needed.
        """
        logger.info(f"Optimizing route from ({start_lat}, {start_lng}) to ({goal_lat}, {goal_lng})")

        # Find the path
        waypoints = self.find_path_astar(start_lat, start_lng, goal_lat, goal_lng, departure_time)

        if not waypoints:
            return {
                'success': False,
                'message': 'No valid path found',
                'waypoints': None,
                'departure_time': None,
                'arrival_time': None,
                'distance': None,
                'travel_time': None
            }

        # Check if we need to adjust departure time
        final_departure = departure_time
        if allow_time_adjustment:
            safe_departure = self.path_adjuster.find_safe_departure_time(
                waypoints, departure_time, speed
            )
            if safe_departure:
                final_departure = safe_departure
            else:
                logger.warning("Could not find safe departure time")

        # Create the route
        route = ShipRoute("optimized", "ship", waypoints[0], waypoints[-1],
                         waypoints, final_departure, speed)
        route.calculate_timestamps()

        # Calculate arrival time
        arrival_time = route.timestamps[-1] if route.timestamps else None

        return {
            'success': True,
            'message': 'Route optimized successfully',
            'waypoints': waypoints,
            'departure_time': final_departure,
            'arrival_time': arrival_time,
            'distance': route.path_length_nm,
            'travel_time': route.path_length_nm / speed if speed > 0 else 0,
            'time_adjusted': final_departure != departure_time
        }