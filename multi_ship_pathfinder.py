#!/usr/bin/env python3
"""
Multi-Ship A* Pathfinding System
Supports N ships with different start and goal positions
"""

import json
import numpy as np
import heapq
from shapely.geometry import Polygon, Point, LineString
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from PIL import Image
import os
from typing import List, Tuple, Optional, Dict
import random


class Ship:
    """Represents a single ship with its route"""
    def __init__(self, name: str, start: Tuple[float, float], goal: Tuple[float, float], color: str = None):
        self.name = name
        self.start = start
        self.goal = goal
        self.path = None
        self.color = color or self._random_color()
        self.path_length = 0

    def _random_color(self):
        """Generate random color for ship visualization"""
        colors = ['blue', 'green', 'red', 'purple', 'orange', 'brown', 'pink', 'cyan']
        return random.choice(colors)


class MultiShipPathfinder:
    """Grid-based A* pathfinding for multiple ships"""

    def __init__(self, width: int, height: int, grid_size: int = 10, safety_buffer: int = 30):
        """
        Args:
            width: Map width (pixels)
            height: Map height (pixels)
            grid_size: Grid cell size (pixels)
            safety_buffer: Safety distance from obstacles (pixels)
        """
        self.width = width
        self.height = height
        self.grid_size = grid_size
        self.safety_buffer = safety_buffer

        # Calculate grid dimensions
        self.grid_width = width // grid_size + 1
        self.grid_height = height // grid_size + 1

        # Initialize grid (0: free space, 1: obstacle)
        self.grid = np.zeros((self.grid_height, self.grid_width), dtype=int)
        self.obstacles_polygons = []
        self.ships = []

    def add_obstacles(self, obstacles: List[List[Tuple[float, float]]]):
        """Add obstacles to grid with safety buffer"""
        self.obstacles_polygons = []

        for obstacle in obstacles:
            # Create Shapely polygon
            if len(obstacle) < 3:
                continue

            # Close polygon if not closed
            if obstacle[0] != obstacle[-1]:
                obstacle = obstacle + [obstacle[0]]

            poly = Polygon(obstacle[:-1])  # Exclude last duplicate point

            # Apply safety buffer
            buffered_poly = poly.buffer(self.safety_buffer)
            self.obstacles_polygons.append(buffered_poly)

            # Get bounding box of BUFFERED polygon
            minx, miny, maxx, maxy = buffered_poly.bounds

            # Convert to grid coordinates
            min_gx = max(0, int(minx / self.grid_size) - 1)
            min_gy = max(0, int(miny / self.grid_size) - 1)
            max_gx = min(self.grid_width - 1, int(maxx / self.grid_size) + 1)
            max_gy = min(self.grid_height - 1, int(maxy / self.grid_size) + 1)

            # Check each grid cell in range
            for gy in range(min_gy, max_gy + 1):
                for gx in range(min_gx, max_gx + 1):
                    px = gx * self.grid_size
                    py = gy * self.grid_size

                    cell_center = Point(px, py)

                    # Also check 4 corner points of cell
                    half_size = self.grid_size / 2
                    corners = [
                        (px - half_size, py - half_size),
                        (px + half_size, py - half_size),
                        (px + half_size, py + half_size),
                        (px - half_size, py + half_size)
                    ]

                    # Mark as obstacle if center or any corner is inside buffered polygon
                    if buffered_poly.contains(cell_center) or buffered_poly.distance(cell_center) < self.grid_size * 0.7:
                        self.grid[gy, gx] = 1
                    else:
                        for corner in corners:
                            if buffered_poly.contains(Point(corner)):
                                self.grid[gy, gx] = 1
                                break

    def add_ship(self, name: str, start: Tuple[float, float], goal: Tuple[float, float], color: str = None):
        """Add a ship to the pathfinder"""
        ship = Ship(name, start, goal, color)
        self.ships.append(ship)
        return ship

    def pixel_to_grid(self, x: float, y: float) -> Tuple[int, int]:
        """Convert pixel coordinates to grid coordinates"""
        gx = int(x / self.grid_size)
        gy = int(y / self.grid_size)
        return (gx, gy)

    def grid_to_pixel(self, gx: int, gy: int) -> Tuple[float, float]:
        """Convert grid coordinates to pixel coordinates"""
        px = gx * self.grid_size
        py = gy * self.grid_size
        return (px, py)

    def heuristic(self, a: Tuple[int, int], b: Tuple[int, int]) -> float:
        """Heuristic function (Euclidean distance)"""
        return np.sqrt((a[0] - b[0])**2 + (a[1] - b[1])**2)

    def get_neighbors(self, pos: Tuple[int, int]) -> List[Tuple[int, int]]:
        """Get 8-directional neighbors"""
        gx, gy = pos
        neighbors = []

        for dx in [-1, 0, 1]:
            for dy in [-1, 0, 1]:
                if dx == 0 and dy == 0:
                    continue

                nx, ny = gx + dx, gy + dy

                if 0 <= nx < self.grid_width and 0 <= ny < self.grid_height:
                    if self.grid[ny, nx] == 0:
                        neighbors.append((nx, ny))

        return neighbors

    def find_path_for_ship(self, ship: Ship) -> Optional[List[Tuple[float, float]]]:
        """Find path for a single ship using A*"""
        start = ship.start
        goal = ship.goal

        # Convert to grid coordinates
        start_grid = self.pixel_to_grid(start[0], start[1])
        goal_grid = self.pixel_to_grid(goal[0], goal[1])

        # Check if start or goal is inside obstacle
        if self.grid[start_grid[1], start_grid[0]] == 1:
            print(f"⚠️ Ship '{ship.name}' start point is inside obstacle: {start}")
            start_grid = self.find_nearest_free_cell(start_grid)
            if start_grid is None:
                return None
            new_start = self.grid_to_pixel(start_grid[0], start_grid[1])
            print(f"   Adjusted start: {new_start}")

        if self.grid[goal_grid[1], goal_grid[0]] == 1:
            print(f"⚠️ Ship '{ship.name}' goal point is inside obstacle: {goal}")
            goal_grid = self.find_nearest_free_cell(goal_grid)
            if goal_grid is None:
                return None
            new_goal = self.grid_to_pixel(goal_grid[0], goal_grid[1])
            print(f"   Adjusted goal: {new_goal}")

        # A* algorithm
        open_set = []
        heapq.heappush(open_set, (0, start_grid))

        came_from = {}
        g_score = {start_grid: 0}
        f_score = {start_grid: self.heuristic(start_grid, goal_grid)}

        visited = set()

        while open_set:
            current = heapq.heappop(open_set)[1]

            if current in visited:
                continue
            visited.add(current)

            # Goal reached
            if current == goal_grid:
                # Reconstruct path
                path = []
                while current in came_from:
                    px, py = self.grid_to_pixel(current[0], current[1])
                    path.append((px, py))
                    current = came_from[current]
                px, py = self.grid_to_pixel(start_grid[0], start_grid[1])
                path.append((px, py))
                path.reverse()

                # Adjust endpoints
                if len(path) > 0:
                    path[-1] = goal
                    path[0] = start

                return self.smooth_path(path)

            # Explore neighbors
            for neighbor in self.get_neighbors(current):
                if neighbor in visited:
                    continue

                # Diagonal moves cost more
                dx = abs(neighbor[0] - current[0])
                dy = abs(neighbor[1] - current[1])
                move_cost = np.sqrt(2) if (dx == 1 and dy == 1) else 1

                tentative_g = g_score[current] + move_cost

                if neighbor not in g_score or tentative_g < g_score[neighbor]:
                    came_from[neighbor] = current
                    g_score[neighbor] = tentative_g
                    f_score[neighbor] = tentative_g + self.heuristic(neighbor, goal_grid)
                    heapq.heappush(open_set, (f_score[neighbor], neighbor))

        print(f"No path found for ship '{ship.name}'")
        return None

    def find_nearest_free_cell(self, pos: Tuple[int, int]) -> Optional[Tuple[int, int]]:
        """Find nearest free cell"""
        gx, gy = pos

        for radius in range(1, max(self.grid_width, self.grid_height)):
            for dx in range(-radius, radius + 1):
                for dy in range(-radius, radius + 1):
                    if abs(dx) != radius and abs(dy) != radius:
                        continue

                    nx, ny = gx + dx, gy + dy

                    if 0 <= nx < self.grid_width and 0 <= ny < self.grid_height:
                        if self.grid[ny, nx] == 0:
                            return (nx, ny)

        return None

    def smooth_path(self, path: List[Tuple[float, float]]) -> List[Tuple[float, float]]:
        """Smooth path by removing unnecessary points"""
        if len(path) <= 2:
            return path

        smoothed = [path[0]]
        i = 0

        while i < len(path) - 1:
            for j in range(len(path) - 1, i, -1):
                if self.is_path_clear(path[i], path[j]):
                    smoothed.append(path[j])
                    i = j
                    break
            else:
                i += 1
                if i < len(path):
                    smoothed.append(path[i])

        return smoothed

    def is_path_clear(self, start: Tuple[float, float], end: Tuple[float, float]) -> bool:
        """Check if direct path between two points is clear"""
        line = LineString([start, end])

        for poly in self.obstacles_polygons:
            if line.intersects(poly):
                return False

        return True

    def find_all_paths(self):
        """Find paths for all ships"""
        for ship in self.ships:
            print(f"\nFinding path for ship '{ship.name}': {ship.start} → {ship.goal}")
            path = self.find_path_for_ship(ship)

            if path:
                ship.path = path
                # Calculate path length
                ship.path_length = sum(
                    np.sqrt((path[i+1][0] - path[i][0])**2 + (path[i+1][1] - path[i][1])**2)
                    for i in range(len(path) - 1)
                )
                print(f"   ✅ Path found: {len(path)} points, length: {ship.path_length:.2f} pixels")
            else:
                print(f"   ❌ No path found")


