#!/usr/bin/env python3
"""
Enhanced Collision Avoidance System V4 with Fixed Departure Time Mode
- Includes both 수용 O (flexible time) and 수용 X (fixed time) modes
- Fixed time mode: keeps departure time, adjusts path only
"""

import json
import numpy as np
import heapq
from shapely.geometry import Polygon, Point, LineString
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.patches import Circle
from PIL import Image
import os
from typing import List, Tuple, Optional, Dict
import random
from dataclasses import dataclass
import copy


# Real-world mapping configuration
PIXEL_TO_METERS = 10.0  # 1 pixel = 10 meters (adjust based on actual map scale)
METERS_TO_NAUTICAL_MILES = 1 / 1852.0  # 1 nautical mile = 1852 meters
PIXEL_TO_NM = PIXEL_TO_METERS * METERS_TO_NAUTICAL_MILES  # pixels to nautical miles


@dataclass
class ShipRoute:
    """Ship route with timing information"""
    name: str
    start: Tuple[float, float]
    goal: Tuple[float, float]
    path: List[Tuple[float, float]]
    departure_time: float  # in minutes
    speed_knots: float  # speed in knots (nautical miles per hour)
    color: str
    path_length_pixels: float = 0
    path_length_nm: float = 0  # nautical miles
    timestamps: List[float] = None

    @property
    def speed_pixels_per_minute(self):
        """Convert knots to pixels per minute"""
        # knots -> nautical miles per hour -> nautical miles per minute
        nm_per_minute = self.speed_knots / 60.0
        # nautical miles per minute -> pixels per minute
        return nm_per_minute / PIXEL_TO_NM

    def calculate_timestamps(self):
        """Calculate timestamps for each point in path"""
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
        """Get ship position at specific time"""
        if not self.path or not self.timestamps:
            return None

        if time < self.timestamps[0]:
            return None  # Not departed yet

        if time >= self.timestamps[-1]:
            return self.path[-1]  # Already arrived

        # Find segment at this time
        for i in range(len(self.timestamps) - 1):
            if self.timestamps[i] <= time < self.timestamps[i + 1]:
                # Interpolate position
                t_ratio = (time - self.timestamps[i]) / (self.timestamps[i + 1] - self.timestamps[i])
                x = self.path[i][0] + t_ratio * (self.path[i + 1][0] - self.path[i][0])
                y = self.path[i][1] + t_ratio * (self.path[i + 1][1] - self.path[i][1])
                return (x, y)

        return self.path[-1]


class CollisionChecker:
    """Check collisions between ships"""

    def __init__(self, safety_distance_nm: float = 0.5):
        """
        Args:
            safety_distance_nm: Minimum safe distance in nautical miles
        """
        self.safety_distance_nm = safety_distance_nm
        self.safety_distance_pixels = safety_distance_nm / PIXEL_TO_NM

    def check_collision(self, ship1: ShipRoute, ship2: ShipRoute,
                       time_step: float = 0.5) -> List[Tuple[float, float]]:
        """Check collision intervals between two ships"""
        if not ship1.timestamps or not ship2.timestamps:
            return []

        # Get time overlap
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
    """Adjust paths to avoid collisions"""

    def __init__(self, grid_width: int, grid_height: int, grid_size: int,
                 obstacles_polygons: List[Polygon]):
        self.grid_width = grid_width
        self.grid_height = grid_height
        self.grid_size = grid_size
        self.obstacles_polygons = obstacles_polygons

        # Create grid from obstacles
        self.grid = np.zeros((grid_height, grid_width), dtype=int)
        self._mark_obstacles()

    def _mark_obstacles(self):
        """Mark obstacles in grid"""
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
        """Find alternative path avoiding other ships at given time"""
        # Convert nautical miles to pixels
        avoidance_radius_pixels = avoidance_radius_nm / PIXEL_TO_NM

        # Create temporary obstacles from other ships' positions at check_time
        temp_obstacles = set()
        for ship in existing_ships:
            pos = ship.get_position_at_time(check_time)
            if pos:
                # Mark area around ship as obstacle
                gx, gy = int(pos[0] / self.grid_size), int(pos[1] / self.grid_size)
                radius_cells = int(avoidance_radius_pixels / self.grid_size)
                for dx in range(-radius_cells, radius_cells + 1):
                    for dy in range(-radius_cells, radius_cells + 1):
                        nx, ny = gx + dx, gy + dy
                        if 0 <= nx < self.grid_width and 0 <= ny < self.grid_height:
                            if dx*dx + dy*dy <= radius_cells*radius_cells:
                                temp_obstacles.add((nx, ny))

        # Find path with A*
        return self._astar_with_temp_obstacles(start, goal, temp_obstacles)

    def _astar_with_temp_obstacles(self, start: Tuple[float, float], goal: Tuple[float, float],
                                  temp_obstacles: set) -> Optional[List[Tuple[float, float]]]:
        """A* pathfinding with temporary obstacles"""
        start_grid = (int(start[0] / self.grid_size), int(start[1] / self.grid_size))
        goal_grid = (int(goal[0] / self.grid_size), int(goal[1] / self.grid_size))

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
                # Reconstruct path
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

            # Explore neighbors
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
        """Smooth path by removing unnecessary points"""
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


