"""Core optimization logic from v4"""

import numpy as np
import heapq
from shapely.geometry import Polygon, Point, LineString
from typing import List, Tuple, Optional
import copy
from dataclasses import dataclass


# Real-world mapping configuration
PIXEL_TO_METERS = 10.0
METERS_TO_NAUTICAL_MILES = 1 / 1852.0
PIXEL_TO_NM = PIXEL_TO_METERS * METERS_TO_NAUTICAL_MILES


@dataclass
class ShipRoute:
    """Ship route with timing information"""
    name: str
    ship_id: str
    start: Tuple[float, float]
    goal: Tuple[float, float]
    path: List[Tuple[float, float]]
    departure_time: float
    speed_knots: float
    color: str = 'blue'
    path_length_pixels: float = 0
    path_length_nm: float = 0
    timestamps: List[float] = None

    @property
    def speed_pixels_per_minute(self):
        nm_per_minute = self.speed_knots / 60.0
        return nm_per_minute / PIXEL_TO_NM

    def calculate_timestamps(self):
        if not self.path:
            return

        self.timestamps = [self.departure_time]
        cumulative_time = self.departure_time

        for i in range(len(self.path) - 1):
            distance_pixels = np.sqrt((self.path[i+1][0] - self.path[i][0])**2 +
                                    (self.path[i+1][1] - self.path[i][1])**2)
            travel_time = distance_pixels / self.speed_pixels_per_minute
            cumulative_time += travel_time
            self.timestamps.append(cumulative_time)

    def get_position_at_time(self, time: float) -> Optional[Tuple[float, float]]:
        if not self.path or not self.timestamps:
            return None

        if time < self.timestamps[0]:
            return None

        if time >= self.timestamps[-1]:
            return self.path[-1]

        for i in range(len(self.timestamps) - 1):
            if self.timestamps[i] <= time < self.timestamps[i + 1]:
                t_ratio = (time - self.timestamps[i]) / (self.timestamps[i + 1] - self.timestamps[i])
                x = self.path[i][0] + t_ratio * (self.path[i + 1][0] - self.path[i][0])
                y = self.path[i][1] + t_ratio * (self.path[i + 1][1] - self.path[i][1])
                return (x, y)

        return self.path[-1]

    def get_segment_speeds(self) -> List[float]:
        """Get speed for each path segment"""
        return [self.speed_knots] * (len(self.path) - 1) if self.path else []


class CollisionChecker:
    def __init__(self, safety_distance_nm: float = 0.5):
        self.safety_distance_nm = safety_distance_nm
        self.safety_distance_pixels = safety_distance_nm / PIXEL_TO_NM

    def check_collision(self, ship1: ShipRoute, ship2: ShipRoute,
                       time_step: float = 0.5) -> List[Tuple[float, float]]:
        if not ship1.timestamps or not ship2.timestamps:
            return []

        start_time = max(ship1.departure_time, ship2.departure_time)
        end_time = min(ship1.timestamps[-1], ship2.timestamps[-1])

        if start_time >= end_time:
            return []

        collision_intervals = []
        in_collision = False
        collision_start = None

        t = start_time
        while t <= end_time:
            pos1 = ship1.get_position_at_time(t)
            pos2 = ship2.get_position_at_time(t)

            if pos1 and pos2:
                distance_pixels = np.sqrt((pos1[0] - pos2[0])**2 + (pos1[1] - pos2[1])**2)
                is_collision = distance_pixels < self.safety_distance_pixels

                if is_collision and not in_collision:
                    collision_start = t
                    in_collision = True
                elif not is_collision and in_collision:
                    collision_intervals.append((collision_start, t))
                    in_collision = False

            t += time_step

        if in_collision:
            collision_intervals.append((collision_start, end_time))

        return collision_intervals


