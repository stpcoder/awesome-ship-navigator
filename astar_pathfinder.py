#!/usr/bin/env python3
"""
A* 알고리즘을 사용한 장애물 회피 경로 찾기
Grid 기반 접근법으로 더 안정적인 경로 생성
"""

import json
import numpy as np
import heapq
from shapely.geometry import Polygon, Point, LineString
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from PIL import Image
import os
from typing import List, Tuple, Optional


class AStarPathfinder:
    """Grid-based A* pathfinding"""

    def __init__(self, width: int, height: int, grid_size: int = 10, safety_buffer: int = 50):
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
        self.safety_buffer = safety_buffer  # 50 pixels safety margin

        # Calculate grid dimensions
        self.grid_width = width // grid_size + 1
        self.grid_height = height // grid_size + 1

        # Initialize grid (0: free space, 1: obstacle)
        self.grid = np.zeros((self.grid_height, self.grid_width), dtype=int)
        self.obstacles_polygons = []

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

            # Apply safety buffer (50 pixels expansion)
            buffered_poly = poly.buffer(self.safety_buffer)
            self.obstacles_polygons.append(buffered_poly)

            # Get bounding box of BUFFERED polygon
            minx, miny, maxx, maxy = buffered_poly.bounds

            # Convert to grid coordinates (with extra margin)
            min_gx = max(0, int(minx / self.grid_size) - 1)
            min_gy = max(0, int(miny / self.grid_size) - 1)
            max_gx = min(self.grid_width - 1, int(maxx / self.grid_size) + 1)
            max_gy = min(self.grid_height - 1, int(maxy / self.grid_size) + 1)

            # Check each grid cell in range
            for gy in range(min_gy, max_gy + 1):
                for gx in range(min_gx, max_gx + 1):
                    # Grid cell center point
                    px = gx * self.grid_size
                    py = gy * self.grid_size

                    # Check if cell overlaps with buffered polygon
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

    def pixel_to_grid(self, x: float, y: float) -> Tuple[int, int]:
        """픽셀 좌표를 그리드 좌표로 변환"""
        gx = int(x / self.grid_size)
        gy = int(y / self.grid_size)
        return (gx, gy)

    def grid_to_pixel(self, gx: int, gy: int) -> Tuple[float, float]:
        """그리드 좌표를 픽셀 좌표로 변환"""
        px = gx * self.grid_size
        py = gy * self.grid_size
        return (px, py)

    def heuristic(self, a: Tuple[int, int], b: Tuple[int, int]) -> float:
        """휴리스틱 함수 (유클리드 거리)"""
        return np.sqrt((a[0] - b[0])**2 + (a[1] - b[1])**2)

    def get_neighbors(self, pos: Tuple[int, int]) -> List[Tuple[int, int]]:
        """8방향 이웃 노드 반환"""
        gx, gy = pos
        neighbors = []

        # 8방향 (상하좌우 + 대각선)
        for dx in [-1, 0, 1]:
            for dy in [-1, 0, 1]:
                if dx == 0 and dy == 0:
                    continue

                nx, ny = gx + dx, gy + dy

                # 범위 확인
                if 0 <= nx < self.grid_width and 0 <= ny < self.grid_height:
                    # 장애물이 아닌 경우만
                    if self.grid[ny, nx] == 0:
                        neighbors.append((nx, ny))

        return neighbors

    def find_path(self, start: Tuple[float, float], goal: Tuple[float, float]) -> Optional[List[Tuple[float, float]]]:
        """A* 알고리즘으로 경로 찾기"""
        # 픽셀 좌표를 그리드 좌표로 변환
        start_grid = self.pixel_to_grid(start[0], start[1])
        goal_grid = self.pixel_to_grid(goal[0], goal[1])

        # Check if start or goal is inside obstacle
        if self.grid[start_grid[1], start_grid[0]] == 1:
            print(f"⚠️ Start point is inside obstacle (with buffer): {start}")
            # Find nearest free space
            start_grid = self.find_nearest_free_cell(start_grid)
            if start_grid is None:
                print("   Cannot find free space near start point")
                return None
            new_start = self.grid_to_pixel(start_grid[0], start_grid[1])
            print(f"   Adjusted start point: {new_start}")

        if self.grid[goal_grid[1], goal_grid[0]] == 1:
            print(f"⚠️ Goal point is inside obstacle (with buffer): {goal}")
            # Find nearest free space
            goal_grid = self.find_nearest_free_cell(goal_grid)
            if goal_grid is None:
                print("   Cannot find free space near goal point")
                return None
            new_goal = self.grid_to_pixel(goal_grid[0], goal_grid[1])
            print(f"   Adjusted goal point: {new_goal}")

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

                # Adjust endpoints to exact positions
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

        print("No path found")
        return None

    def find_nearest_free_cell(self, pos: Tuple[int, int]) -> Optional[Tuple[int, int]]:
        """가장 가까운 빈 셀 찾기"""
        gx, gy = pos

        # 나선형으로 탐색
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
        """경로를 부드럽게 만들기 (불필요한 점 제거)"""
        if len(path) <= 2:
            return path

        smoothed = [path[0]]
        i = 0

        while i < len(path) - 1:
            # 현재 점에서 가능한 한 멀리 직선으로 갈 수 있는 점 찾기
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
        """두 점 사이 경로가 장애물 없이 깨끗한지 확인"""
        line = LineString([start, end])

        for poly in self.obstacles_polygons:
            if line.intersects(poly):
                return False

        return True


