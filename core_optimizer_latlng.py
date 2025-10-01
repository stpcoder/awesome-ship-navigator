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
import math

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
OBSTACLE_MARGIN_NM = 0.02  # Small safety margin around obstacles (about 37 meters)

# Grid resolution for A* pathfinding (in degrees)
# Smaller values = more precise but slower
# Very fine resolution to navigate tight spaces
GRID_RESOLUTION = 0.0002  # Approximately 22 meters at this latitude

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

        # Ensure departure_time is a datetime object
        if isinstance(self.departure_time, (int, float)):
            # Convert minutes to datetime
            import datetime as dt
            self.departure_time = dt.datetime.now() + dt.timedelta(minutes=self.departure_time)

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
            # Handle zero speed by using default speed
            speed = self.speed_knots if self.speed_knots > 0 else 10.0  # Default to 10 knots if speed is 0
            travel_hours = distance_nm / speed
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

        # Add small safety margin (convert NM to approximate degrees)
        # At latitude 35.98, 1 degree of latitude ≈ 60 NM
        # 1 degree of longitude ≈ 51 NM (60 * cos(35.98))
        # Use average for approximation
        lat_nm_per_degree = 60.0
        lng_nm_per_degree = 60.0 * math.cos(math.radians(35.98))
        avg_nm_per_degree = (lat_nm_per_degree + lng_nm_per_degree) / 2
        margin_degrees = OBSTACLE_MARGIN_NM / avg_nm_per_degree if OBSTACLE_MARGIN_NM > 0 else 0
        self.buffered_polygon = self.polygon.buffer(margin_degrees) if margin_degrees > 0 else self.polygon

    def contains_point(self, lat: float, lng: float) -> bool:
        """Check if a point is inside the obstacle (with small buffer)"""
        point = Point(lng, lat)
        # Use buffered polygon for safety
        return self.buffered_polygon.contains(point)

    def intersects_line(self, lat1: float, lng1: float, lat2: float, lng2: float) -> bool:
        """Check if a line segment intersects the obstacle (with small buffer)"""
        line = LineString([(lng1, lat1), (lng2, lat2)])
        # Use buffered polygon for safety
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
                         check_time: Optional[datetime] = None,
                         ignore_buffer: bool = False) -> bool:
        """Check if a position is safe (not in obstacle or too close to other ships)"""
        # Check obstacles
        for obstacle in self.obstacles:
            if ignore_buffer:
                # Check only the actual obstacle, not the buffered version
                point = Point(lng, lat)
                if obstacle.polygon.contains(point):
                    return False
            else:
                # Check with buffer
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
            step = base_step * 5  # Reduced multiplier for better obstacle navigation
        elif distance_to_goal > 1.0:  # 1-5 NM away
            step = base_step * 2  # Reduced multiplier
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

            # Boundary check - don't go too far from start and goal
            # This prevents the algorithm from exploring too far
            min_lat = min(self.start_lat, goal_lat) - 0.05  # About 3 NM buffer
            max_lat = max(self.start_lat, goal_lat) + 0.05
            min_lng = min(self.start_lng, goal_lng) - 0.05
            max_lng = max(self.start_lng, goal_lng) + 0.05

            if new_lat < min_lat or new_lat > max_lat or new_lng < min_lng or new_lng > max_lng:
                continue

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

        # Store start position for neighbor checks
        self.start_lat = start_lat
        self.start_lng = start_lng

        # Check if start and goal are valid
        # Allow start/goal positions even if inside obstacles (harbors may be in restricted zones)
        # But we need to find safe exit/entry points
        start_in_obstacle = not self.collision_checker.is_position_safe(start_lat, start_lng, ignore_buffer=True)
        goal_in_obstacle = not self.collision_checker.is_position_safe(goal_lat, goal_lng, ignore_buffer=True)

        if start_in_obstacle:
            logger.warning(f"Start position ({start_lat}, {start_lng}) is inside an obstacle - will find safe exit")

        if goal_in_obstacle:
            logger.warning(f"Goal position ({goal_lat}, {goal_lng}) is inside an obstacle - will find safe entry")

        # Initialize A* algorithm
        start_node = Node(start_lat, start_lng, 0,
                         haversine_distance(start_lat, start_lng, goal_lat, goal_lng))
        goal_node = Node(goal_lat, goal_lng)

        open_set = []
        heapq.heappush(open_set, start_node)
        closed_set = set()

        # Limit iterations to prevent infinite loops
        max_iterations = 10000  # Increased for better pathfinding
        iteration = 0

        # Track best node found so far (closest to goal)
        best_node = start_node
        best_distance = haversine_distance(start_lat, start_lng, goal_lat, goal_lng)

        while open_set and iteration < max_iterations:
            iteration += 1

            current = heapq.heappop(open_set)

            # Track best node (closest to goal)
            current_distance = haversine_distance(current.lat, current.lng, goal_lat, goal_lng)
            if current_distance < best_distance:
                best_node = current
                best_distance = current_distance

            # Check if we reached the goal (within tolerance)
            # Increased tolerance for better goal reaching
            goal_tolerance = GRID_RESOLUTION * 2
            if abs(current.lat - goal_lat) < goal_tolerance and \
               abs(current.lng - goal_lng) < goal_tolerance:
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
            if iteration % 1000 == 0 and iteration > 0:
                logger.debug(f"A* iteration {iteration}, open set size: {len(open_set)}, best distance: {best_distance:.3f} NM")

        logger.warning(f"No path found after {iteration} iterations, best distance: {best_distance:.3f} NM")

        # If we got reasonably close, use the best path found
        if best_distance < 1.0:  # Within 1 NM of goal
            path = []
            current = best_node
            while current:
                path.append((current.lat, current.lng))
                current = current.parent
            path.reverse()
            path.append((goal_lat, goal_lng))  # Add exact goal
            logger.info(f"Using best partial path with {len(path)} waypoints")
            return self.simplify_path(path)

        # Otherwise, try direct path with obstacle avoidance
        return self.find_direct_path_with_avoidance(start_lat, start_lng, goal_lat, goal_lng)

    def simplify_path(self, path: List[Tuple[float, float]]) -> List[Tuple[float, float]]:
        """Remove unnecessary waypoints from path while ensuring no obstacle crossing"""
        if len(path) <= 2:
            return path

        simplified = [path[0]]
        i = 0

        while i < len(path) - 1:
            # Try to find the furthest point we can reach directly
            best_j = i + 1  # At minimum, go to next point

            for j in range(i + 2, len(path)):
                lat1, lng1 = path[i]
                lat2, lng2 = path[j]

                # Check if direct path is safe (no obstacle intersection)
                safe = True
                for obstacle in self.collision_checker.obstacles:
                    if obstacle.intersects_line(lat1, lng1, lat2, lng2):
                        safe = False
                        break

                if safe:
                    best_j = j  # Can reach this point directly
                else:
                    break  # Can't go further, use previous best

            # Add the best reachable point
            simplified.append(path[best_j])
            i = best_j

        # Always ensure goal is included
        if simplified[-1] != path[-1]:
            simplified.append(path[-1])

        return simplified

    def find_direct_path_with_avoidance(self, start_lat: float, start_lng: float,
                                       goal_lat: float, goal_lng: float) -> List[Tuple[float, float]]:
        """Try to find a simple path with basic obstacle avoidance"""
        logger.info("Attempting direct path with obstacle avoidance")

        # Check if direct path is possible (no obstacles in the way)
        direct_safe = True
        for obstacle in self.collision_checker.obstacles:
            if obstacle.intersects_line(start_lat, start_lng, goal_lat, goal_lng):
                direct_safe = False
                break

        if direct_safe:
            return [(start_lat, start_lng), (goal_lat, goal_lng)]

        # Try multiple intermediate waypoints to navigate around obstacles
        waypoints = [(start_lat, start_lng)]

        # Calculate direction vector
        direction_lat = goal_lat - start_lat
        direction_lng = goal_lng - start_lng
        distance = haversine_distance(start_lat, start_lng, goal_lat, goal_lng)

        # Create multiple waypoints along the path
        num_waypoints = min(10, max(3, int(distance * 2)))  # More waypoints for longer distances

        for i in range(1, num_waypoints):
            fraction = i / num_waypoints
            waypoint_lat = start_lat + direction_lat * fraction
            waypoint_lng = start_lng + direction_lng * fraction

            # If waypoint is blocked, try to find alternative around it
            if not self.collision_checker.is_position_safe(waypoint_lat, waypoint_lng):
                # Try perpendicular offsets
                perpendicular_offsets = [
                    (0.0005, 0), (0, 0.0005), (-0.0005, 0), (0, -0.0005),
                    (0.001, 0), (0, 0.001), (-0.001, 0), (0, -0.001),
                    (0.001, 0.001), (0.001, -0.001), (-0.001, 0.001), (-0.001, -0.001),
                    (0.002, 0), (0, 0.002), (-0.002, 0), (0, -0.002)
                ]

                found_alternative = False
                for dlat, dlng in perpendicular_offsets:
                    alt_lat = waypoint_lat + dlat
                    alt_lng = waypoint_lng + dlng

                    if self.collision_checker.is_position_safe(alt_lat, alt_lng):
                        # Check if path to this alternative is safe
                        last_point = waypoints[-1]
                        if self.collision_checker.is_path_safe(last_point[0], last_point[1], alt_lat, alt_lng):
                            waypoints.append((alt_lat, alt_lng))
                            found_alternative = True
                            break

                if not found_alternative:
                    logger.warning(f"Could not find safe alternative for waypoint {i}")
            else:
                # Waypoint is safe, but verify path from last point is also safe
                last_point = waypoints[-1]
                path_safe = True

                # Check if the path segment intersects any obstacle
                for obstacle in self.collision_checker.obstacles:
                    if obstacle.intersects_line(last_point[0], last_point[1], waypoint_lat, waypoint_lng):
                        path_safe = False
                        break

                if path_safe:
                    waypoints.append((waypoint_lat, waypoint_lng))
                else:
                    # Path is blocked, try to find alternative route around obstacle
                    logger.debug(f"Direct path to waypoint {i} blocked, finding alternative")
                    # Try offset points
                    for dlat, dlng in [(0.001, 0), (0, 0.001), (-0.001, 0), (0, -0.001)]:
                        alt_lat = waypoint_lat + dlat
                        alt_lng = waypoint_lng + dlng
                        if self.collision_checker.is_position_safe(alt_lat, alt_lng):
                            alt_safe = True
                            for obstacle in self.collision_checker.obstacles:
                                if obstacle.intersects_line(last_point[0], last_point[1], alt_lat, alt_lng):
                                    alt_safe = False
                                    break
                            if alt_safe:
                                waypoints.append((alt_lat, alt_lng))
                                break

        # Always add the goal at the end
        waypoints.append((goal_lat, goal_lng))

        # Simplify the path to remove unnecessary waypoints
        simplified = self.simplify_path(waypoints)

        logger.info(f"Created fallback path with {len(simplified)} waypoints")
        return simplified

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

    def optimize_departure_time(self, new_ship: ShipRoute, existing_ships: List[ShipRoute],
                               time_window_minutes: int = 1440) -> float:
        """
        Find optimal departure time to avoid collisions with existing routes

        Args:
            new_ship: The ship route to optimize
            existing_ships: List of existing ship routes to avoid
            time_window_minutes: Time window to search for optimal departure (default 24 hours)

        Returns:
            Optimal departure time in minutes from now
        """
        from datetime import datetime, timedelta
        import math

        current_time = datetime.now()

        # Determine base requested departure as datetime
        # new_ship.departure_time may be minutes-from-now (number) or a datetime
        if isinstance(new_ship.departure_time, (int, float)):
            base_departure_dt = current_time + timedelta(minutes=float(new_ship.departure_time))
            base_departure_minutes = float(new_ship.departure_time)
        else:
            base_departure_dt = new_ship.departure_time
            base_departure_minutes = max(0.0, (base_departure_dt - current_time).total_seconds() / 60.0)

        # Only allow small positive adjustments to reduce disruption
        min_offset = 3
        max_offset = min(10, time_window_minutes)
        step_minutes = 1

        best_time = base_departure_minutes  # default to requested time
        min_conflicts = float('inf')
        best_min_distance = 0

        # Search only within [base+3, base+10] minutes by 1-minute steps
        for minutes_offset in range(min_offset, max_offset + 1, step_minutes):
            test_departure = base_departure_dt + timedelta(minutes=minutes_offset)
            conflicts = 0
            min_distance = float('inf')

            # Update ship's timestamps for this candidate departure time
            test_ship = ShipRoute(
                name=new_ship.name,
                ship_id=new_ship.ship_id,
                start=new_ship.start,
                goal=new_ship.goal,
                path=new_ship.path,
                departure_time=test_departure,
                speed_knots=new_ship.speed_knots
            )
            test_ship.calculate_timestamps()

            # Check for conflicts with existing routes
            for existing_ship in existing_ships:
                if not hasattr(existing_ship, 'timestamps') or not existing_ship.timestamps:
                    continue

                # Check if routes overlap in time
                test_start = test_ship.timestamps[0]
                test_end = test_ship.timestamps[-1]
                exist_start = existing_ship.timestamps[0]
                exist_end = existing_ship.timestamps[-1]

                # If time windows don't overlap, skip
                if test_end < exist_start or test_start > exist_end:
                    continue

                # Check minimum distance between ships at various time points
                check_times = []

                # Add critical time points
                check_times.extend([test_start, test_end])

                # Add intermediate time points
                duration = (test_end - test_start).total_seconds() / 60  # minutes
                for t in range(0, int(duration), 10):  # Check every 10 minutes
                    check_times.append(test_start + timedelta(minutes=t))

                for check_time in check_times:
                    test_pos = test_ship.get_position_at_time(check_time)
                    exist_pos = existing_ship.get_position_at_time(check_time)

                    if test_pos and exist_pos:
                        # Calculate distance between ships
                        distance = haversine_distance(test_pos[0], test_pos[1],
                                                     exist_pos[0], exist_pos[1])

                        # Safety distance in nautical miles
                        safety_distance_nm = 0.5  # 500m safety buffer

                        if distance < safety_distance_nm:
                            conflicts += 1

                        min_distance = min(min_distance, distance)

            # Select time with minimum conflicts and maximum minimum distance
            if conflicts < min_conflicts or (conflicts == min_conflicts and min_distance > best_min_distance):
                min_conflicts = conflicts
                # Return value is minutes-from-now; base + offset relative to now
                best_time = base_departure_minutes + minutes_offset
                best_min_distance = min_distance

        return float(best_time)