def load_obstacles_from_json(json_file):
    """Load obstacles from JSON file"""
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    obstacles = []
    for item in data:
        polygon = item['polygon']
        obstacles.append(polygon)

    return obstacles


def visualize_multi_ship_paths(pathfinder, background_image=None):
    """Visualize paths for multiple ships"""
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(20, 10))

    # Left: Grid map
    ax1.imshow(pathfinder.grid, cmap='gray_r', origin='lower',
               extent=[0, pathfinder.width, 0, pathfinder.height])
    ax1.set_title('Multi-Ship Grid Map', fontsize=14)
    ax1.set_xlabel('X (pixels)')
    ax1.set_ylabel('Y (pixels)')

    # Right: Actual paths
    if background_image and os.path.exists(background_image):
        img = Image.open(background_image)
        ax2.imshow(img, extent=[0, img.width, img.height, 0], alpha=0.3)
        ax2.set_xlim(0, img.width)
        ax2.set_ylim(img.height, 0)

    # Draw obstacles with buffer
    for poly in pathfinder.obstacles_polygons:
        x, y = poly.exterior.xy
        ax2.fill(x, y, 'red', alpha=0.3, edgecolor='darkred', linewidth=1)

    # Draw paths for each ship
    for ship in pathfinder.ships:
        if ship.path:
            x_coords = [p[0] for p in ship.path]
            y_coords = [p[1] for p in ship.path]

            # Show path on grid map
            ax1.plot(x_coords, y_coords, color=ship.color, linewidth=2, alpha=0.8)
            ax1.plot(ship.start[0], ship.start[1], 'o', color=ship.color, markersize=10)
            ax1.plot(ship.goal[0], ship.goal[1], 's', color=ship.color, markersize=10)

            # Show path on actual map
            ax2.plot(x_coords, y_coords, color=ship.color, linewidth=3, alpha=0.8,
                    label=f'{ship.name}: {ship.path_length:.0f}px')
            ax2.plot(x_coords, y_coords, 'o', color=ship.color, markersize=3, alpha=0.6)

            # Start and goal markers
            ax2.plot(ship.start[0], ship.start[1], 'o', color=ship.color, markersize=12,
                    markeredgecolor='black', markeredgewidth=2)
            ax2.plot(ship.goal[0], ship.goal[1], 's', color=ship.color, markersize=12,
                    markeredgecolor='black', markeredgewidth=2)

            # Add ship name at start point
            ax2.text(ship.start[0], ship.start[1] - 30, ship.name,
                    fontsize=10, ha='center', weight='bold',
                    bbox=dict(boxstyle='round', facecolor=ship.color, alpha=0.7, edgecolor='black'))

    ax2.set_title('Multi-Ship Pathfinding Results', fontsize=14)
    ax2.set_xlabel('X (pixels)')
    ax2.set_ylabel('Y (pixels)')
    ax2.legend(loc='upper right')
    ax2.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig('multi_ship_pathfinding.png', dpi=150, bbox_inches='tight')
    print("\nResult image saved: multi_ship_pathfinding.png")


