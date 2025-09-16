# 🚢 Awesome Ship Navigator

Advanced Ship Navigation System with Collision Avoidance

## 🚀 빠른 실행 가이드 (Quick Start Guide)

### Backend 실행 방법
```bash
# 1. 터미널 열기
# 2. 프로젝트 루트 디렉토리로 이동
cd awesome-ship-navigator

# 3. Python 가상환경 활성화 (이미 설치되어 있다면)
source venv/bin/activate  # Mac/Linux
# 또는
venv\Scripts\activate  # Windows

# 4. 가상환경이 없다면 생성
python3 -m venv venv
source venv/bin/activate

# 5. 필수 패키지 설치 (처음 한 번만)
pip install -r requirements.txt

# 6. Backend 서버 실행
python app.py

# 서버가 http://localhost:8000 에서 실행됩니다
# API 문서 확인: http://localhost:8000/docs
```

### Frontend 실행 방법
```bash
# 1. 새로운 터미널 창 열기
# 2. frontend 디렉토리로 이동
cd awesome-ship-navigator/frontend

# 3. Node.js 패키지 설치 (처음 한 번만)
npm install

# 4. Frontend 개발 서버 실행
npm start

# 브라우저가 자동으로 http://localhost:3000 을 엽니다
# 지도와 선박 관리 UI를 볼 수 있습니다
```

### 주요 기능
- 🗺️ **실시간 선박 위치 모니터링**: EUM API 연동
- 🎤 **음성 챗봇**: 한국어 음성 인식 지원
- 📍 **경로 계획**: 충돌 회피 알고리즘 적용
- ⏰ **두 가지 모드**:
  - 수용 O (Flexible): 시스템 추천 시간
  - 수용 X (Fixed): 사용자 지정 시간

## Overview

A comprehensive ship navigation system that combines A* pathfinding with intelligent collision avoidance. The system optimizes both departure times and routes to prevent collisions while minimizing total travel time.

## ✨ Key Features

### Core Navigation
- **A* Grid-based Pathfinding**: Reliable obstacle avoidance with safety buffers
- **Multi-Ship Support**: Simultaneous path planning for multiple vessels
- **Path Smoothing**: Optimized waypoints for cleaner routes

### Advanced Collision Avoidance (v4) ⭐
- **Smart Optimization**: Compares departure delay vs route detour costs
- **Unified Cost Function**: All costs measured in time (minutes)
- **Real-world Units**: Speed in knots, distance in nautical miles
- **Multi-solution Analysis**: Tests 30+ solutions to find optimal strategy

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/stpcoder/awesome-ship-navigator.git
cd awesome-ship-navigator

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### Usage

#### Basic Pathfinding (Single Ship)
```bash
python astar_pathfinder.py
```

#### Multiple Ships
```bash
python multi_ship_pathfinder.py
```

#### Collision Avoidance System (Recommended) ⭐
```bash
python collision_avoidance_v4.py
```

## 📊 Collision Avoidance Algorithm

### How It Works

1. **Collision Detection**
   - Safety distance: 0.5 nautical miles
   - Time-based position tracking
   - Interval-based collision prediction

2. **Cost Optimization**
   ```
   Total Cost (minutes) = Departure Delay + Detour Time
   Detour Time = Additional Distance (nm) / Speed (knots) × 60
   ```

3. **Solution Strategy**
   - Tests departure times from -30 to +120 minutes
   - Generates alternative paths with varying avoidance radii
   - Selects solution with minimum total time cost

### Real-world Scale
- 1 pixel = 10 meters = 0.0054 nautical miles
- Safety distance = 0.5 nautical miles (≈93 pixels)

## 📈 Example Scenario

### Ship Configuration
- **Ship A**: 15 knots, departs at t=0
- **Ship B**: 10 knots, departs at t=50
- **Ship C**: 12 knots, requests t=0 → auto-adjusted to avoid collision

### Results
- Initial collision detected: t=[14.5, 17.0] minutes
- Optimal solution: Delay Ship C by 20 minutes
- Total cost: 20 minutes (no route change needed)
- All collisions successfully avoided! 🎉