class PathAdjuster:
    def __init__(self, grid_width: int, grid_height: int, grid_size: int,
                 obstacles_polygons: List[Polygon]):
        self.grid_width = grid_width
        self.grid_height = grid_height
        self.grid_size = grid_size
        self.obstacles_polygons = obstacles_polygons
        self.grid = np.zeros((grid_height, grid_width), dtype=int)
        self._mark_obstacles()

    def _mark_obstacles(self):
        for poly in self.obstacles_polygons:
            minx, miny, maxx, maxy = poly.bounds
            min_gx = max(0, int(minx / self.grid_size) - 1)
            min_gy = max(0, int(miny / self.grid_size) - 1)
            max_gx = min(self.grid_width - 1, int(maxx / self.grid_size) + 1)
            max_gy = min(self.grid_height - 1, int(maxy / self.grid_size) + 1)

            for gy in range(min_gy, max_gy + 1):
                for gx in range(min_gx, max_gx + 1):
                    px = gx * self.grid_size
                    py = gy * self.grid_size
                    if poly.contains(Point(px, py)) or poly.distance(Point(px, py)) < self.grid_size * 0.7:
                        self.grid[gy, gx] = 1

    def find_alternative_path(self, start: Tuple[float, float], goal: Tuple[float, float],
                            existing_ships: List[ShipRoute], check_time: float,
                            avoidance_radius_nm: float = 0.5) -> Optional[List[Tuple[float, float]]]:
        avoidance_radius_pixels = avoidance_radius_nm / PIXEL_TO_NM
        temp_obstacles = set()

        for ship in existing_ships:
            pos = ship.get_position_at_time(check_time)
            if pos:
                gx, gy = int(pos[0] / self.grid_size), int(pos[1] / self.grid_size)
                radius_cells = int(avoidance_radius_pixels / self.grid_size)
                for dx in range(-radius_cells, radius_cells + 1):
                    for dy in range(-radius_cells, radius_cells + 1):
                        nx, ny = gx + dx, gy + dy
                        if 0 <= nx < self.grid_width and 0 <= ny < self.grid_height:
                            if dx*dx + dy*dy <= radius_cells*radius_cells:
                                temp_obstacles.add((nx, ny))

        return self._astar_with_temp_obstacles(start, goal, temp_obstacles)

    def find_initial_path(self, start: Tuple[float, float], goal: Tuple[float, float]) -> Optional[List[Tuple[float, float]]]:
        """Find initial path avoiding only static obstacles"""
        return self._astar_with_temp_obstacles(start, goal, set())

    def _astar_with_temp_obstacles(self, start: Tuple[float, float], goal: Tuple[float, float],
                                  temp_obstacles: set) -> Optional[List[Tuple[float, float]]]:
        start_grid = (int(start[0] / self.grid_size), int(start[1] / self.grid_size))
        goal_grid = (int(goal[0] / self.grid_size), int(goal[1] / self.grid_size))

        # Check if start or goal is outside grid bounds
        start_out_of_bounds = (start_grid[0] < 0 or start_grid[0] >= self.grid_width or
                               start_grid[1] < 0 or start_grid[1] >= self.grid_height)
        goal_out_of_bounds = (goal_grid[0] < 0 or goal_grid[0] >= self.grid_width or
                              goal_grid[1] < 0 or goal_grid[1] >= self.grid_height)

        # If both points are out of bounds, return direct path
        if start_out_of_bounds and goal_out_of_bounds:
            return [start, goal]

        # If only one point is out of bounds, we still need to handle it
        if start_out_of_bounds or goal_out_of_bounds:
            # For now, return a direct path if any point is outside
            # In the future, could find entry/exit points to the grid
            return [start, goal]

        if self.grid[start_grid[1], start_grid[0]] == 1:
            return None
        if self.grid[goal_grid[1], goal_grid[0]] == 1:
            return None

        open_set = []
        heapq.heappush(open_set, (0, start_grid))

        came_from = {}
        g_score = {start_grid: 0}
        f_score = {start_grid: self._heuristic(start_grid, goal_grid)}

        visited = set()

        while open_set:
            current = heapq.heappop(open_set)[1]

            if current in visited:
                continue
            visited.add(current)

            if current == goal_grid:
                path = []
                while current in came_from:
                    px = current[0] * self.grid_size
                    py = current[1] * self.grid_size
                    path.append((px, py))
                    current = came_from[current]
                path.append(start)
                path.reverse()
                path[-1] = goal
                return self._smooth_path(path)

            for neighbor in self._get_neighbors(current, temp_obstacles):
                if neighbor in visited:
                    continue

                dx = abs(neighbor[0] - current[0])
                dy = abs(neighbor[1] - current[1])
                move_cost = np.sqrt(2) if (dx == 1 and dy == 1) else 1

                tentative_g = g_score[current] + move_cost

                if neighbor not in g_score or tentative_g < g_score[neighbor]:
                    came_from[neighbor] = current
                    g_score[neighbor] = tentative_g
                    f_score[neighbor] = tentative_g + self._heuristic(neighbor, goal_grid)
                    heapq.heappush(open_set, (f_score[neighbor], neighbor))

        return None

    def _heuristic(self, a: Tuple[int, int], b: Tuple[int, int]) -> float:
        return np.sqrt((a[0] - b[0])**2 + (a[1] - b[1])**2)

    def _get_neighbors(self, pos: Tuple[int, int], temp_obstacles: set) -> List[Tuple[int, int]]:
        gx, gy = pos
        neighbors = []

        for dx in [-1, 0, 1]:
            for dy in [-1, 0, 1]:
                if dx == 0 and dy == 0:
                    continue

                nx, ny = gx + dx, gy + dy

                if 0 <= nx < self.grid_width and 0 <= ny < self.grid_height:
                    if self.grid[ny, nx] == 0 and (nx, ny) not in temp_obstacles:
                        neighbors.append((nx, ny))

        return neighbors

    def _smooth_path(self, path: List[Tuple[float, float]]) -> List[Tuple[float, float]]:
        if len(path) <= 2:
            return path

        smoothed = [path[0]]
        i = 0

        while i < len(path) - 1:
            for j in range(len(path) - 1, i, -1):
                if self._is_path_clear(path[i], path[j]):
                    smoothed.append(path[j])
                    i = j
                    break
            else:
                i += 1
                if i < len(path):
                    smoothed.append(path[i])

        return smoothed

    def _is_path_clear(self, start: Tuple[float, float], end: Tuple[float, float]) -> bool:
        line = LineString([start, end])
        for poly in self.obstacles_polygons:
            if line.intersects(poly):
                return False
        return True