class ImprovedCostOptimizer:
    """Optimize with improved cost function considering speed"""

    def __init__(self, collision_checker: CollisionChecker, path_adjuster: PathAdjuster):
        self.collision_checker = collision_checker
        self.path_adjuster = path_adjuster

    def calculate_unified_cost(self, ship: ShipRoute, new_departure: float,
                              new_path: List[Tuple[float, float]], original_path: List[Tuple[float, float]],
                              original_departure: float) -> float:
        """
        Calculate unified cost in TIME (minutes)

        Total Cost = Departure Delay + Detour Time Equivalent

        Where:
        - Departure Delay = |new_departure - original_departure|
        - Detour Time = Additional Distance / Speed
        """
        # Time delay cost (in minutes)
        departure_delay = abs(new_departure - original_departure)

        # Calculate path lengths
        original_length_pixels = self._calculate_path_length(original_path)
        new_length_pixels = self._calculate_path_length(new_path)

        # Additional distance in pixels
        additional_distance_pixels = max(0, new_length_pixels - original_length_pixels)

        # Convert additional distance to time (minutes)
        # Time = Distance / Speed
        detour_time_minutes = additional_distance_pixels / ship.speed_pixels_per_minute

        # Total cost in minutes
        total_cost_minutes = departure_delay + detour_time_minutes

        return total_cost_minutes

    def optimize_ship_fixed_time(self, new_ship: ShipRoute, existing_ships: List[ShipRoute]) -> List[Tuple[float, float]]:
        """Find optimal path for ship with FIXED departure time (수용 X mode)"""
        original_path = new_ship.path
        best_path = original_path
        min_detour = float('inf')

        print(f"\n   Fixed-time optimization for {new_ship.name}...")
        print(f"   Departure time: {new_ship.departure_time:.1f} min (FIXED)")
        print(f"   Speed: {new_ship.speed_knots} knots")

        # Check if original path has collision
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
            print(f"   ✅ No collision with original path - no detour needed")
            return original_path

        # Need to find alternative path
        print(f"   ⚠️ Collision detected, finding alternative path...")
        for ship_name, interval in collision_info:
            print(f"      Collision with {ship_name}: t=[{interval[0]:.1f}, {interval[1]:.1f}]")

        # Try different avoidance strategies
        solutions = []

        # Try multiple time points for avoidance
        check_times = []
        for _, interval in collision_info:
            check_times.append((interval[0] + interval[1]) / 2)  # Mid collision time

        # Also check some general time points
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
                    # Test alternative path
                    test_ship.path = alt_path
                    test_ship.path_length_pixels = self._calculate_path_length(alt_path)
                    test_ship.calculate_timestamps()

                    # Check if alternative path avoids collision
                    still_collides = False
                    for other_ship in existing_ships:
                        collisions = self.collision_checker.check_collision(test_ship, other_ship)
                        if collisions:
                            still_collides = True
                            break

                    if not still_collides:
                        # Calculate detour cost (in nautical miles)
                        original_length = self._calculate_path_length(original_path)
                        alt_length = self._calculate_path_length(alt_path)
                        detour_nm = (alt_length - original_length) * PIXEL_TO_NM

                        solutions.append((detour_nm, alt_path, avoidance_radius_nm))

        # Find best solution (minimum detour)
        if solutions:
            solutions.sort(key=lambda x: x[0])
            min_detour, best_path, best_radius = solutions[0]

            print(f"\n   Found {len(solutions)} collision-free alternative paths")
            print(f"   Best solution: detour={min_detour:.2f} nm (radius={best_radius:.2f} nm)")

            # Show top 3 solutions
            print("\n   Top alternative paths:")
            for i, (detour, _, radius) in enumerate(solutions[:3]):
                print(f"   {i+1}. Detour: {detour:.2f} nm (avoidance radius={radius:.2f} nm)")
        else:
            print("   ❌ No collision-free path found with fixed departure time!")
            print("   Returning original path (collision risk remains)")

        return best_path

    def optimize_ship(self, new_ship: ShipRoute, existing_ships: List[ShipRoute],
                     time_window: Tuple[float, float] = (-30, 120)) -> Tuple[float, List[Tuple[float, float]]]:
        """Find optimal departure time and path for new ship (수용 O mode)"""
        original_departure = new_ship.departure_time
        original_path = new_ship.path

        best_time = original_departure
        best_path = original_path
        best_cost = float('inf')

        # Store all viable solutions
        solutions = []

        print(f"\n   Testing solutions for {new_ship.name} (speed: {new_ship.speed_knots} knots)...")

        # Try different departure times
        for time_offset in np.arange(time_window[0], time_window[1], 2):
            test_time = original_departure + time_offset
            if test_time < 0:
                continue

            # Test with original path first
            test_ship = copy.deepcopy(new_ship)
            test_ship.departure_time = test_time
            test_ship.calculate_timestamps()

            # Check collisions with original path
            has_collision = False
            collision_times = []

            for other_ship in existing_ships:
                collisions = self.collision_checker.check_collision(test_ship, other_ship)
                if collisions:
                    has_collision = True
                    for interval in collisions:
                        collision_times.append((interval[0] + interval[1]) / 2)

            if not has_collision:
                # No collision with original path
                cost = self.calculate_unified_cost(
                    new_ship, test_time, original_path, original_path, original_departure
                )
                solutions.append((cost, test_time, original_path, "original path"))

            # Try alternative paths
            for avoidance_factor in [0.3, 0.5, 0.7, 1.0]:
                avoidance_radius_nm = 0.5 * avoidance_factor  # in nautical miles
                alt_path = self.path_adjuster.find_alternative_path(
                    new_ship.start, new_ship.goal, existing_ships,
                    test_time + 50,  # Check at mid-journey time
                    avoidance_radius_nm=avoidance_radius_nm
                )

                if alt_path and alt_path != original_path:
                    # Test alternative path
                    test_ship.path = alt_path
                    test_ship.path_length_pixels = self._calculate_path_length(alt_path)
                    test_ship.calculate_timestamps()

                    # Check if alternative path avoids collision
                    still_collides = False
                    for other_ship in existing_ships:
                        collisions = self.collision_checker.check_collision(test_ship, other_ship)
                        if collisions:
                            still_collides = True
                            break

                    if not still_collides:
                        # Calculate unified cost
                        cost = self.calculate_unified_cost(
                            new_ship, test_time, alt_path, original_path, original_departure
                        )
                        solutions.append((cost, test_time, alt_path,
                                        f"alt path (radius={avoidance_radius_nm:.2f}nm)"))

        # Find best solution
        if solutions:
            solutions.sort(key=lambda x: x[0])
            best_cost, best_time, best_path, path_type = solutions[0]

            print(f"\n   Found {len(solutions)} collision-free solutions")
            print(f"   Best solution: {path_type}, total time cost={best_cost:.1f} minutes")

            # Show top 3 solutions
            print("\n   Top 3 solutions:")
            for i, (cost, time, path, ptype) in enumerate(solutions[:3]):
                path_len = self._calculate_path_length(path)
                path_len_nm = path_len * PIXEL_TO_NM
                print(f"   {i+1}. t={time:.0f}, path={path_len_nm:.2f}nm, cost={cost:.1f}min ({ptype})")
        else:
            print("   Warning: No collision-free solution found")

        return best_time, best_path

    def _calculate_path_length(self, path: List[Tuple[float, float]]) -> float:
        if not path or len(path) < 2:
            return 0

        length = 0
        for i in range(len(path) - 1):
            length += np.sqrt((path[i+1][0] - path[i][0])**2 +
                            (path[i+1][1] - path[i][1])**2)
        return length