## 📸 Results & Analysis

### Main Results Dashboard
![Collision Avoidance Results](collision_avoidance_v4.png)

The system successfully coordinates 3 ships with different speeds:
- **Left panel**: Ship paths with departure times
- **Right panels**: Time-space diagram, speed comparison, and summary

### Path Comparison Over Time
![Path Comparison](path_comparison_v4.png)

Shows Ship C's position at different time points (t=0, 10, 15, 20, 30, 40):
- Blue/Green circles: Safety zones around Ships A & B
- Red paths: Ship C's original vs optimized route
- Result: No route change needed, only time adjustment

### Collision Detail Analysis
![Collision Detail](collision_detail_v4.png)

Detailed view of the avoided collision:
- Red X: Where collision would have occurred at t=15.75
- Distance: Ships would have been only ~40 pixels apart (under 0.5nm safety limit)
- Solution: 20-minute delay moves Ship C out of collision timeframe

## 🛠️ Technical Architecture

### Core Components

```python
# Unified cost function
def calculate_unified_cost(ship, new_departure, new_path):
    departure_delay = abs(new_departure - original_departure)
    detour_time = additional_distance / ship.speed_pixels_per_minute
    return departure_delay + detour_time
```

### Output Visualizations

When running `collision_avoidance_v4.py`, three visualizations are generated:

1. **collision_avoidance_v4.png**: Main results with paths and metrics
2. **path_comparison_v4.png**: Time-series comparison of paths
3. **collision_detail_v4.png**: Detailed collision scenario analysis

## 📁 Project Structure

```
awesome-ship-navigator/
│
├── collision_avoidance_v4.py        # ⭐ Advanced collision avoidance
├── multi_ship_pathfinder.py         # Multi-ship basic navigation
├── astar_pathfinder.py              # Single ship pathfinding
├── guryongpo_obstacles_drawn.json   # Harbor obstacle data
├── nn.png                           # Background map
├── requirements.txt                 # Dependencies
└── README.md                        # This file
```

## 🎯 Use Cases

- **Harbor Traffic Management**: Coordinate multiple vessels in busy ports
- **Autonomous Navigation**: Smart path planning for unmanned vessels
- **Schedule Optimization**: Minimize waiting times and fuel consumption
- **Collision Prevention**: Proactive conflict resolution

## 📊 Performance Metrics

- **Computation Time**: <2 seconds for 3-ship scenario
- **Solution Quality**: Finds optimal time-based solution
- **Success Rate**: 100% collision avoidance in tests
- **Scalability**: Handles 10+ ships simultaneously

## ⚠️ Current Limitations

- Static obstacles only (islands, reefs)
- 2D navigation (no depth consideration)
- Uniform speed during journey
- No weather/current factors yet

## 🚧 Roadmap

- [ ] Dynamic obstacle support (moving vessels)
- [ ] Real-time replanning capabilities
- [ ] Weather and current integration
- [ ] 3D navigation for submarines
- [ ] Web-based control interface
- [ ] AIS data integration

## 📝 Key Insights

### Why Time Delay Over Route Change?

The optimizer tested **34 different solutions** and found:
1. **20-min delay only**: Total cost = 20.0 minutes ✅ (Selected)
2. **22-min delay + 0.18nm detour**: Total cost = 22.9 minutes
3. **Other combinations**: All cost more than 20 minutes

**Conclusion**: For short collision windows (2.5 minutes), waiting is more efficient than detouring.

The system intelligently chooses between:
- **Time delay**: Wait before departure
- **Route change**: Take a longer path
- **Combined approach**: Both delay and detour

This demonstrates the power of unified cost function - converting all factors to time enables fair comparison.

## 🤝 Contributing

Issues and Pull Requests welcome! Please ensure all tests pass before submitting.

## 📜 License

MIT License

---

**Version**: 4.0 | **Last Updated**: December 2024 | **Status**: Production Ready