class RouteOptimizer:
    def __init__(self, collision_checker: CollisionChecker, path_adjuster: PathAdjuster):
        self.collision_checker = collision_checker
        self.path_adjuster = path_adjuster

    def calculate_path_length(self, path: List[Tuple[float, float]]) -> float:
        if not path or len(path) < 2:
            return 0

        length = 0
        for i in range(len(path) - 1):
            length += np.sqrt((path[i+1][0] - path[i][0])**2 +
                            (path[i+1][1] - path[i][1])**2)
        return length

    def optimize_flexible_time(self, new_ship: ShipRoute, existing_ships: List[ShipRoute],
                               time_window: Tuple[float, float] = (-30, 120)) -> Tuple[float, List[Tuple[float, float]]]:
        """Optimize with flexible departure time (수용 O)"""
        original_departure = new_ship.departure_time
        original_path = new_ship.path

        best_time = original_departure
        best_path = original_path
        best_cost = float('inf')

        solutions = []

        for time_offset in np.arange(time_window[0], time_window[1], 2):
            test_time = original_departure + time_offset
            if test_time < 0:
                continue

            test_ship = copy.deepcopy(new_ship)
            test_ship.departure_time = test_time
            test_ship.calculate_timestamps()

            has_collision = False
            for other_ship in existing_ships:
                collisions = self.collision_checker.check_collision(test_ship, other_ship)
                if collisions:
                    has_collision = True
                    break

            if not has_collision:
                cost = abs(test_time - original_departure)
                solutions.append((cost, test_time, original_path, "original path"))

            for avoidance_factor in [0.3, 0.5, 0.7, 1.0]:
                avoidance_radius_nm = 0.5 * avoidance_factor
                alt_path = self.path_adjuster.find_alternative_path(
                    new_ship.start, new_ship.goal, existing_ships,
                    test_time + 50, avoidance_radius_nm=avoidance_radius_nm
                )

                if alt_path and alt_path != original_path:
                    test_ship.path = alt_path
                    test_ship.path_length_pixels = self.calculate_path_length(alt_path)
                    test_ship.calculate_timestamps()

                    still_collides = False
                    for other_ship in existing_ships:
                        collisions = self.collision_checker.check_collision(test_ship, other_ship)
                        if collisions:
                            still_collides = True
                            break

                    if not still_collides:
                        departure_delay = abs(test_time - original_departure)
                        original_length = self.calculate_path_length(original_path)
                        alt_length = self.calculate_path_length(alt_path)
                        detour_time = (alt_length - original_length) / new_ship.speed_pixels_per_minute
                        cost = departure_delay + detour_time
                        solutions.append((cost, test_time, alt_path, f"alt path"))

        if solutions:
            solutions.sort(key=lambda x: x[0])
            best_cost, best_time, best_path, _ = solutions[0]

        return best_time, best_path

    def optimize_fixed_time(self, new_ship: ShipRoute, existing_ships: List[ShipRoute]) -> List[Tuple[float, float]]:
        """Optimize with fixed departure time (수용 X)"""
        original_path = new_ship.path
        best_path = original_path

        test_ship = copy.deepcopy(new_ship)
        test_ship.calculate_timestamps()

        has_collision = False
        collision_info = []

        for other_ship in existing_ships:
            collisions = self.collision_checker.check_collision(test_ship, other_ship)
            if collisions:
                has_collision = True
                for interval in collisions:
                    collision_info.append((other_ship.name, interval))

        if not has_collision:
            return original_path

        solutions = []
        check_times = []

        for _, interval in collision_info:
            check_times.append((interval[0] + interval[1]) / 2)

        journey_duration = test_ship.timestamps[-1] - test_ship.departure_time if test_ship.timestamps else 60
        check_times.extend([
            new_ship.departure_time + journey_duration * 0.25,
            new_ship.departure_time + journey_duration * 0.5,
            new_ship.departure_time + journey_duration * 0.75
        ])

        for check_time in check_times:
            for avoidance_factor in [0.6, 0.8, 1.0, 1.2, 1.5]:
                avoidance_radius_nm = 0.5 * avoidance_factor

                alt_path = self.path_adjuster.find_alternative_path(
                    new_ship.start, new_ship.goal, existing_ships,
                    check_time, avoidance_radius_nm=avoidance_radius_nm
                )

                if alt_path and alt_path != original_path:
                    test_ship.path = alt_path
                    test_ship.path_length_pixels = self.calculate_path_length(alt_path)
                    test_ship.calculate_timestamps()

                    still_collides = False
                    for other_ship in existing_ships:
                        collisions = self.collision_checker.check_collision(test_ship, other_ship)
                        if collisions:
                            still_collides = True
                            break

                    if not still_collides:
                        original_length = self.calculate_path_length(original_path)
                        alt_length = self.calculate_path_length(alt_path)
                        detour_nm = (alt_length - original_length) * PIXEL_TO_NM
                        solutions.append((detour_nm, alt_path))

        if solutions:
            solutions.sort(key=lambda x: x[0])
            _, best_path = solutions[0]

        return best_path