def load_obstacles_from_json(json_file):
    """Load obstacles from JSON file"""
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    obstacles = []
    for item in data:
        polygon = item['polygon']
        obstacles.append(polygon)

    return obstacles


def get_base_ship_paths():
    """Get base paths for Ship A and B using multi-ship pathfinder"""
    from multi_ship_pathfinder import MultiShipPathfinder, load_obstacles_from_json

    # Load obstacles
    obstacles = load_obstacles_from_json('guryongpo_obstacles_drawn.json')

    # Initialize pathfinder
    pathfinder = MultiShipPathfinder(width=2000, height=1400, grid_size=20, safety_buffer=30)
    pathfinder.add_obstacles(obstacles)

    # Add Ship A
    ship_a = pathfinder.add_ship("Ship A", start=(594, 593), goal=(1726, 976), color='blue')

    # Add Ship B
    ship_b = pathfinder.add_ship("Ship B", start=(875, 400), goal=(1750, 600), color='green')

    # Find paths
    pathfinder.find_all_paths()

    return ship_a, ship_b, pathfinder.obstacles_polygons


def run_fixed_time_scenario(ship_c: ShipRoute, existing_ships: List[ShipRoute],
                           collision_checker: CollisionChecker, path_adjuster: PathAdjuster,
                           obstacles_polygons: List[Polygon]):
    """Run fixed departure time scenario (수용 X mode)"""
    print("\n" + "="*60)
    print("FIXED DEPARTURE TIME MODE (수용 X)")
    print("Ship refuses to change departure time")
    print("="*60)

    # Create optimizer
    optimizer = ImprovedCostOptimizer(collision_checker, path_adjuster)

    # Save original path
    original_path = ship_c.path.copy()
    original_path_length_nm = ship_c.path_length_nm

    # Optimize with fixed time
    optimal_path = optimizer.optimize_ship_fixed_time(ship_c, existing_ships)

    # Update Ship C with new path
    ship_c.path = optimal_path
    ship_c.path_length_pixels = optimizer._calculate_path_length(optimal_path)
    ship_c.path_length_nm = ship_c.path_length_pixels * PIXEL_TO_NM
    ship_c.calculate_timestamps()

    print(f"\n   Fixed-time optimization results:")
    print(f"   Departure time: {ship_c.departure_time:.1f} minutes (UNCHANGED)")
    print(f"   Original path: {original_path_length_nm:.2f} nm")
    print(f"   Optimized path: {ship_c.path_length_nm:.2f} nm")
    print(f"   Detour distance: {ship_c.path_length_nm - original_path_length_nm:.2f} nm")
    print(f"   Extra travel time: {(ship_c.path_length_nm - original_path_length_nm) / (ship_c.speed_knots / 60):.1f} minutes")

    # Final collision check
    print("\n   Final collision check (Fixed-time mode):")
    all_ships = existing_ships + [ship_c]

    has_collision = False
    for i, ship1 in enumerate(all_ships):
        for j, ship2 in enumerate(all_ships):
            if i < j:
                collisions = collision_checker.check_collision(ship1, ship2)
                if collisions:
                    print(f"   ⚠️ Collision: {ship1.name} - {ship2.name}")
                    has_collision = True
                else:
                    print(f"   ✅ Safe: {ship1.name} - {ship2.name}")

    if not has_collision:
        print("\n   🎉 All collisions avoided with path adjustment only!")

    return ship_c, original_path