def main():
    # Settings
    json_file = 'guryongpo_obstacles_drawn.json'
    background_image = 'nn.png'

    print("="*60)
    print("Multi-Ship A* Pathfinding System")
    print("="*60)

    # 1. Load obstacles
    print("\n1. Loading obstacles...")
    obstacles = load_obstacles_from_json(json_file)
    print(f"   {len(obstacles)} obstacles loaded")

    # 2. Initialize pathfinder
    print("\n2. Initializing multi-ship pathfinder...")
    pathfinder = MultiShipPathfinder(width=2000, height=1400, grid_size=20, safety_buffer=30)
    pathfinder.add_obstacles(obstacles)
    print(f"   Grid size: {pathfinder.grid_width} x {pathfinder.grid_height}")
    print(f"   Obstacle cells: {np.sum(pathfinder.grid)}")
    print(f"   Safety buffer: {pathfinder.safety_buffer} pixels")

    # 3. Add ships
    print("\n3. Adding ships...")

    # Ship 1: Original ship
    pathfinder.add_ship("Ship A", start=(594, 593), goal=(1726, 976), color='blue')
    print(f"   Added Ship A: (594, 593) → (1726, 976)")

    # Ship 2: New ship
    pathfinder.add_ship("Ship B", start=(875, 400), goal=(1750, 600), color='green')
    print(f"   Added Ship B: (875, 400) → (1750, 600)")

    # You can add more ships here
    # pathfinder.add_ship("Ship C", start=(x1, y1), goal=(x2, y2), color='purple')

    print(f"   Total ships: {len(pathfinder.ships)}")

    # 4. Find paths for all ships
    print("\n4. Finding paths for all ships...")
    pathfinder.find_all_paths()

    # 5. Display results
    print("\n5. Path Summary:")
    print("-" * 40)
    for ship in pathfinder.ships:
        if ship.path:
            direct_dist = np.sqrt((ship.goal[0] - ship.start[0])**2 +
                                (ship.goal[1] - ship.start[1])**2)
            detour_ratio = ship.path_length / direct_dist
            print(f"{ship.name}:")
            print(f"   Route: {ship.start} → {ship.goal}")
            print(f"   Points: {len(ship.path)}")
            print(f"   Length: {ship.path_length:.2f} pixels")
            print(f"   Direct: {direct_dist:.2f} pixels")
            print(f"   Detour: {detour_ratio:.2f}x")
        else:
            print(f"{ship.name}: No path found")
    print("-" * 40)

    # 6. Visualization
    print("\n6. Creating visualization...")
    visualize_multi_ship_paths(pathfinder, background_image)

    print("\n" + "="*60)
    print("Complete!")
    print("="*60)


if __name__ == "__main__":
    main()