def load_obstacles_from_json(json_file):
    """JSON 파일에서 장애물 로드"""
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    obstacles = []
    for item in data:
        polygon = item['polygon']
        obstacles.append(polygon)

    return obstacles


def visualize_astar_path(pathfinder, path, start, goal, background_image=None):
    """Visualize A* path"""
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(20, 10))

    # Left: Grid map
    ax1.imshow(pathfinder.grid, cmap='gray_r', origin='lower',
               extent=[0, pathfinder.width, 0, pathfinder.height])
    ax1.set_title('A* Grid Map', fontsize=14)
    ax1.set_xlabel('X (pixels)')
    ax1.set_ylabel('Y (pixels)')

    # Right: Actual path
    if background_image and os.path.exists(background_image):
        img = Image.open(background_image)
        ax2.imshow(img, extent=[0, img.width, img.height, 0], alpha=0.3)
        ax2.set_xlim(0, img.width)
        ax2.set_ylim(img.height, 0)

    # Draw obstacles with buffer
    for poly in pathfinder.obstacles_polygons:
        x, y = poly.exterior.xy
        ax2.fill(x, y, 'red', alpha=0.5)

    # Draw path
    if path:
        x_coords = [p[0] for p in path]
        y_coords = [p[1] for p in path]

        # Show path on grid map
        ax1.plot(x_coords, y_coords, 'b-', linewidth=2, alpha=0.8)
        ax1.plot(start[0], start[1], 'go', markersize=10)
        ax1.plot(goal[0], goal[1], 'ro', markersize=10)

        # Show path on actual map
        ax2.plot(x_coords, y_coords, 'b-', linewidth=3, alpha=0.8, label='A* Path')
        ax2.plot(x_coords, y_coords, 'bo', markersize=4, alpha=0.6)
        ax2.plot(start[0], start[1], 'go', markersize=12, label=f'Start {start}')
        ax2.plot(goal[0], goal[1], 'ro', markersize=12, label=f'Goal {goal}')

    ax2.set_title('A* Pathfinding Result', fontsize=14)
    ax2.set_xlabel('X (pixels)')
    ax2.set_ylabel('Y (pixels)')
    ax2.legend(loc='upper right')
    ax2.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig('astar_pathfinding_result.png', dpi=150, bbox_inches='tight')
    print("Result image saved: astar_pathfinding_result.png")


def main():
    # Settings
    json_file = 'guryongpo_obstacles_drawn.json'
    background_image = 'nn.png'
    start = (594, 593)
    goal = (1726, 976)

    print("="*60)
    print("A* Algorithm-based Pathfinding with 50px Safety Buffer")
    print("="*60)

    # 1. Load obstacles
    print("\n1. Loading obstacles...")
    obstacles = load_obstacles_from_json(json_file)
    print(f"   {len(obstacles)} obstacles loaded")

    # 2. Initialize A* pathfinder
    print("\n2. Initializing A* pathfinder...")
    pathfinder = AStarPathfinder(width=2000, height=1400, grid_size=20, safety_buffer=30)  # Reduced from 50 to 30
    pathfinder.add_obstacles(obstacles)
    print(f"   Grid size: {pathfinder.grid_width} x {pathfinder.grid_height}")
    print(f"   Obstacle cells: {np.sum(pathfinder.grid)}")
    print(f"   Safety buffer: {pathfinder.safety_buffer} pixels")

    # 3. Find path
    print(f"\n3. Calculating path... {start} → {goal}")
    path = pathfinder.find_path(start, goal)

    if path:
        print(f"   ✅ Path found! {len(path)} points")

        # Calculate path length
        total_length = sum(
            np.sqrt((path[i+1][0] - path[i][0])**2 + (path[i+1][1] - path[i][1])**2)
            for i in range(len(path) - 1)
        )
        direct_distance = np.sqrt((goal[0] - start[0])**2 + (goal[1] - start[1])**2)

        print(f"\n4. Path information:")
        print(f"   - Path points: {len(path)}")
        print(f"   - Total length: {total_length:.2f} pixels")
        print(f"   - Direct distance: {direct_distance:.2f} pixels")
        print(f"   - Detour ratio: {total_length / direct_distance:.2f}x")

        # 5. Visualization
        print("\n5. Creating visualization...")
        visualize_astar_path(pathfinder, path, start, goal, background_image)
    else:
        print("   ❌ No path found")

    print("\n" + "="*60)
    print("Complete!")
    print("="*60)


if __name__ == "__main__":
    main()