def main():
    print("="*60)
    print("Collision Avoidance V4 - With Fixed Time Mode")
    print("="*60)
    print(f"\nScale Configuration:")
    print(f"  1 pixel = {PIXEL_TO_METERS} meters")
    print(f"  1 pixel = {PIXEL_TO_NM:.4f} nautical miles")

    # 1. Get base paths
    print("\n1. Loading base paths...")
    ship_a_base, ship_b_base, obstacles_polygons = get_base_ship_paths()

    # Create ShipRoute objects with realistic speeds
    # Ship A: Faster ship (15 knots)
    ship_a = ShipRoute(
        name="Ship A",
        start=ship_a_base.start,
        goal=ship_a_base.goal,
        path=ship_a_base.path,
        departure_time=0,
        speed_knots=15.0,  # 15 knots
        color='blue'
    )
    ship_a.path_length_pixels = sum(
        np.sqrt((ship_a.path[i+1][0] - ship_a.path[i][0])**2 +
               (ship_a.path[i+1][1] - ship_a.path[i][1])**2)
        for i in range(len(ship_a.path) - 1)
    )
    ship_a.path_length_nm = ship_a.path_length_pixels * PIXEL_TO_NM
    ship_a.calculate_timestamps()
    print(f"   Ship A: {ship_a.speed_knots} knots, path: {ship_a.path_length_nm:.2f} nm")

    # Ship B: Slower ship (10 knots)
    ship_b = ShipRoute(
        name="Ship B",
        start=ship_b_base.start,
        goal=ship_b_base.goal,
        path=ship_b_base.path,
        departure_time=50,
        speed_knots=12.0,  # 10 knots
        color='green'
    )
    ship_b.path_length_pixels = sum(
        np.sqrt((ship_b.path[i+1][0] - ship_b.path[i][0])**2 +
               (ship_b.path[i+1][1] - ship_b.path[i][1])**2)
        for i in range(len(ship_b.path) - 1)
    )
    ship_b.path_length_nm = ship_b.path_length_pixels * PIXEL_TO_NM
    ship_b.calculate_timestamps()
    print(f"   Ship B: {ship_b.speed_knots} knots, path: {ship_b.path_length_nm:.2f} nm")

    # 2. Create Ship C (opposite to A with offset)
    print("\n2. Creating Ship C (opposite to Ship A)...")
    ship_c_start = (ship_a.goal[0] - 100, ship_a.goal[1] + 100)
    ship_c_goal = (ship_a.start[0] + 100, ship_a.start[1] - 100)

    # Initialize components
    collision_checker = CollisionChecker(safety_distance_nm=0.5)  # 0.5 nautical miles
    grid_width = 2000 // 20 + 1
    grid_height = 1400 // 20 + 1
    path_adjuster = PathAdjuster(grid_width, grid_height, 20, obstacles_polygons)

    # Find initial path for Ship C
    initial_path = path_adjuster._astar_with_temp_obstacles(ship_c_start, ship_c_goal, set())

    if not initial_path:
        print("   Failed to find initial path for Ship C")
        return

    # Save original path for comparison
    original_c_path = initial_path.copy()

    # Ship C: Medium speed (12 knots)
    ship_c = ShipRoute(
        name="Ship C",
        start=ship_c_start,
        goal=ship_c_goal,
        path=initial_path,
        departure_time=0,  # Requested departure same as Ship A
        speed_knots=12.0,  # 12 knots
        color='red'
    )
    ship_c.path_length_pixels = sum(
        np.sqrt((ship_c.path[i+1][0] - ship_c.path[i][0])**2 +
               (ship_c.path[i+1][1] - ship_c.path[i][1])**2)
        for i in range(len(ship_c.path) - 1)
    )
    ship_c.path_length_nm = ship_c.path_length_pixels * PIXEL_TO_NM
    ship_c.calculate_timestamps()

    print(f"   Ship C: {ship_c.speed_knots} knots")
    print(f"   Initial path: {ship_c.path_length_nm:.2f} nm")
    print(f"   Requested departure: t={ship_c.departure_time}")

    # 3. Check initial collision possibility
    print("\n3. Checking initial collision possibilities...")
    existing_ships = [ship_a, ship_b]

    for other_ship in existing_ships:
        collisions = collision_checker.check_collision(ship_c, other_ship)
        if collisions:
            print(f"   ⚠️ Collision with {other_ship.name}:")
            for interval in collisions:
                print(f"      t=[{interval[0]:.1f}, {interval[1]:.1f}] minutes")
        else:
            print(f"   ✅ No collision with {other_ship.name}")

    # 4. Choose optimization mode
    print("\n4. Choose optimization mode:")
    print("   1. Flexible departure time (수용 O) - System recommends optimal time")
    print("   2. Fixed departure time (수용 X) - Keep original time, adjust path only")

    # For demonstration, we'll run both modes
    mode = input("\n   Select mode (1 or 2, default=1): ").strip() or "1"

    if mode == "2":
        # Fixed time mode (수용 X)
        ship_c_fixed, original_path_fixed = run_fixed_time_scenario(
            copy.deepcopy(ship_c), existing_ships, collision_checker,
            path_adjuster, obstacles_polygons
        )

        # Update ship_c with fixed-time results
        optimal_time = ship_c.departure_time  # Keep original time
        optimal_path = ship_c_fixed.path
    else:
        # Flexible time mode (수용 O)
        print("\n" + "="*60)
        print("FLEXIBLE DEPARTURE TIME MODE (수용 O)")
        print("System recommends optimal departure time")
        print("="*60)

        optimizer = ImprovedCostOptimizer(collision_checker, path_adjuster)
        optimal_time, optimal_path = optimizer.optimize_ship(ship_c, existing_ships)

    # Update Ship C
    original_departure = ship_c.departure_time
    original_path_length_nm = ship_c.path_length_nm

    ship_c.departure_time = optimal_time
    ship_c.path = optimal_path
    ship_c.path_length_pixels = sum(
        np.sqrt((optimal_path[i+1][0] - optimal_path[i][0])**2 +
               (optimal_path[i+1][1] - optimal_path[i][1])**2)
        for i in range(len(optimal_path) - 1)
    )
    ship_c.path_length_nm = ship_c.path_length_pixels * PIXEL_TO_NM
    ship_c.calculate_timestamps()

    print(f"\n   Optimization results:")
    print(f"   Original departure: t={original_departure}")
    print(f"   Optimized departure: t={optimal_time}")
    print(f"   Time adjustment: {optimal_time - original_departure:.1f} minutes")
    print(f"   Original path: {original_path_length_nm:.2f} nm")
    print(f"   Optimized path: {ship_c.path_length_nm:.2f} nm")
    print(f"   Path difference: {ship_c.path_length_nm - original_path_length_nm:.2f} nm")

    # Calculate unified cost
    detour_time = (ship_c.path_length_nm - original_path_length_nm) / (ship_c.speed_knots / 60)
    total_time_cost = abs(optimal_time - original_departure) + detour_time
    print(f"   Total time cost: {total_time_cost:.1f} minutes")

    # 5. Final collision check
    print("\n5. Final collision check...")
    all_ships = [ship_a, ship_b, ship_c]

    has_collision = False
    for i, ship1 in enumerate(all_ships):
        for j, ship2 in enumerate(all_ships):
            if i < j:
                collisions = collision_checker.check_collision(ship1, ship2)
                if collisions:
                    print(f"   ⚠️ Collision: {ship1.name} - {ship2.name}")
                    has_collision = True
                else:
                    print(f"   ✅ Safe: {ship1.name} - {ship2.name}")

    if not has_collision:
        print("\n   🎉 All collisions successfully avoided!")

    print("\n" + "="*60)
    print("Complete!")
    print("="*60)


if __name__ == "__main__":
    main()